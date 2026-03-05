import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { COGNITO_CONFIG } from '../../../shared/aws-config';
import { writeAuditLog } from "../../../shared/audit";

// Regional Cache
const verifiers: Record<string, any> = {
    'us-east-1': null,
    'eu-central-1': null
};

// Standardized Region Extractor
const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    const r = Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
    return r.toUpperCase().includes('EU') ? 'eu-central-1' : 'us-east-1';
};

const getVerifier = async (region: string) => {
    if (verifiers[region]) return verifiers[region];

    const regionKey = region === 'eu-central-1' ? 'EU' : 'US';
    const config = COGNITO_CONFIG[regionKey];

    if (!config.USER_POOL_ID || !config.CLIENT_PATIENT) {
        throw new Error(`AUTH_CRASH: Missing Cognito Config for ${regionKey}`);
    }

    // 🟢 SECURE: Official Verifier with Interoperability for both apps
    verifiers[region] = CognitoJwtVerifier.create({
        userPoolId: config.USER_POOL_ID,
        tokenUse: "id",
        clientId: [config.CLIENT_PATIENT, config.CLIENT_DOCTOR].filter(Boolean) as string[],
    });

    return verifiers[region];
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: "Unauthorized: Missing token" });
            return;
        }

        const token = authHeader.split(' ')[1];
        const region = extractRegion(req);
        const v = await getVerifier(region);

        // 🔐 Cryptographic Verification
        const payload = await v.verify(token);

        // 🟢 UNIFORMITY FIX: Align roles and IDs with all other microservices
        const groups = (payload['cognito:groups'] as string[]) || [];
        const isDoctor = groups.some(g => g.toLowerCase() === 'doctor' || g.toLowerCase() === 'doctors');

        (req as any).user = {
            id: payload.sub,
            sub: payload.sub,
            email: payload.email,
            fhirId: payload["custom:fhir_id"] || payload.sub,
            region: region,
            isDoctor,
            isPatient: !isDoctor
        };

        next();
    } catch (err: any) {
        // 🟢 HIPAA AUDIT: Log the specific service failure
        const ip = req.ip || req.headers['x-forwarded-for'] || 'UNKNOWN';
        const region = extractRegion(req);
        
        console.warn(`🔒 Booking Auth Failed [${region}]: ${err.message}`);
        
        if (!err.message.includes('expired')) {
            await writeAuditLog(
                "SYSTEM", 
                "BOOKING", 
                "AUTH_FAILURE", 
                `Token rejection: ${err.message}`, 
                { region, ipAddress: String(ip) }
            );
        }

        const status = err.message.includes('AUTH_CRASH') ? 503 : 401;
        res.status(status).json({ error: "Unauthorized" });
        return;
    }
};