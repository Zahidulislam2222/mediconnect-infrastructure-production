// ─── FEATURE #23: Prior Authorization Workflow ─────────────────────────────
// Insurance pre-approval requests for procedures, medications, and services.
// FHIR ClaimResponse resource. Tracks auth status (pending → approved/denied).
// Supports CPT/HCPCS code linkage and clinical justification attachments.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';

const TABLE_PRIOR_AUTH = process.env.TABLE_PRIOR_AUTH || 'mediconnect-prior-auth';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Prior Auth Categories ──────────────────────────────────────────────────

const AUTH_CATEGORIES = [
    { code: 'procedure', display: 'Surgical/Medical Procedure' },
    { code: 'imaging', display: 'Diagnostic Imaging (MRI, CT, PET)' },
    { code: 'medication', display: 'Prescription Medication' },
    { code: 'dme', display: 'Durable Medical Equipment' },
    { code: 'specialist', display: 'Specialist Referral' },
    { code: 'inpatient', display: 'Inpatient Admission' },
    { code: 'outpatient', display: 'Outpatient Surgery' },
    { code: 'rehab', display: 'Rehabilitation Services' },
    { code: 'behavioral', display: 'Behavioral Health Services' },
    { code: 'home-health', display: 'Home Health Services' },
];

// ─── Common Denial Reasons ──────────────────────────────────────────────────

const DENIAL_REASONS = [
    { code: 'not-medically-necessary', display: 'Not medically necessary' },
    { code: 'experimental', display: 'Experimental or investigational' },
    { code: 'out-of-network', display: 'Out-of-network provider' },
    { code: 'insufficient-documentation', display: 'Insufficient clinical documentation' },
    { code: 'alternative-available', display: 'Less costly alternative available' },
    { code: 'not-covered', display: 'Service not covered under plan' },
    { code: 'duplicate', display: 'Duplicate request' },
    { code: 'max-benefit-reached', display: 'Maximum benefit reached' },
];

// ─── Helper: Build FHIR ClaimResponse ───────────────────────────────────────

function toFHIRClaimResponse(auth: any): any {
    return {
        resourceType: 'ClaimResponse',
        id: auth.authId,
        status: auth.status === 'approved' ? 'active' : auth.status === 'denied' ? 'active' : 'active',
        type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
        use: 'preauthorization',
        patient: { reference: `Patient/${auth.patientId}` },
        created: auth.createdAt,
        insurer: { display: auth.insurerName || 'Unknown Insurer' },
        outcome: auth.status === 'approved' ? 'complete'
            : auth.status === 'denied' ? 'error'
            : 'queued',
        disposition: auth.status === 'approved' ? 'Authorization approved'
            : auth.status === 'denied' ? `Denied: ${auth.denialReason || 'See details'}`
            : 'Pending review',
        preAuthRef: auth.authorizationNumber || undefined,
        item: (auth.items || []).map((item: any, idx: number) => ({
            itemSequence: idx + 1,
            adjudication: [{
                category: { coding: [{ code: 'submitted' }] },
                amount: item.estimatedCost ? { value: item.estimatedCost, currency: 'USD' } : undefined,
            }],
        })),
        extension: [
            { url: 'http://mediconnect.health/fhir/prior-auth-category', valueString: auth.category },
            { url: 'http://mediconnect.health/fhir/prior-auth-urgency', valueString: auth.urgency },
            auth.expirationDate ? { url: 'http://mediconnect.health/fhir/prior-auth-expiration', valueDate: auth.expirationDate } : null,
            auth.approvedUnits ? { url: 'http://mediconnect.health/fhir/prior-auth-approved-units', valueInteger: auth.approvedUnits } : null,
        ].filter(Boolean),
    };
}

// ─── POST /prior-auth — Submit a prior authorization request ────────────────

export const createPriorAuth = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const {
            patientId, category, urgency, insurerName, memberId,
            items, clinicalJustification, diagnosisCodes,
            requestingProviderId, servicingProviderId
        } = req.body;

        if (!patientId || !category || !items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'patientId, category, and items[] are required' });
        }

        const validCategory = AUTH_CATEGORIES.find(c => c.code === category);
        if (!validCategory) {
            return res.status(400).json({ error: `Invalid category. Valid: ${AUTH_CATEGORIES.map(c => c.code).join(', ')}` });
        }

        const authId = uuidv4();
        const now = new Date().toISOString();

        const authRequest = {
            authId,
            patientId,
            requestedBy: user.id,
            category: validCategory.code,
            categoryDisplay: validCategory.display,
            urgency: urgency || 'routine', // routine | urgent | emergent
            status: 'pending',
            insurerName: insurerName || '',
            memberId: memberId || '',
            items: items.map((item: any, idx: number) => ({
                sequence: idx + 1,
                cptCode: item.cptCode || '',
                description: item.description || '',
                quantity: item.quantity || 1,
                estimatedCost: item.estimatedCost || null,
                serviceDate: item.serviceDate || null,
            })),
            diagnosisCodes: diagnosisCodes || [],
            clinicalJustification: clinicalJustification || '',
            requestingProviderId: requestingProviderId || user.id,
            servicingProviderId: servicingProviderId || '',
            authorizationNumber: null,
            denialReason: null,
            approvedUnits: null,
            expirationDate: null,
            reviewedBy: null,
            reviewedAt: null,
            createdAt: now,
            updatedAt: now,
        };

        await db.send(new PutCommand({ TableName: TABLE_PRIOR_AUTH, Item: authRequest }));

        await writeAuditLog(user.id, patientId, 'PRIOR_AUTH_SUBMITTED', `Prior auth submitted: ${validCategory.display}`, { region, authId, category });

        res.status(201).json(toFHIRClaimResponse(authRequest));

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to submit prior authorization', details: error.message });
    }
};

// ─── GET /prior-auth/:patientId — Get patient's prior authorizations ────────

export const getPatientPriorAuths = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const { status, category } = req.query;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new QueryCommand({
            TableName: TABLE_PRIOR_AUTH,
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        let auths = (Items || []);
        if (status) auths = auths.filter((a: any) => a.status === status);
        if (category) auths = auths.filter((a: any) => a.category === category);

        auths.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.json({
            resourceType: 'Bundle',
            type: 'searchset',
            total: auths.length,
            entry: auths.map((a: any) => ({ resource: toFHIRClaimResponse(a) })),
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get prior authorizations', details: error.message });
    }
};

// ─── GET /prior-auth/detail/:authId — Get specific prior auth ───────────────

export const getPriorAuth = async (req: Request, res: Response) => {
    try {
        const { authId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Item } = await db.send(new GetCommand({
            TableName: TABLE_PRIOR_AUTH,
            Key: { authId },
        }));

        if (!Item) return res.status(404).json({ error: 'Prior authorization not found' });

        res.json(toFHIRClaimResponse(Item));

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get prior authorization', details: error.message });
    }
};

// ─── PUT /prior-auth/:authId/review — Approve or deny (doctor/admin) ────────

export const reviewPriorAuth = async (req: Request, res: Response) => {
    try {
        const { authId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        if (!user.isDoctor && !user.isAdmin) {
            return res.status(403).json({ error: 'Only doctors or admins can review prior authorizations' });
        }

        const { Item: existing } = await db.send(new GetCommand({
            TableName: TABLE_PRIOR_AUTH,
            Key: { authId },
        }));

        if (!existing) return res.status(404).json({ error: 'Prior authorization not found' });
        if (existing.status !== 'pending') return res.status(400).json({ error: `Cannot review: status is already '${existing.status}'` });

        const { decision, denialReasonCode, approvedUnits, expirationDate, notes } = req.body;
        if (!decision || !['approved', 'denied'].includes(decision)) {
            return res.status(400).json({ error: 'decision must be "approved" or "denied"' });
        }

        const now = new Date().toISOString();
        const updates: any = {
            ':s': decision,
            ':rb': user.id,
            ':ra': now,
            ':u': now,
        };
        const names: any = { '#s': 'status' };
        let updateExpr = 'SET #s = :s, reviewedBy = :rb, reviewedAt = :ra, updatedAt = :u';

        if (decision === 'approved') {
            const authNumber = `PA-${Date.now().toString(36).toUpperCase()}-${authId.slice(0, 4).toUpperCase()}`;
            const expDate = expirationDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default 90 days
            updateExpr += ', authorizationNumber = :an, expirationDate = :ed';
            updates[':an'] = authNumber;
            updates[':ed'] = expDate;
            if (approvedUnits) {
                updateExpr += ', approvedUnits = :au';
                updates[':au'] = approvedUnits;
            }
        } else {
            const denialReason = DENIAL_REASONS.find(r => r.code === denialReasonCode);
            updateExpr += ', denialReason = :dr';
            updates[':dr'] = denialReason?.display || denialReasonCode || 'Not specified';
        }

        if (notes) {
            updateExpr += ', reviewNotes = :rn';
            updates[':rn'] = notes;
        }

        await db.send(new UpdateCommand({
            TableName: TABLE_PRIOR_AUTH,
            Key: { authId },
            UpdateExpression: updateExpr,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: updates,
        }));

        await writeAuditLog(user.id, existing.patientId, `PRIOR_AUTH_${decision.toUpperCase()}`, `Prior auth ${decision}: ${existing.categoryDisplay}`, { region, authId });

        const { Item: updated } = await db.send(new GetCommand({ TableName: TABLE_PRIOR_AUTH, Key: { authId } }));
        res.json(toFHIRClaimResponse(updated));

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to review prior authorization', details: error.message });
    }
};

// ─── GET /prior-auth/categories — List categories & denial reasons ──────────

export const getPriorAuthCategories = async (_req: Request, res: Response) => {
    res.json({
        categories: AUTH_CATEGORIES,
        denialReasons: DENIAL_REASONS,
        urgencyLevels: [
            { code: 'routine', display: 'Routine (5-15 business days)' },
            { code: 'urgent', display: 'Urgent (24-72 hours)' },
            { code: 'emergent', display: 'Emergent (immediate/retrospective)' },
        ],
    });
};
