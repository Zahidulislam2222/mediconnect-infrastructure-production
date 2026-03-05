import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { COGNITO_CONFIG } from '../../../shared/aws-config'; 

// Cache verifiers in memory
const verifiers: Record<string, any> = {};

const getVerifier = async (userRegion: string) => {
    // 1. Normalize Region
    const isEU = userRegion?.toUpperCase().includes('EU');
    const regionKey = isEU ? 'EU' : 'US';

    if (verifiers[regionKey]) return verifiers[regionKey];

    // 2. Load Config (Safe because getters read process.env NOW, not at startup)
    const config = COGNITO_CONFIG[regionKey];

    if (!config.USER_POOL_ID || !config.CLIENT_PATIENT) {
        throw new Error(`AUTH_CRITICAL: Missing Cognito Config for ${regionKey}`);
    }

    try {
        console.log(`🔐 Initializing Cognito Verifier for ${regionKey}...`);

        // 3. 🟢 USE THE OFFICIAL CLASS (No Axios needed)
        const verifier = CognitoJwtVerifier.create({
            userPoolId: config.USER_POOL_ID,
            tokenUse: "id",
            // Allow both Patient and Doctor apps to use this API
            clientId: [config.CLIENT_PATIENT, config.CLIENT_DOCTOR].filter(Boolean),
        });

        verifiers[regionKey] = verifier;
        return verifier;
    } catch (error: any) {
        console.error(`❌ Auth Init Error: ${error.message}`);
        throw new Error(`Failed to initialize Auth for ${regionKey}`);
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
        
        // Handle array headers safely
        const rawRegion = req.headers['x-user-region'];
        const userRegion = Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion as string || "us-east-1");

        const v = await getVerifier(userRegion);
        
        // 4. Verify (Signature + Expiry + Audience)
        const payload = await v.verify(token);

        // 5. Context Injection
        const groups = (payload['cognito:groups'] as string[]) || [];
        const isDoctor = groups.some((g: string) => g.toLowerCase() === 'doctor');

        (req as any).user = { 
            id: payload.sub,
            sub: payload.sub,
            email: payload.email,
            fhirId: payload["custom:fhir_id"] || payload.sub, 
            region: userRegion,
            isDoctor,
            isPatient: !isDoctor
        };
        
        next();

    } catch (err: any) {

        console.warn(`🔒 Auth Failed [IP: ${req.ip}]: ${err.message}`);
        res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
        return;
    }
};