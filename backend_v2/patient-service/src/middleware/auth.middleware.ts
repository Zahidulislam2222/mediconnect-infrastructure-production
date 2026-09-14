import { resolveAuthRegion } from '../../../shared/region-context';
import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { COGNITO_CONFIG } from '../../../shared/aws-config';
import { safeLog, safeError } from '../../../shared/logger';
import { getSensitiveOperationSettings } from '../../../shared/settings';

// Cache verifiers in memory
const verifiers: Record<string, any> = {};

const getVerifier = async (userRegion: string) => {
    // 1. Normalize Region
    const isEU = resolveAuthRegion(userRegion) === 'EU';
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
            clientId: [config.CLIENT_PATIENT, config.CLIENT_DOCTOR, config.CLIENT_ADMIN].filter(Boolean),
        });

        verifiers[regionKey] = verifier;
        return verifier;
    } catch (error: any) {
        safeError(`❌ Auth Init Error: ${error.message}`);
        throw new Error(`Failed to initialize Auth for ${regionKey}`, { cause: error });
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
        const userRegion = resolveAuthRegion(rawRegion);

        const v = await getVerifier(userRegion);
        
        // 4. Verify (Signature + Expiry + Audience)
        const payload = await v.verify(token);
        req.headers['x-user-region'] = userRegion;

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
            isAdmin: groups.some((group: string) => group.toLowerCase() === 'admin'),
            isPatient: !isDoctor,
            // Profile attributes and MFA enrollment are not session authentication evidence.
            // The verified issuer must actually assert the standard OIDC authentication methods.
            mfaVerified: Array.isArray(payload.amr) &&
                         payload.amr.every((method: unknown) => typeof method === 'string') &&
                         payload.amr.includes('mfa'),
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
 * Require recent session MFA after authMiddleware for privileged privacy operations.
 * Native Cognito session-amr issuance/step-up must be established before enabling these flows.
 * Pool MFA settings, enrollment and remembered devices do not establish this per-session claim.
 */
export const requireMFA = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    let maxAuthAgeSeconds: number;
    try {
        ({ maxAuthAgeSeconds } = getSensitiveOperationSettings());
    } catch {
        return res.status(503).json({ error: 'SENSITIVE_OPERATION_CONFIGURATION_UNAVAILABLE' });
    }
    const now = Math.floor(Date.now() / 1000);
    if (user.mfaVerified !== true || typeof user.authTime !== 'number' ||
        !Number.isSafeInteger(user.authTime) || user.authTime <= 0 || user.authTime > now ||
        now - user.authTime > maxAuthAgeSeconds) {
        return res.status(403).json({
            error: 'MFA_STEP_UP_REQUIRED',
            message: 'Recent verified multi-factor authentication is required for this operation.'
        });
    }
    next();
};
