// C:\Dev\mediconnect-project\mediconnect-infrastructure-develop\backend_v2\patient-service\src\index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connect } from 'mqtt';
import { GetParametersCommand } from "@aws-sdk/client-ssm";
import { defaultProvider } from "@aws-sdk/credential-provider-node";

// Shared Utilities
import { safeLog, safeError } from '../../shared/logger';
import { getRegionalSSMClient } from '../../shared/aws-config';
import { getSignedIoTUrl } from './utils/iot-signer'; 

import { handleEmergencyDetection } from './modules/iot/emergency';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { pushVitalToBigQuery } from './modules/iot/vitals';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

// 🟢 1. HEALTH CHECKS (NO LIMITER)
app.get('/health', (req, res) => res.status(200).json({ status: 'UP', type: 'liveness' }));
app.get('/ready', (req, res) => {
    if (isAppReady) {
        res.status(200).json({ status: 'READY', type: 'readiness', service: 'patient-service' });
    } else {
        res.status(503).json({ status: 'BOOTING', type: 'readiness', service: 'patient-service' });
    }
});

// 🟢 2. DDoS Protection
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: "System Busy: Please try again later." }
});
app.use(globalLimiter);

const sensitiveDataLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15, 

    keyGenerator: (req: any, res: any) => {
        if (req.user?.id) {
            return req.user.id;
        }
        return ipKeyGenerator(req, res);
    }, 
    message: { error: "Security Throttling: Too many requests for medical records." },
    standardHeaders: true,
    legacyHeaders: false,
});

const httpServer = createServer(app);
const PORT = process.env.PORT || 8081;
let isAppReady = false;

// --- 1. COMPLIANT CORS ---
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

        safeError(`⛔ CORS Blocked: ${origin}`);
        callback(new Error('Strict CORS Policy: Origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Secret', 'X-User-ID', 'Prefer', 'If-Match', 'x-user-region']
};

const io = new Server(httpServer, {
    cors: corsOptions
});

// --- 2. SECURITY MIDDLEWARE ---
app.use(helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", "https://*.amazonaws.com", "https://*.googleapis.com", "wss://*.amazonaws.com", "https://*.azure.com"],
            imgSrc: ["'self'", "data:", "https://*"],
        }
    }
}));

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// HIPAA Logging
morgan.token('verified-user', (req: any) => {
    return req.user?.id ? `User:${req.user.id}` : 'Unauthenticated';
});
app.use(morgan((tokens, req, res) => {
    return [
        `[AUDIT]`, tokens.method(req, res), tokens.url(req, res),
        tokens.status(req, res), tokens['response-time'](req, res), 'ms',
        tokens['verified-user'](req, res), `IP:${req.ip}`
    ].join(' ');
}, { skip: (req) => req.url === '/health' || req.method === 'OPTIONS' }));

// --- 3. 100% COMPLIANT VAULT SYNC ---
async function loadSecrets() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const ssm = getRegionalSSMClient(region);

    try {
        console.log(`🔐 Synchronizing Patient secrets with AWS Vault [${region}]...`);

        const cmdInfra = new GetParametersCommand({
            Names: [
                '/mediconnect/prod/db/patient_table',
                '/mediconnect/prod/s3/patient_identity_bucket',
                '/mediconnect/prod/mqtt/endpoint',
                '/mediconnect/prod/sns/topic_arn_us',
                '/mediconnect/prod/sns/topic_arn_eu',
            ],
            WithDecryption: true
        });

        const cmdIdentity = new GetParametersCommand({
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

        const [infraRes, identityRes] = await Promise.all([
            ssm.send(cmdInfra),
            ssm.send(cmdIdentity)
        ]);

        const allParams = [...(infraRes.Parameters || []), ...(identityRes.Parameters || [])];

        if (allParams.length === 0) throw new Error("Vault empty.");

        allParams.forEach((p: any) => {
            if (p.Name === '/mediconnect/prod/db/patient_table') process.env.DYNAMO_TABLE = p.Value;
            if (p.Name === '/mediconnect/prod/s3/patient_identity_bucket') process.env.BUCKET_NAME = p.Value;
            if (p.Name === '/mediconnect/prod/mqtt/endpoint') process.env.MQTT_BROKER_URL = p.Value;
            if (p.Name === '/mediconnect/prod/sns/topic_arn_us') process.env.SNS_TOPIC_ARN_US = p.Value;
            if (p.Name === '/mediconnect/prod/sns/topic_arn_eu') process.env.SNS_TOPIC_ARN_EU = p.Value;
            
            if (p.Name === '/mediconnect/prod/cognito/user_pool_id') process.env.COGNITO_USER_POOL_ID_US = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_patient') process.env.COGNITO_CLIENT_ID_US_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_doctor') process.env.COGNITO_CLIENT_ID_US_DOCTOR = p.Value;

            if (p.Name === '/mediconnect/prod/cognito/user_pool_id_eu') process.env.COGNITO_USER_POOL_ID_EU = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_patient') process.env.COGNITO_CLIENT_ID_EU_PATIENT = p.Value;
            if (p.Name === '/mediconnect/prod/cognito/client_id_eu_doctor') process.env.COGNITO_CLIENT_ID_EU_DOCTOR = p.Value;
        });

        if (!process.env.COGNITO_USER_POOL_ID) process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID_US;
        if (!process.env.COGNITO_CLIENT_ID) process.env.COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID_US_PATIENT;

        console.log("✅ AWS Vault Sync Complete.");
    } catch (e: any) {
        safeError(`❌ FATAL: Vault Sync Failed.`, e.message);
        process.exit(1);
    }
}

// --- 4. IOT BRIDGE (AUTHENTICATED) ---
const startIoTBridge = async () => { 
    if (!process.env.MQTT_BROKER_URL) {
        console.warn("⚠️ MQTT Bridge Skipped: No Broker URL Found");
        return;
    }

    try {
        const brokerHost = process.env.MQTT_BROKER_URL.replace('mqtts://', '').replace('wss://', '').split('/')[0];
        const brokerRegion = brokerHost.split('.')[2] || 'us-east-1';

        console.log(`📡 Calculating Secure SigV4 Connection for[${brokerRegion}]...`);

        const credentialProvider = defaultProvider();
        const credentials = await credentialProvider(); 

        const signedUrl = getSignedIoTUrl(
            process.env.MQTT_BROKER_URL,
            brokerRegion,
            credentials.accessKeyId,     
            credentials.secretAccessKey,  
            credentials.sessionToken      
        );

        const mqttClient = connect(signedUrl, {
            connectTimeout: 10000,
            reconnectPeriod: 5000,
            protocol: 'wss',
            clientId: `patient-service-${brokerRegion}-${Math.random().toString(16).substring(2, 10)}`,
            keepalive: 60
        });
        
        mqttClient.on('connect', () => {
            console.log("✅ Connected to AWS IoT Core (Securely Signed)");
            mqttClient.subscribe('mediconnect/vitals/#');
        });

        mqttClient.on('error', (err) => {
            console.error("⚠️ MQTT Connection Error (Non-Fatal):", err.message);
        });

        mqttClient.on('message', async (topic, message) => {
            try {
                const payload = JSON.parse(message.toString());
                const patientId = topic.split('/').pop() || "unknown";
                const heartRate = Number(payload.heartRate);
                const region = payload.region || brokerRegion;

                if (heartRate > 150) {
                    await handleEmergencyDetection(patientId, heartRate, 'EMERGENCY_AUTO_IOT', region);
                    io.to(`patient_${patientId}`).emit('critical_vital_alert', {
                        message: "High Heart Rate Detected!", heartRate, level: "CRITICAL"
                    });
                }
                io.to(`patient_${patientId}`).emit('vital_update', { ...payload, timestamp: new Date().toISOString() });
                
                pushVitalToBigQuery(patientId, payload, region).catch((err: any) => console.error(err));

            } catch (e) { console.error("MQTT Message Error"); }
        });

        io.on('connection', (socket) => {
            socket.on('join_monitoring', (pid) => {
                socket.join(`patient_${pid}`);
                console.log(`👁️ Monitoring session started for patient: ${pid}`);
            });
        });
    } catch (error: any) {
        console.error("❌ Failed to initialize IoT Bridge:", error.message);
    }
};

// --- 5. START SERVER ---
const startServer = async () => {
    try {
        // 🟢 1. Wait for Vault Secrets FIRST
        await loadSecrets();
        
        // 🟢 2. Dynamically import controllers SECOND
        const { default: patientRoutes } = await import('./routes/patient.routes');
        const { default: iotRoutes } = await import('./modules/iot/iot.routes');
        
        // 🟢 3. Attach routes
        app.use('/stats', sensitiveDataLimiter);
        app.use('/search', sensitiveDataLimiter);
        app.use('/vitals', sensitiveDataLimiter); 
        app.use('/', patientRoutes);
        app.use('/', iotRoutes);

        app.use('*', (req, res) => {
            res.status(404).json({ 
                error: "Route Not Found", 
                message: `Cannot ${req.method} ${req.originalUrl}` 
            });
        });
        
        startIoTBridge();

        httpServer.listen(Number(PORT), '0.0.0.0', () => {
            isAppReady = true;
            safeLog(`🚀 Patient Service Production Ready on port ${PORT}`);
        });
    } catch (err: any) {
        const errMsg = err?.message || JSON.stringify(err);
        safeError('❌ FATAL: Application failed to start:', errMsg);
        process.exit(1);
    }
};

startServer();