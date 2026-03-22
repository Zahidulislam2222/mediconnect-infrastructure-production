import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { GetParametersCommand } from "@aws-sdk/client-ssm";

import bookingRoutes from './routes/booking.routes';
import { handleStripeWebhook } from './controllers/webhook.controller';
import { authMiddleware } from './middleware/auth.middleware';
import { getRegionalSSMClient } from '../../shared/aws-config'; // 🟢 REGIONAL FACTORY
import { createRateLimitStore } from '../../shared/rate-limit-store'; // 🟢 FIX #9: Redis distributed rate limiting
import { safeLog, safeError } from '../../shared/logger';

dotenv.config();

const app = express();
app.set('trust proxy', 1); 

app.get('/health', (req, res) => res.status(200).json({ status: 'UP', type: 'liveness' }));
app.get('/ready', (req, res) => {
    if (isAppReady) {
        res.status(200).json({ status: 'READY', type: 'readiness', service: 'booking-service' });
    } else {
        res.status(503).json({ status: 'BOOTING', type: 'readiness', service: 'booking-service' });
    }
});

// ─── FIX #9: All rate limiters now use Redis store when available ─────────
// This ensures rate limits are enforced across all ECS tasks / K8s pods,
// preventing per-instance counter bypass during horizontal scaling.
// Falls back to in-memory store if REDIS_URL is not configured.
// ─────────────────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: "System Busy: Please try again later." },
    store: createRateLimitStore('global:booking'),
});
app.use(globalLimiter);

const bookingLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5,
    keyGenerator: (req: any, res: any) => {
        if (req.user?.id) {
            return req.user.id;
        }

        return ipKeyGenerator(req.ip);
    },
    message: { error: "Fraud Prevention: Too many transactional attempts." },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('booking:txn'),
});

const PORT = process.env.PORT || 8083;
let isAppReady = false;

// --- 1. ENTERPRISE CORS CONFIGURATION ---
const allowedOrigins: string[] = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(url => url.trim()) 
    : [];

const mobileOrigins = [
    'capacitor://localhost',
    'http://localhost',
    'https://localhost'
];

if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://localhost:5173', 'http://localhost:8080');
}

const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
        if (mobileOrigins.indexOf(origin) !== -1) return callback(null, true);

        safeError(`CORS Blocked: ${origin}`);
        callback(new Error('Strict CORS Policy: Origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Secret', 'X-User-ID', 'Prefer', 'If-Match', 'x-user-region']
};

// --- 2. SECURITY MIDDLEWARE ---
app.use(helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", "https://*.amazonaws.com", "https://*.googleapis.com", "https://*.azure.com", "https://*.stripe.com"],
            scriptSrc: ["'self'", "https://*.stripe.com"],
            imgSrc: ["'self'", "data:", "https://*"],
        }
    }
}));

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 🟢 STRIPE WEBHOOK: Must remain raw before express.json
app.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

app.use(express.json({ limit: '2mb' }));

// 🟢 HIPAA AUDIT FIX: Secure Identity Logging (Extracts from JWT, not headers)
morgan.token('verified-user', (req: any) => {
    return req.user?.sub || req.user?.id ? `User:${req.user.sub || req.user.id}` : 'Unauthenticated';
});

app.use(morgan((tokens, req, res) => {
    return [
        `[AUDIT]`, tokens.method(req, res), tokens.url(req, res)?.split('?')[0],
        tokens.status(req, res), tokens['response-time'](req, res), 'ms',
        tokens['verified-user'](req, res), `IP:${req.ip}`
    ].join(' ');
}, { skip: (req) => req.url === '/health' || req.method === 'OPTIONS' }));

app.use('/appointments', bookingLimiter);
app.use('/billing', bookingLimiter);
app.use('/prior-auth', bookingLimiter);
app.use('/eligibility', bookingLimiter);

// ─── RATE LIMIT FIX: Stricter limiter for payment endpoint ──────────────
// ORIGINAL: /billing/pay was only covered by bookingLimiter (5 req/min).
// RISK: Brute-force payment attempts, card testing attacks.
// FIX: Dedicated 2 req/min limiter on /billing/pay per authenticated user.
// This stacks with bookingLimiter — the stricter limit wins.
// ─────────────────────────────────────────────────────────────────────────
const paymentLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 2,
    keyGenerator: (req: any, res: any) => {
        // Key by authenticated user ID (prevents shared IP issues in hospitals)
        if (req.user?.id || req.user?.sub) {
            return `pay:${req.user.id || req.user.sub}`;
        }
        return `pay:${ipKeyGenerator(req.ip)}`;
    },
    message: { error: "Payment rate limit exceeded. Maximum 2 payment attempts per minute." },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('booking:pay'),
});
// Auth runs first so paymentLimiter can key by req.user.id (not just IP)
app.use('/billing/pay', authMiddleware, paymentLimiter);

app.use('/', bookingRoutes);

// --- 4. 100% COMPLIANT VAULT SYNC ---
async function loadSecrets() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const ssm = getRegionalSSMClient(region);
    try {
        safeLog('Synchronizing Booking secrets with AWS Vault...');
        const cmd1 = new GetParametersCommand({
            Names: [
                '/mediconnect/prod/cognito/user_pool_id', '/mediconnect/prod/cognito/client_id_patient', '/mediconnect/prod/cognito/client_id_doctor',
                '/mediconnect/prod/cognito/user_pool_id_eu', '/mediconnect/prod/cognito/client_id_eu_patient', '/mediconnect/prod/cognito/client_id_eu_doctor'
            ],
            WithDecryption: true
        });
        const cmd2 = new GetParametersCommand({
            Names:[
                '/mediconnect/prod/db/patient_table', '/mediconnect/prod/db/doctor_table',
                '/mediconnect/stripe/keys', '/mediconnect/stripe/webhook_secret',
                // 🟢 ADDED MISSING GOOGLE SECRETS
                '/mediconnect/prod/google/client_id',   
                '/mediconnect/prod/google/client_secret'
            ],
            WithDecryption: true
        });
        const [res1, res2] = await Promise.all([ssm.send(cmd1), ssm.send(cmd2)]);
        const allParams = [...(res1.Parameters || []), ...(res2.Parameters ||[])];

        allParams.forEach(p => {
            // Identity US
            if (p.Name === '/mediconnect/prod/cognito/user_pool_id') process.env.COGNITO_USER_POOL_ID_US = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_patient') process.env.COGNITO_CLIENT_ID_US_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_doctor') process.env.COGNITO_CLIENT_ID_US_DOCTOR = p.Value;
            // Identity EU
            if (p.Name === '/mediconnect/prod/cognito/user_pool_id_eu') process.env.COGNITO_USER_POOL_ID_EU = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_patient') process.env.COGNITO_CLIENT_ID_EU_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_doctor') process.env.COGNITO_CLIENT_ID_EU_DOCTOR = p.Value;
            
            if (p.Name === '/mediconnect/prod/db/patient_table') process.env.TABLE_PATIENTS = p.Value;
            if (p.Name === '/mediconnect/prod/db/doctor_table') process.env.TABLE_DOCTORS = p.Value;
            
            // Stripe
            if (p.Name === '/mediconnect/stripe/keys') process.env.STRIPE_SECRET_KEY = p.Value;
            if (p.Name === '/mediconnect/stripe/webhook_secret') process.env.STRIPE_WEBHOOK_SECRET = p.Value;

            // 🟢 GOOGLE MAPPINGS
            if (p.Name === '/mediconnect/prod/google/client_id') process.env.GOOGLE_CLIENT_ID = p.Value;
            if (p.Name === '/mediconnect/prod/google/client_secret') process.env.GOOGLE_CLIENT_SECRET = p.Value;
        });
        // Safety Fallbacks
        process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID_US;
        process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID_US_PATIENT;
        safeLog('Booking Vault Complete.');
    } catch (e: any) { process.exit(1); }
}

const startServer = async () => {
    try {
        await loadSecrets();
        app.listen(Number(PORT), '0.0.0.0', () => {
            isAppReady = true;
            safeLog(`Booking Service Production Ready on port ${PORT}`);
        });
    } catch (error) {
        safeError('FATAL: Failed to start Booking Service:', { error });
        process.exit(1);
    }
};

startServer();