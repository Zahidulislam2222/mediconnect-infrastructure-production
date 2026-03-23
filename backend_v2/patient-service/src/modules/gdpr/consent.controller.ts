import { Request, Response } from 'express';
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from 'crypto';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';
import { safeError } from '../../../../shared/logger';
import { publishEvent, EventType } from '../../../../shared/event-bus';

// =============================================================================
// GDPR Consent Versioning (Article 7 - Conditions for Consent)
// =============================================================================
// Uses an append-only ledger (mediconnect-consent-ledger) so that no consent
// record is ever mutated or deleted. Every change creates a new row, giving a
// complete, tamper-evident history that satisfies GDPR Article 7(1) proof-of-
// consent and Article 5(2) accountability obligations.
// =============================================================================

const CONSENT_TABLE = process.env.CONSENT_TABLE || 'mediconnect-consent-ledger';

interface ConsentRecord {
    consentId: string;
    patientId: string;
    policyVersion: string;
    consentType: string;
    status: 'granted' | 'withdrawn' | 'expired';
    timestamp: string;
    ipAddress: string;
    userAgent: string;
    expiresAt?: string; // ISO 8601 — GDPR Art 7: consent must not be indefinite
}

/**
 * Helper: Extract region from request headers (mirrors patient.controller.ts)
 */
const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || 'us-east-1');
};

/**
 * GET /me/consent
 * Returns the patient's current active consents and full version history.
 * GDPR Article 7(1): The controller must be able to demonstrate that the
 * data subject has consented to processing.
 */
export const getConsent = async (req: Request, res: Response) => {
    try {
        const region = extractRegion(req);
        const dynamicDb = getRegionalClient(region);
        const patientId = (req as any).user?.id;

        if (!patientId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Query all consent records for this patient (append-only ledger)
        const result = await dynamicDb.send(new QueryCommand({
            TableName: CONSENT_TABLE,
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
            ScanIndexForward: false // newest first
        }));

        const history: ConsentRecord[] = (result.Items || []) as ConsentRecord[];

        // Derive current active consents: for each consentType, the latest
        // record determines whether it is currently granted or withdrawn.
        const latestByType = new Map<string, ConsentRecord>();
        for (const record of history) {
            if (!latestByType.has(record.consentType)) {
                latestByType.set(record.consentType, record);
            }
        }

        const now = new Date().toISOString();
        const activeConsents = Array.from(latestByType.values()).filter(
            (r) => r.status === 'granted' && (!r.expiresAt || r.expiresAt > now)
        );
        const expiredConsents = Array.from(latestByType.values()).filter(
            (r) => r.status === 'granted' && r.expiresAt && r.expiresAt <= now
        );

        // FHIR R4: Map each active consent to a FHIR Consent resource
        const fhirConsents = activeConsents.map((c) => ({
            resourceType: "Consent",
            id: c.consentId,
            status: "active",
            scope: {
                coding: [{ system: "http://terminology.hl7.org/CodeSystem/consentscope", code: "patient-privacy", display: "Privacy Consent" }]
            },
            category: [{
                coding: [{ system: "http://loinc.org", code: "59284-0", display: "Patient Consent" }]
            }],
            patient: { reference: `Patient/${patientId}` },
            dateTime: c.timestamp,
            policy: [{ uri: `https://mediconnect.health/privacy-policy/v/${c.policyVersion}` }],
            provision: {
                type: "permit",
                purpose: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "TREAT", display: "treatment" }]
            }
        }));

        await writeAuditLog(patientId, patientId, 'READ_CONSENT', 'Patient viewed consent status and history', {
            region,
            ipAddress: req.ip
        });

        return res.json({
            activeConsents,
            expiredConsents,
            fhirConsents,
            history
        });
    } catch (error: any) {
        safeError('[Consent] GET failed:', error);
        return res.status(500).json({ error: 'Failed to retrieve consent records' });
    }
};

/**
 * PUT /me/consent
 * Accepts a new policy version / consent grant. Creates a NEW record in the
 * append-only ledger -- existing records are never mutated.
 *
 * Expected body:
 *   { policyVersion: string, consentType: string }
 */
export const updateConsent = async (req: Request, res: Response) => {
    try {
        const region = extractRegion(req);
        const dynamicDb = getRegionalClient(region);
        const patientId = (req as any).user?.id;

        if (!patientId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { policyVersion, consentType } = req.body;

        if (!policyVersion || !consentType) {
            return res.status(400).json({ error: 'Missing required fields: policyVersion, consentType' });
        }

        // GDPR Art 7: Consent should have a defined validity period
        // Default: 365 days. Can be overridden via expiresInDays in request body.
        const expiresInDays = req.body.expiresInDays || 365;
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

        const consentRecord: ConsentRecord = {
            consentId: randomUUID(),
            patientId,
            policyVersion,
            consentType,
            status: 'granted',
            timestamp: new Date().toISOString(),
            ipAddress: req.ip || '0.0.0.0',
            userAgent: req.headers['user-agent'] || 'unknown',
            expiresAt
        };

        // Append-only: always a PutCommand, never an UpdateCommand on old rows
        await dynamicDb.send(new PutCommand({
            TableName: CONSENT_TABLE,
            Item: consentRecord
        }));

        await writeAuditLog(patientId, patientId, 'GRANT_CONSENT', `Patient granted consent for ${consentType} under policy ${policyVersion}`, {
            region,
            ipAddress: req.ip,
            policyVersion,
            consentType
        });

        // Event bus: consent updated
        publishEvent(EventType.CONSENT_UPDATED, { patientId, consentType, status: 'granted', policyVersion }, region).catch(() => {});

        // FHIR R4: Return the consent as a FHIR Consent resource
        const fhirConsent = {
            resourceType: "Consent",
            id: consentRecord.consentId,
            status: "active",
            scope: {
                coding: [{ system: "http://terminology.hl7.org/CodeSystem/consentscope", code: "patient-privacy", display: "Privacy Consent" }]
            },
            category: [{
                coding: [{ system: "http://loinc.org", code: "59284-0", display: "Patient Consent" }]
            }],
            patient: { reference: `Patient/${patientId}` },
            dateTime: consentRecord.timestamp,
            policy: [{ uri: `https://mediconnect.health/privacy-policy/v/${policyVersion}` }],
            provision: {
                type: "permit",
                purpose: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "TREAT", display: "treatment" }]
            }
        };

        return res.status(201).json({
            message: 'Consent recorded successfully',
            consent: consentRecord,
            fhirResource: fhirConsent
        });
    } catch (error: any) {
        safeError('[Consent] PUT failed:', error);
        return res.status(500).json({ error: 'Failed to record consent' });
    }
};

/**
 * DELETE /me/consent
 * GDPR Article 7(3): The data subject has the right to withdraw consent at
 * any time. Withdrawal does NOT erase existing records -- it appends a new
 * withdrawal entry and marks active consents as withdrawn for the given type.
 *
 * Expected body:
 *   { consentType: string }
 *   (If omitted, withdraws ALL active consent types.)
 */
export const withdrawConsent = async (req: Request, res: Response) => {
    try {
        const region = extractRegion(req);
        const dynamicDb = getRegionalClient(region);
        const patientId = (req as any).user?.id;

        if (!patientId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { consentType } = req.body || {};

        // Fetch current consent records to determine what needs to be withdrawn
        const result = await dynamicDb.send(new QueryCommand({
            TableName: CONSENT_TABLE,
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
            ScanIndexForward: false
        }));

        const history: ConsentRecord[] = (result.Items || []) as ConsentRecord[];

        // Identify the latest record per consentType to find active grants
        const latestByType = new Map<string, ConsentRecord>();
        for (const record of history) {
            if (!latestByType.has(record.consentType)) {
                latestByType.set(record.consentType, record);
            }
        }

        // Filter to only currently-granted consents that match the requested type
        const toWithdraw = Array.from(latestByType.values()).filter((r) => {
            if (r.status !== 'granted') return false;
            if (consentType) return r.consentType === consentType;
            return true; // withdraw all if no specific type given
        });

        if (toWithdraw.length === 0) {
            return res.status(404).json({ error: 'No active consents found to withdraw' });
        }

        const withdrawalRecords: ConsentRecord[] = [];
        const now = new Date().toISOString();

        for (const active of toWithdraw) {
            // 1. Append a withdrawal record to the ledger
            const withdrawalRecord: ConsentRecord = {
                consentId: randomUUID(),
                patientId,
                policyVersion: active.policyVersion,
                consentType: active.consentType,
                status: 'withdrawn',
                timestamp: now,
                ipAddress: req.ip || '0.0.0.0',
                userAgent: req.headers['user-agent'] || 'unknown'
            };

            await dynamicDb.send(new PutCommand({
                TableName: CONSENT_TABLE,
                Item: withdrawalRecord
            }));

            withdrawalRecords.push(withdrawalRecord);
        }

        const typesWithdrawn = withdrawalRecords.map((r) => r.consentType).join(', ');

        await writeAuditLog(patientId, patientId, 'WITHDRAW_CONSENT', `Patient withdrew consent for: ${typesWithdrawn}`, {
            region,
            ipAddress: req.ip,
            consentTypes: typesWithdrawn
        });

        return res.json({
            message: 'Consent withdrawn successfully',
            withdrawals: withdrawalRecords
        });
    } catch (error: any) {
        safeError('[Consent] DELETE failed:', error);
        return res.status(500).json({ error: 'Failed to withdraw consent' });
    }
};
