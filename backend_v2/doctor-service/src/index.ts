import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import doctorRoutes from './routes/doctor.routes';
import clinicalRoutes from "./modules/clinical/clinical.routes";
import rateLimit from 'express-rate-limit';

import { GetParametersCommand } from "@aws-sdk/client-ssm";
import { safeLog, safeError } from '../../shared/logger';
import { getRegionalSSMClient } from './config/aws';

dotenv.config();

const app = express();

// 🟢 FIX 1: Azure Proxy Trust (MUST be before the limiter)
// This solves the 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR' error in your logs
app.set('trust proxy', 1);

// 🟢 SECURITY: DDoS Protection
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { error: "Too many requests. Please try again later." }
});
app.use(globalLimiter);

const PORT = process.env.PORT || 8082;

// --- 1. COMPLIANT CORS ---
const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:5173',
    /\.web\.app$/,
    /\.azurecontainerapps\.io$/
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

app.use(express.json({ limit: '2mb' }));

morgan.token('verified-user', (req: any) => {
    return req.user?.sub ? `User:${req.user.sub}` : 'Unauthenticated';
});

app.use(morgan((tokens, req, res) => {
    return [
        `[AUDIT]`, tokens.method(req, res), tokens.url(req, res),
        tokens.status(req, res), tokens['response-time'](req, res), 'ms',
        tokens['verified-user'](req, res), `IP:${req.ip}`
    ].join(' ');
}, { skip: (req) => req.method === 'OPTIONS' }));

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: 'doctor-service', timestamp: new Date().toISOString() });
});

app.use('/', doctorRoutes);
app.use('/', clinicalRoutes);

// --- 4. SECRETS LOADER ---
async function loadSecrets() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const ssm = getRegionalSSMClient(region);

    try {
        console.log(`🔐 Synchronizing secrets with AWS Vault [${region}]...`);
        const command = new GetParametersCommand({
            Names: [
                '/mediconnect/prod/kms/signing_key_id',
                // US Identity
                '/mediconnect/prod/cognito/client_id_doctor',
                '/mediconnect/prod/cognito/client_id_patient', // 🟢 FIX 2: Added missing Patient ID
                '/mediconnect/prod/cognito/user_pool_id',
                // EU Identity
                '/mediconnect/prod/cognito/user_pool_id_eu',
                '/mediconnect/prod/cognito/client_id_eu_doctor',  // 🟢 Added EU IDs
                '/mediconnect/prod/cognito/client_id_eu_patient', // 🟢 Added EU IDs
                // Shared
                '/mediconnect/prod/db/dynamo_table'
            ],
            WithDecryption: true
        });

        const { Parameters } = await ssm.send(command);
        if (!Parameters || Parameters.length === 0) throw new Error("No secrets found.");

        Parameters.forEach((p: any) => {
            if (p.Name.includes('kms/signing_key_id')) process.env.KMS_KEY_ID = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_doctor') process.env.COGNITO_CLIENT_ID = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_patient') process.env.COGNITO_CLIENT_ID_US_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/user_pool_id') process.env.COGNITO_USER_POOL_ID = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/user_pool_id_eu') process.env.COGNITO_USER_POOL_ID_EU = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_doctor') process.env.COGNITO_CLIENT_ID_EU_DOCTOR = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_patient') process.env.COGNITO_CLIENT_ID_EU_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/db/dynamo_table') process.env.DYNAMO_TABLE = p.Value;
        });

        // Backward compatibility mapping
        if (!process.env.COGNITO_CLIENT_ID_US_DOCTOR) process.env.COGNITO_CLIENT_ID_US_DOCTOR = process.env.COGNITO_CLIENT_ID;

        console.log("✅ AWS Vault Sync Complete.");
    } catch (e: any) {
        safeError(`❌ FATAL: Vault Sync Failed.`, e.message);
        process.exit(1); 
    }
}

const startServer = async () => {
    try {
        await loadSecrets();
        app.use('*', (req, res) => {
    res.status(404).json({ 
        error: "Route Not Found", 
        message: `Cannot ${req.method} ${req.originalUrl}` 
    });
});
        app.listen(Number(PORT), '0.0.0.0', () => {
            safeLog(`🚀 Doctor Service Production Ready on port ${PORT} `);
        });
    } catch (error: any) {
        safeError('❌ FATAL: Application failed to start:', error.message);
        process.exit(1); 
    }
};

startServer();