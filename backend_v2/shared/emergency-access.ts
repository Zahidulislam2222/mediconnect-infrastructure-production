// ─── Gap #1 FIX: Emergency Access (Break-Glass) Override ────────────────────
// HIPAA §164.312(a)(2)(ii) — Emergency access procedure.
// Allows authorized providers to access PHI when normal access controls
// are insufficient (e.g., unconscious patient, system outage, life-threatening).
//
// Requirements:
//   1. Only doctors/admins can invoke
//   2. Must provide a reason (free text + category)
//   3. Time-limited override (default 60 minutes)
//   4. Enhanced audit logging (separate action type)
//   5. Breach detection notification (SNS alert to compliance)
//   6. All access during override period logged with emergency flag
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from './aws-config';
import { writeAuditLog } from './audit';
import { checkForBreach } from './breach-detection';

const TABLE_EMERGENCY = process.env.TABLE_EMERGENCY_ACCESS || 'mediconnect-emergency-access';
const DEFAULT_DURATION_MINUTES = 60;

// ─── Emergency Access Reasons (HIPAA-aligned) ────────────────────────────────

export const EMERGENCY_REASONS = [
    { code: 'life-threatening', display: 'Life-threatening emergency — patient unable to consent' },
    { code: 'unconscious', display: 'Patient unconscious or incapacitated' },
    { code: 'public-health', display: 'Public health emergency or outbreak response' },
    { code: 'system-outage', display: 'Normal access system unavailable (system outage)' },
    { code: 'treatment-continuity', display: 'Continuity of care — no other provider available' },
    { code: 'other', display: 'Other — must provide detailed justification' },
] as const;

export type EmergencyReasonCode = typeof EMERGENCY_REASONS[number]['code'];

// ─── In-memory active overrides (per-instance; production: use DynamoDB TTL) ─

interface ActiveOverride {
    overrideId: string;
    actorId: string;
    patientId: string;
    reasonCode: EmergencyReasonCode;
    reasonText: string;
    grantedAt: number;
    expiresAt: number;
    region: string;
}

const activeOverrides = new Map<string, ActiveOverride>();

// ─── POST /emergency-access — Request break-glass override ──────────────────

export const requestEmergencyAccess = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const rawRegion = req.headers['x-user-region'];
        const region = Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || 'us-east-1');

        // Only doctors and admins can request emergency access
        if (!user.isDoctor && !user.isAdmin) {
            await writeAuditLog(user.id, 'SYSTEM', 'EMERGENCY_ACCESS_DENIED',
                'Non-provider attempted emergency access request', { region, ipAddress: req.ip });
            return res.status(403).json({ error: 'Only authorized providers can request emergency access' });
        }

        const { patientId, reasonCode, reasonText, durationMinutes } = req.body;

        if (!patientId) {
            return res.status(400).json({ error: 'patientId is required' });
        }
        if (!reasonCode || !EMERGENCY_REASONS.some(r => r.code === reasonCode)) {
            return res.status(400).json({
                error: 'Valid reasonCode required',
                validCodes: EMERGENCY_REASONS.map(r => r.code),
            });
        }
        if (reasonCode === 'other' && (!reasonText || reasonText.length < 10)) {
            return res.status(400).json({ error: 'Detailed reasonText required (min 10 chars) when reasonCode is "other"' });
        }

        const overrideId = uuidv4();
        const now = Date.now();
        const duration = Math.min(durationMinutes || DEFAULT_DURATION_MINUTES, 120); // Max 2 hours
        const expiresAt = now + duration * 60 * 1000;

        const override: ActiveOverride = {
            overrideId,
            actorId: user.id,
            patientId,
            reasonCode,
            reasonText: reasonText || EMERGENCY_REASONS.find(r => r.code === reasonCode)!.display,
            grantedAt: now,
            expiresAt,
            region,
        };

        // Store in memory (hot path) and DynamoDB (durable audit)
        const overrideKey = `${user.id}:${patientId}`;
        activeOverrides.set(overrideKey, override);

        const db = getRegionalClient(region);
        await db.send(new PutCommand({
            TableName: TABLE_EMERGENCY,
            Item: {
                overrideId,
                actorId: user.id,
                patientId,
                reasonCode,
                reasonText: override.reasonText,
                grantedAt: new Date(now).toISOString(),
                expiresAt: new Date(expiresAt).toISOString(),
                durationMinutes: duration,
                status: 'active',
                region,
                ipAddress: req.ip,
                ttl: Math.floor(expiresAt / 1000) + 7 * 365 * 24 * 60 * 60, // 7-year retention
            },
        }));

        // Enhanced audit: EMERGENCY_ACCESS_GRANTED (separate from normal access)
        await writeAuditLog(user.id, patientId, 'EMERGENCY_ACCESS_GRANTED',
            `Break-glass override granted. Reason: ${override.reasonText}. Duration: ${duration}min.`,
            { region, ipAddress: req.ip, overrideId, reasonCode, role: 'emergency-override' }
        );

        // Trigger breach detection notification (compliance team alert)
        await checkForBreach(user.id, 'EMERGENCY_ACCESS_GRANTED',
            `Emergency PHI access to Patient/${patientId}. Reason: ${reasonCode}. Provider: ${user.id}`,
            region
        );

        res.status(201).json({
            resourceType: 'AuditEvent',
            id: overrideId,
            type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110113', display: 'Security Alert' },
            action: 'E',
            recorded: new Date(now).toISOString(),
            outcome: '0',
            agent: [{
                requestor: true,
                who: { reference: `Practitioner/${user.id}` },
                role: [{ text: 'emergency-access-provider' }],
            }],
            entity: [{
                what: { reference: `Patient/${patientId}` },
            }],
            extension: [{
                url: 'http://mediconnect.health/fhir/emergency-access',
                valueString: JSON.stringify({
                    overrideId,
                    reasonCode,
                    durationMinutes: duration,
                    expiresAt: new Date(expiresAt).toISOString(),
                }),
            }],
            message: `Emergency access granted. Expires: ${new Date(expiresAt).toISOString()}`,
        });

    } catch (error: any) {
        console.error('Emergency access request error:', error);
        res.status(500).json({ error: 'Failed to process emergency access request' });
    }
};

// ─── Middleware: Check if request is under emergency override ────────────────

export const emergencyAccessMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return next();

    const patientId = req.params.patientId || req.body?.patientId;
    if (!patientId) return next();

    const overrideKey = `${user.id}:${patientId}`;
    const override = activeOverrides.get(overrideKey);

    if (override && override.expiresAt > Date.now()) {
        // Tag the request as emergency-override for downstream audit
        (req as any).emergencyOverride = {
            overrideId: override.overrideId,
            reasonCode: override.reasonCode,
            grantedAt: override.grantedAt,
            expiresAt: override.expiresAt,
        };
    } else if (override) {
        // Expired — clean up
        activeOverrides.delete(overrideKey);
    }

    next();
};

// ─── GET /emergency-access/active — List active overrides (admin only) ──────

export const getActiveOverrides = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user.isAdmin && !user.isDoctor) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const now = Date.now();
    const active: any[] = [];

    for (const [key, override] of activeOverrides) {
        if (override.expiresAt > now) {
            active.push({
                overrideId: override.overrideId,
                actorId: override.actorId,
                patientId: override.patientId,
                reasonCode: override.reasonCode,
                reasonText: override.reasonText,
                grantedAt: new Date(override.grantedAt).toISOString(),
                expiresAt: new Date(override.expiresAt).toISOString(),
                remainingMinutes: Math.round((override.expiresAt - now) / 60000),
            });
        } else {
            activeOverrides.delete(key);
        }
    }

    res.json({ total: active.length, overrides: active });
};

// ─── POST /emergency-access/:overrideId/revoke — Revoke an override ─────────

export const revokeEmergencyAccess = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { overrideId } = req.params;
        const rawRegion = req.headers['x-user-region'];
        const region = Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || 'us-east-1');

        if (!user.isAdmin && !user.isDoctor) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Find and remove from memory
        let found = false;
        let revokedPatientId = '';
        for (const [key, override] of activeOverrides) {
            if (override.overrideId === overrideId) {
                revokedPatientId = override.patientId;
                activeOverrides.delete(key);
                found = true;
                break;
            }
        }

        if (!found) {
            return res.status(404).json({ error: 'Override not found or already expired' });
        }

        // Update DynamoDB record
        const db = getRegionalClient(region);
        const { PutCommand: _, UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
        await db.send(new (UpdateCommand)({
            TableName: TABLE_EMERGENCY,
            Key: { overrideId },
            UpdateExpression: 'SET #s = :s, revokedBy = :rb, revokedAt = :ra',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: {
                ':s': 'revoked',
                ':rb': user.id,
                ':ra': new Date().toISOString(),
            },
        }));

        await writeAuditLog(user.id, revokedPatientId, 'EMERGENCY_ACCESS_REVOKED',
            `Emergency access override ${overrideId} revoked`,
            { region, ipAddress: req.ip, overrideId }
        );

        res.json({ message: 'Emergency access override revoked', overrideId });

    } catch (error: any) {
        console.error('Revoke emergency access error:', error);
        res.status(500).json({ error: 'Failed to revoke emergency access' });
    }
};

// ─── GET /emergency-access/reasons — List valid emergency reasons ────────────

export const getEmergencyReasons = (_req: Request, res: Response) => {
    res.json({ reasons: EMERGENCY_REASONS });
};
