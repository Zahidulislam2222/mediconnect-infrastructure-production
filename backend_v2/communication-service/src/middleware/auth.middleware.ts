import { resolveAuthRegion } from '../../../shared/region-context';
import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { COGNITO_CONFIG } from '../../../shared/aws-config';
import { writeAuditLog } from "../../../shared/audit";
import { logger } from "../../../shared/logger";

const verifiers: Record<string, any> = {
    'us-east-1': null,
    'eu-central-1': null
};

const extractRegion = (req: Request): string => resolveAuthRegion(req.headers['x-user-region']);

const getVerifier = async (region: string) => {
    if (verifiers[region]) return verifiers[region];

    const regionKey = resolveAuthRegion(region);
    const config = COGNITO_CONFIG[regionKey];

    if (!config.USER_POOL_ID || !config.CLIENT_PATIENT) {
         throw new Error(`AUTH_NOT_READY: Config missing for ${regionKey}`);
    }

    verifiers[region] = CognitoJwtVerifier.create({
        userPoolId: config.USER_POOL_ID,
        tokenUse: "id",
        clientId: [config.CLIENT_PATIENT, config.CLIENT_DOCTOR].filter(Boolean) as string[],
    });

    return verifiers[region];
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {

    // 2. Standard HTTP Bearer Token Logic
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Unauthorized: Missing token" });
        }

        const token = authHeader.split(' ')[1];
        const region = extractRegion(req);
        const v = await getVerifier(region);

        // 🔐 CRYPTOGRAPHIC VERIFICATION
        const payload = await v.verify(token);
        req.headers['x-user-region'] = region;

        // 🟢 ALIGNMENT FIX: Use the same structure as Patient and Doctor services
        const groups = (payload['cognito:groups'] as string[]) || [];
        const isDoctor = groups.some(g => g.toLowerCase() === 'doctor' || g.toLowerCase() === 'doctors');

        (req as any).user = {
            id: payload.sub,
            sub: payload.sub,
            email: payload.email,
            region: region,
            isDoctor,
            isPatient: !isDoctor
        };

        next();
    } catch (err: any) {
        const region = (req as any).user?.region;
        
        logger.warn("[AUTH] Authentication failed", { region });

        // Only log to Audit Log if it's a real attack (not just an expired token)
        if (region && !err.message.includes('expired')) {
             await writeAuditLog("SYSTEM", "COMMUNICATION", "UNAUTHORIZED_ACCESS_ATTEMPT", err.message, { region, ip: req.ip });
        }

        const status = err.message.includes('AUTH_NOT_READY') ? 503 : 401;
        return res.status(status).json({ error: "Unauthorized: Access denied" });
    }
};