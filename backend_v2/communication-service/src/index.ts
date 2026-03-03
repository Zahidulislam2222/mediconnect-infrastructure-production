import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { GetParametersCommand } from "@aws-sdk/client-ssm";

import { chatController } from "./controllers/chat.controller";
import { videoController } from "./controllers/video.controller";
import { aiRoutes } from "./routes/ai.routes"; 
import { authMiddleware } from './middleware/auth.middleware';
import { getRegionalSSMClient } from "./config/aws"; 

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 8084;
let isAppReady = false;

// 🟢 1. HEALTH CHECKS FIRST (NO LIMIT)
app.get('/health', (req, res) => res.status(200).json({ status: 'UP', type: 'liveness' }));
app.get('/ready', (req, res) => {
    if (isAppReady) {
        res.status(200).json({ status: 'READY', type: 'readiness', service: 'communication-service' });
    } else {
        res.status(503).json({ status: 'BOOTING', type: 'readiness', service: 'communication-service' });
    }
});

// 🟢 2. SECURITY LIMITER SECOND (Applies to all routes BELOW)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { error: "Too many requests. Please try again later." }
});
app.use(globalLimiter);

// --- 1. COMPLIANT CORS ---
const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:5173',
    /\.web\.app$/,
    /\.azurecontainerapps\.io$/,
    /\.run\.app$/
];
if (process.env.FRONTEND_URL) allowedOrigins.push(process.env.FRONTEND_URL);

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

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Secret', 'X-User-ID', 'Prefer', 'If-Match', 'x-user-region']
}));
app.options('*', cors());

// 🟢 High limit required for Base64 Clinical Images
app.use(express.json({ limit: '50mb' })); 

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

// Apply auth middleware to all clinical routes
app.use("/chat", authMiddleware, chatController);
app.use("/video", authMiddleware, videoController);
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