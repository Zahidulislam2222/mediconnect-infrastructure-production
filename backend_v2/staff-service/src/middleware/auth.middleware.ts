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
import { safeError } from '../../../shared/logger';
import { resolveAuthRegion } from '../../../shared/region-context';

const verifiers: Record<string, any> = {};

const getVerifier = async (region: string) => {
    if (verifiers[region]) return verifiers[region];

    const regionKey = resolveAuthRegion(region);
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
        const region = resolveAuthRegion(req.headers['x-user-region']);
        const v = await getVerifier(region);

        const payload = await v.verify(token);
        req.headers['x-user-region'] = region;

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
            isPatient: !isDoctor && !isStaff && !isAdmin,
            isStaff,
            isAdmin,
            groups,
        };

        next();
    } catch (err: any) {
        // No region is trusted on rejection; do not guess a regional audit destination.
        safeError('Staff authentication rejected');

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
