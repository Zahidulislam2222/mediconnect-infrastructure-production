import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { COGNITO_CONFIG } from '../../../shared/aws-config';
import { writeAuditLog } from "../../../shared/audit";

const verifiers: Record<string, any> = {
    'us-east-1': null,
    'eu-central-1': null
};

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    // Fallback: Check body for WebSocket events which sometimes carry region payload
    const bodyRegion = (req.body && req.body.region); 
    const r = Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || bodyRegion || "us-east-1");
    return r.toUpperCase() === 'EU' ? 'eu-central-1' : 'us-east-1';
};

const getVerifier = async (region: string) => {
    if (verifiers[region]) return verifiers[region];

    const config = region === 'eu-central-1' ? COGNITO_CONFIG.EU : COGNITO_CONFIG.US;

    if (!config.USER_POOL_ID || !config.CLIENT_DOCTOR) {
         // Return null instead of throwing to allow WebSocket bypass if configured
         return null; 
    }

    verifiers[region] = CognitoJwtVerifier.create({
        userPoolId: config.USER_POOL_ID,
        tokenUse: "id",
        clientId: [config.CLIENT_PATIENT, config.CLIENT_DOCTOR],
    });

    return verifiers[region];
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {

    const awsAuthorizer = req.body?.requestContext?.authorizer;

    if (awsAuthorizer && awsAuthorizer.sub) {
        (req as any).user = {
            sub: awsAuthorizer.sub,
            role: awsAuthorizer.role || "patient",
            email: awsAuthorizer.email || "",
            region: extractRegion(req)
        };

        if (req.body.body) {
            req.body = req.body.body; 
        }
        
        return next(); 
    }

    // 🟢 2. Standard HTTP Bearer Token Logic
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing token" });
        }

        const token = authHeader.split(' ')[1];
        const region = extractRegion(req);
        const v = await getVerifier(region);

        if (!v) throw new Error(`AUTH_NOT_READY: Config missing for ${region}`);

        // 🔐 CRYPTOGRAPHIC VERIFICATION
        const payload = await v.verify(token);

        (req as any).user = {
            sub: payload.sub,
            email: payload.email,
            role: payload["custom:role"] || (payload["cognito:groups"] ? payload["cognito:groups"][0] : "patient"),
            region: region
        };

        next();
    } catch (err: any) {
        const region = extractRegion(req);
        
        // 🛡️ SECURITY: I removed the "Dev Mode" bypass. 
        // If the token is invalid, we REJECT it. No exceptions.
        console.error(`❌ Auth Failure [${region}]:`, err.message);

        if (!err.message.includes('expired')) {
             await writeAuditLog("SYSTEM", "UNKNOWN", "UNAUTHORIZED_ACCESS", err.message, { region });
        }

        const status = err.message.includes('AUTH_NOT_READY') ? 503 : 401;
        return res.status(status).json({ error: "Unauthorized" });
    }
};