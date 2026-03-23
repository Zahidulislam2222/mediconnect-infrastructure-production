import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { COGNITO_CONFIG } from '../../../shared/aws-config';
import { safeLog, safeError } from '../../../shared/logger';

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
        safeLog(`🔐 Initializing Cognito Verifier for ${regionKey}...`);

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
        safeError(`❌ Auth Init Error: ${error.message}`);
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
            isPatient: !isDoctor,
            mfaVerified: payload['custom:mfa_verified'] === 'true' ||
                         (payload.amr && Array.isArray(payload.amr) && payload.amr.includes('mfa')),
            authTime: payload.auth_time,
        };

        next();

    } catch (err: any) {

        safeError(`🔒 Auth Failed [IP: ${req.ip}]: ${err.message}`);
        res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
        return;
    }
};

/**
 * HIPAA §164.312(d): MFA enforcement for sensitive operations.
 * Apply after authMiddleware on routes that access PHI.
 */
export const requireMFA = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    // In production, Cognito enforces MFA at pool level.
    // This middleware verifies the MFA claim is present in the token.
    // Skip enforcement in non-production to allow local development.
    if (process.env.NODE_ENV === 'production' && !user.mfaVerified) {
        return res.status(403).json({
            error: 'MFA required',
            message: 'Multi-factor authentication is required for this operation. Please enable MFA in your account settings.'
        });
    }
    next();
};