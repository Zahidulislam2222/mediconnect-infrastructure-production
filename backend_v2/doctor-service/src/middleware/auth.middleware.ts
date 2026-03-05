import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from "aws-jwt-verify"; 
import { COGNITO_CONFIG } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';


const verifiers: Record<string, any> = {};

const getVerifier = async (userRegion: string) => {
    // 1. Normalize Region
    const isEU = userRegion?.toUpperCase().includes('EU');
    const regionKey = isEU ? 'EU' : 'US';
    
    // 2. Return cached verifier if exists
    if (verifiers[regionKey]) return verifiers[regionKey];

    // 3. Select Infrastructure Config (Uses getters from shared config)
    const config = COGNITO_CONFIG[regionKey];
    
    if (!config.USER_POOL_ID || !config.CLIENT_DOCTOR) {
        throw new Error(`AUTH_CONFIG_MISSING: No Cognito configuration found for ${regionKey}`);
    }

    try {
        console.log(`🔐 Initializing Doctor Auth Gatekeeper for ${regionKey}...`);

        // 4. 🟢 Use Official Verifier (Auto-manages JWKS rotation and caching)
        const verifier = CognitoJwtVerifier.create({
            userPoolId: config.USER_POOL_ID,
            tokenUse: "id",
            clientId: [config.CLIENT_DOCTOR, config.CLIENT_PATIENT].filter(Boolean) as string[],
        });

        verifiers[regionKey] = verifier;
        return verifier;

    } catch (error: any) {
        console.error(`❌ Critical Auth Failure for ${regionKey}:`, error.message);
        throw error;
    }
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: "Unauthorized: Missing token" });
            return;
        }

        const token = authHeader.split(' ')[1];
        
        // Safely parse regional header
        const rawRegion = req.headers['x-user-region'];
        const userRegion = Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion as string || "us-east-1");

        // Get the strict regional verifier
        const v = await getVerifier(userRegion);
        
        // Verify Token (Crypto & Expiry check)
        const payload = await v.verify(token);

        // --- 2026 PERMISSION ENFORCEMENT (RBAC) ---
        const groups = (payload['cognito:groups'] as string[]) || [];
        const isDoctor = groups.some(g => g.toLowerCase() === 'doctor' || g.toLowerCase() === 'doctors');
        const isPatient = !isDoctor;

        const isReadRequest = req.method === 'GET';

        if (!isDoctor && !isReadRequest) {
            await writeAuditLog(payload.sub, "SYSTEM", "UNAUTHORIZED_WRITE_ATTEMPT", 
                "Blocked patient attempt to modify clinical data", {
                region: userRegion,
                ipAddress: req.ip,
                endpoint: req.originalUrl
            });
            res.status(403).json({ error: "Access Denied: Only verified practitioners can modify clinical data." });
            return;
        }

        // --- CONTEXT INJECTION ---
        (req as any).user = { 
            id: payload.sub,
            sub: payload.sub,
            email: payload.email,
            fhirId: payload["custom:fhir_id"] || payload.sub,
            region: userRegion,
            isDoctor,
            isPatient
        };
        
        next();

    } catch (err: any) {
        console.warn(`🔒 Auth Middleware Blocked Request: ${err.message}`);
        
        if (err.message.includes('AUTH_CONFIG_MISSING')) {
            res.status(503).json({ error: "Service unavailable during auth initialization" });
            return;
        }
        
        res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
        return;
    }
};