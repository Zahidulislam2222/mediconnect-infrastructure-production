import { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { PatientAccessContext, canReadPatientClinicalData } from './patient-access';
import { requestJurisdiction } from './region-context';
import { writeAuditLog } from './audit';

const patientIdentifier = z.string().regex(/^[A-Za-z0-9.-]{1,64}$/);

/** Resolve the subject from the route's authoritative input before its handler runs. */
export function patientClinicalAccess(subject: (req: Request) => unknown): RequestHandler {
    return async (req, res, next) => {
        if (await requirePatientClinicalAccess(req, res, subject(req))) next();
    };
}

/** Invoke before exposing patient content or performing a patient-scoped mutation. */
export async function requirePatientClinicalAccess(req: PatientAccessContext, res: Response, patientId: unknown) {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.id) { res.status(401).json({ error: 'Authentication required' }); return false; }
    const identifier = patientIdentifier.safeParse(patientId);
    if (!identifier.success) { res.status(400).json({ error: 'Invalid patient identifier' }); return false; }
    try {
        if (!await canReadPatientClinicalData(req, identifier.data)) {
            res.status(403).json({ error: 'Patient access is not authorized' }); return false;
        }
        await writeAuditLog(req.user.id, identifier.data, 'CLINICAL_ACCESS_AUTHORIZED',
            'Patient-scoped access authorized', { region: requestJurisdiction(req), requirePersistence: true });
        return true;
    } catch {
        res.status(503).json({ error: 'Patient access verification is temporarily unavailable' });
        return false;
    }
}
