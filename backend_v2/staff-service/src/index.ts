/**
 * MediConnect Staff Service
 * ==========================
 * Internal staff scheduling, task management, and coordination.
 * - Shift scheduling and management
 * - Internal task assignment and tracking
 * - Staff directory and availability
 * - Internal announcements
 *
 * Port: 8086
 * Auth: Cognito JWT (staff/admin group required)
 * Pattern: Matches booking-service architecture
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { GetParametersCommand } from "@aws-sdk/client-ssm";

import staffRoutes from './routes/staff.routes';
import { getRegionalSSMClient } from '../../shared/aws-config';
import { createRateLimitStore } from '../../shared/rate-limit-store';
import { safeLog, safeError } from '../../shared/logger';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

// ─── Health Checks (unauthenticated for K8s probes) ─────────────────────
app.get('/health', (req, res) => res.status(200).json({ status: 'UP', type: 'liveness' }));
app.get('/ready', (req, res) => {
    if (isAppReady) {
        res.status(200).json({ status: 'READY', type: 'readiness', service: 'staff-service' });
    } else {
        res.status(503).json({ status: 'BOOTING', type: 'readiness', service: 'staff-service' });
    }
});

// ─── Rate Limiting (Redis-backed distributed) ───────────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: "System Busy: Please try again later." },
    store: createRateLimitStore('global:staff'),
});
app.use(globalLimiter);

const PORT = process.env.PORT || 8086;
let isAppReady = false;

// ─── CORS Configuration ─────────────────────────────────────────────────
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

// ─── Security Middleware ─────────────────────────────────────────────────
app.use(helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", "https://*.amazonaws.com", "https://*.googleapis.com", "https://*.azure.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://*"],
        }
    }
}));

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '2mb' }));

// ─── HIPAA Audit Logging ────────────────────────────────────────────────
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

// ─── Routes ─────────────────────────────────────────────────────────────
app.use('/', staffRoutes);

app.use('*', (req, res) => {
    res.status(404).json({
        error: "Route Not Found",
        message: `Cannot ${req.method} ${req.originalUrl}`
    });
});

// ─── Vault Sync ─────────────────────────────────────────────────────────
async function loadSecrets() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const ssm = getRegionalSSMClient(region);
    try {
        safeLog(`Synchronizing Staff secrets with AWS Vault [${region}]...`);
        const cmd = new GetParametersCommand({
            Names: [
                '/mediconnect/prod/cognito/user_pool_id',
                '/mediconnect/prod/cognito/client_id_patient',
                '/mediconnect/prod/cognito/client_id_doctor',
                '/mediconnect/prod/cognito/user_pool_id_eu',
                '/mediconnect/prod/cognito/client_id_eu_patient',
                '/mediconnect/prod/cognito/client_id_eu_doctor'
            ],
            WithDecryption: true
        });

        const res = await ssm.send(cmd);
        const allParams = res.Parameters || [];

        allParams.forEach((p: any) => {
            if (p.Name === '/mediconnect/prod/cognito/user_pool_id') process.env.COGNITO_USER_POOL_ID_US = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_patient') process.env.COGNITO_CLIENT_ID_US_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_doctor') process.env.COGNITO_CLIENT_ID_US_DOCTOR = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/user_pool_id_eu') process.env.COGNITO_USER_POOL_ID_EU = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_patient') process.env.COGNITO_CLIENT_ID_EU_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_doctor') process.env.COGNITO_CLIENT_ID_EU_DOCTOR = p.Value;
        });

        process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID_US;
        process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID_US_PATIENT;

        safeLog("Staff Vault Sync Complete.");
    } catch (e: any) {
        safeError("FATAL: Vault Sync Failed.", e.message);
        process.exit(1);
    }
}

// ─── Start Server ───────────────────────────────────────────────────────
const startServer = async () => {
    try {
        await loadSecrets();
        app.listen(Number(PORT), '0.0.0.0', () => {
            isAppReady = true;
            safeLog(`Staff Service Production Ready on port ${PORT}`);
        });
    } catch (error: any) {
        safeError("FATAL: Failed to start Staff Service:", error.message);
        process.exit(1);
    }
};

startServer();
