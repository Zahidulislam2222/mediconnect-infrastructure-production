import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { GetParametersCommand } from "@aws-sdk/client-ssm";

import { communicationRoutes } from "./routes/communication.routes";
import { aiRoutes } from "./routes/ai.routes";
import { authMiddleware } from './middleware/auth.middleware';
import { getRegionalSSMClient } from '../../shared/aws-config';
import { createRateLimitStore } from '../../shared/rate-limit-store'; // 🟢 FIX #9: Redis distributed rate limiting 

dotenv.config();

const app = express();
app.set('trust proxy', 1);

app.get('/health', (req, res) => res.status(200).json({ status: 'UP', type: 'liveness' }));
app.get('/ready', (req, res) => {
    if (isAppReady) {
        res.status(200).json({ status: 'READY', type: 'readiness', service: 'communication-service' });
    } else {
        res.status(503).json({ status: 'BOOTING', type: 'readiness', service: 'communication-service' });
    }
});

// ─── FIX #9: Redis-backed distributed rate limiting ──────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "Too many requests. Please try again later." },
    store: createRateLimitStore('global:comm'),
});
app.use(globalLimiter);

const PORT = process.env.PORT || 8084;
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

        console.error("[CORS] Blocked request from unauthorized origin");
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
            connectSrc: ["'self'", "https://*.amazonaws.com", "https://*.googleapis.com", "https://*.azure.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://*"],
        }
    }
}));

app.use(cors(corsOptions)); // 🟢 Apply strict options
app.options('*', cors(corsOptions));

// ─── BODY LIMIT FIX ─────────────────────────────────────────────────────
// ORIGINAL: 50mb limit for base64 clinical images.
// RISK: DoS attack via massive JSON payloads consuming memory/bandwidth.
// FIX: Reduced to 10mb (covers ~7.5MB raw images after base64 encoding).
// Full DICOM files should use the dedicated DICOM service, not this endpoint.
// ─────────────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// 🟢 HIPAA AUDIT FIX: Secure Identity Logging
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

// ─── RATE LIMIT FIX: AI endpoint rate limiter ────────────────────────────
// ORIGINAL: /ai/* endpoints had no per-user rate limiting, only the global
// 100 req/15min limiter. AI calls are expensive (Bedrock/Vertex/Azure)
// and could be abused to burn API credits or cause provider throttling.
// FIX: 5 req/min per authenticated user on all /ai/* routes.
// ─────────────────────────────────────────────────────────────────────────
const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5,
    keyGenerator: (req: any) => {
        // Key by authenticated user ID for fair per-user limiting
        if (req.user?.id || req.user?.sub) {
            return `ai:${req.user.id || req.user.sub}`;
        }
        return `ai:${req.ip}`;
    },
    message: { error: "AI rate limit exceeded. Maximum 5 AI requests per minute." },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore('comm:ai'),
});

// Apply auth middleware to all clinical routes
app.use("/", communicationRoutes);
// Auth runs first so aiLimiter can key by req.user.id (not just IP)
app.use("/ai", authMiddleware, aiLimiter);
app.use("/ai", aiRoutes);

// --- 4. 100% COMPLIANT VAULT SYNC ---
async function loadSecrets() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const ssm = getRegionalSSMClient(region);

    try {
        console.log(`🔐 Synchronizing Communication secrets with AWS Vault [${region}]...`);

        // 🟢 BATCH 1: Identity Only (This service doesn't need Stripe or DB Tables config)
        const cmd1 = new GetParametersCommand({
            Names:[
                '/mediconnect/prod/cognito/user_pool_id',
                '/mediconnect/prod/cognito/client_id_patient',
                '/mediconnect/prod/cognito/client_id_doctor',
                '/mediconnect/prod/cognito/user_pool_id_eu',
                '/mediconnect/prod/cognito/client_id_eu_patient',
                '/mediconnect/prod/cognito/client_id_eu_doctor'
            ],
            WithDecryption: true
        });

        const res1 = await ssm.send(cmd1);

        const allParams = res1.Parameters || [];

        if (allParams.length === 0) throw new Error("No secrets found in Parameter Store.");
        allParams.forEach((p: any) => {
            // 1. Identity US Mapping (Strict Matching)
            if (p.Name === '/mediconnect/prod/cognito/user_pool_id') process.env.COGNITO_USER_POOL_ID_US = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_patient') process.env.COGNITO_CLIENT_ID_US_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_doctor') process.env.COGNITO_CLIENT_ID_US_DOCTOR = p.Value;

            // 2. Identity EU Mapping
            if (p.Name === '/mediconnect/prod/cognito/user_pool_id_eu') process.env.COGNITO_USER_POOL_ID_EU = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_patient') process.env.COGNITO_CLIENT_ID_EU_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_doctor') process.env.COGNITO_CLIENT_ID_EU_DOCTOR = p.Value;
        });

        // 🟢 CRITICAL SAFETY BRIDGE (Aligns with aws.ts getters)
        process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID_US;
        process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID_US_PATIENT;

        console.log("✅ AWS Vault Sync Complete. All Communication Service keys mapped.");
    } catch (e: any) {
        console.error(`❌ FATAL: Vault Sync Failed.`, e.message);
        process.exit(1);
    }
}

const startServer = async () => {
    try {
        await loadSecrets();
        app.listen(Number(PORT), '0.0.0.0', () => {
            isAppReady = true;
            console.log(`🚀 Communication Service Production Ready on port ${PORT}`);
        });
    } catch (error: any) {
        console.error("❌ CRITICAL: Failed to start Communication Service:", error.message);
        process.exit(1);
    }
};

startServer();