/**
 * Staff Service Auth Middleware
 * ==============================
 * Reuses same Cognito JWT verification pattern as other services.
 * Adds staff/admin group enforcement for internal endpoints.
 *
 * Pattern Reference: booking-service/src/middleware/auth.middleware.ts
 */

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

    verifiers[region] = CognitoJwtVerifier.create({
        userPoolId: config.USER_POOL_ID,
        tokenUse: "id",
        clientId: [config.CLIENT_PATIENT, config.CLIENT_DOCTOR, config.CLIENT_ADMIN, config.CLIENT_STAFF].filter(Boolean) as string[],
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

        const payload = await v.verify(token);

        const groups = (payload['cognito:groups'] as string[]) || [];
        const isDoctor = groups.some((g: string) => g.toLowerCase() === 'doctor' || g.toLowerCase() === 'doctors');
        const isStaff = groups.some((g: string) => g.toLowerCase() === 'staff');
        const isAdmin = groups.some((g: string) => g.toLowerCase() === 'admin');

        (req as any).user = {
            id: payload.sub,
            sub: payload.sub,
            email: payload.email,
            fhirId: payload["custom:fhir_id"] || payload.sub,
            region: region,
            isDoctor,
            isPatient: !isDoctor,
            isStaff,
            isAdmin,
            groups,
        };

        next();
    } catch (err: any) {
        const ip = req.ip || req.headers['x-forwarded-for'] || 'UNKNOWN';
        const region = extractRegion(req);

        console.warn(`Staff Auth Failed [${region}]: ${err.message}`);

        if (!err.message.includes('expired')) {
            await writeAuditLog(
                "SYSTEM", "STAFF",
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

/**
 * Require staff or admin group membership.
 * Must be used AFTER authMiddleware.
 */
export const requireStaffOrAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    if (!user.isStaff && !user.isAdmin) {
        res.status(403).json({ error: "Forbidden: Staff or admin access required" });
        return;
    }

    next();
};
