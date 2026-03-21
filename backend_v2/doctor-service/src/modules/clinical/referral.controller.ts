// ─── FEATURE #26: ServiceRequest / Referrals ──────────────────────────────
// Provider-to-provider referrals using FHIR ServiceRequest resource.
// Tracks referral lifecycle: draft → active → completed/revoked.
// Supports specialty referral categories and priority levels.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';

const TABLE_REFERRALS = process.env.TABLE_REFERRALS || 'mediconnect-referrals';
const TABLE_DOCTORS = process.env.DYNAMO_TABLE_DOCTORS || 'mediconnect-doctors';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Referral Specialties ───────────────────────────────────────────────────

const REFERRAL_SPECIALTIES = [
    { code: '394579002', display: 'Cardiology', system: 'http://snomed.info/sct' },
    { code: '394582007', display: 'Dermatology', system: 'http://snomed.info/sct' },
    { code: '394584008', display: 'Gastroenterology', system: 'http://snomed.info/sct' },
    { code: '394585009', display: 'Obstetrics and Gynecology', system: 'http://snomed.info/sct' },
    { code: '394587001', display: 'Psychiatry', system: 'http://snomed.info/sct' },
    { code: '394589003', display: 'Nephrology', system: 'http://snomed.info/sct' },
    { code: '394591006', display: 'Neurology', system: 'http://snomed.info/sct' },
    { code: '394592004', display: 'Ophthalmology', system: 'http://snomed.info/sct' },
    { code: '394594003', display: 'Orthopedics', system: 'http://snomed.info/sct' },
    { code: '394597005', display: 'Otolaryngology (ENT)', system: 'http://snomed.info/sct' },
    { code: '394600006', display: 'General Surgery', system: 'http://snomed.info/sct' },
    { code: '394602003', display: 'Endocrinology', system: 'http://snomed.info/sct' },
    { code: '394604002', display: 'Pulmonology', system: 'http://snomed.info/sct' },
    { code: '394609007', display: 'Rheumatology', system: 'http://snomed.info/sct' },
    { code: '394610002', display: 'Urology', system: 'http://snomed.info/sct' },
    { code: '408443003', display: 'Oncology', system: 'http://snomed.info/sct' },
    { code: '408448007', display: 'Physical Therapy', system: 'http://snomed.info/sct' },
    { code: '722138006', display: 'Pain Management', system: 'http://snomed.info/sct' },
    { code: '394814009', display: 'Radiology', system: 'http://snomed.info/sct' },
    { code: '408459003', display: 'Allergy and Immunology', system: 'http://snomed.info/sct' },
];

// ─── Helper: Build FHIR ServiceRequest ──────────────────────────────────────

function toFHIRServiceRequest(ref: any): any {
    return {
        resourceType: 'ServiceRequest',
        id: ref.referralId,
        meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-servicerequest'] },
        status: ref.status,
        intent: 'order',
        category: [{
            coding: [{ system: 'http://snomed.info/sct', code: '3457005', display: 'Patient referral' }],
        }],
        priority: ref.priority || 'routine',
        code: ref.specialty ? {
            coding: [ref.specialty],
        } : undefined,
        subject: { reference: `Patient/${ref.patientId}` },
        requester: { reference: `Practitioner/${ref.requestingDoctorId}`, display: ref.requestingDoctorName },
        performer: ref.targetDoctorId ? [{ reference: `Practitioner/${ref.targetDoctorId}`, display: ref.targetDoctorName }] : undefined,
        reasonCode: (ref.reasonCodes || []).map((r: any) => ({
            coding: [{ system: r.system || 'http://hl7.org/fhir/sid/icd-10-cm', code: r.code, display: r.display }],
        })),
        note: ref.clinicalNotes ? [{ text: ref.clinicalNotes }] : undefined,
        occurrencePeriod: {
            start: ref.requestedDate,
            end: ref.expirationDate || undefined,
        },
        authoredOn: ref.createdAt,
    };
}

// ─── POST /referrals — Create a referral ────────────────────────────────────

export const createReferral = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        if (!user.isDoctor) {
            return res.status(403).json({ error: 'Only doctors can create referrals' });
        }

        const {
            patientId, specialtyCode, targetDoctorId,
            priority, reasonCodes, clinicalNotes,
            requestedDate, expirationDate
        } = req.body;

        if (!patientId || !specialtyCode) {
            return res.status(400).json({ error: 'patientId and specialtyCode are required' });
        }

        const specialty = REFERRAL_SPECIALTIES.find(s => s.code === specialtyCode);
        if (!specialty) {
            return res.status(400).json({
                error: 'Invalid specialty code',
                availableSpecialties: REFERRAL_SPECIALTIES.map(s => ({ code: s.code, display: s.display })),
            });
        }

        // Look up target doctor name if provided
        let targetDoctorName = '';
        if (targetDoctorId) {
            const { Item: doctor } = await db.send(new GetCommand({
                TableName: TABLE_DOCTORS,
                Key: { cognitoSub: targetDoctorId },
            }));
            targetDoctorName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : '';
        }

        // Look up requesting doctor name
        const { Item: requestingDoc } = await db.send(new GetCommand({
            TableName: TABLE_DOCTORS,
            Key: { cognitoSub: user.id },
        }));
        const requestingDoctorName = requestingDoc ? `Dr. ${requestingDoc.firstName} ${requestingDoc.lastName}` : '';

        const referralId = uuidv4();
        const now = new Date().toISOString();

        const referral = {
            referralId,
            patientId,
            requestingDoctorId: user.id,
            requestingDoctorName,
            targetDoctorId: targetDoctorId || null,
            targetDoctorName,
            specialty,
            priority: priority || 'routine',
            status: 'active',
            reasonCodes: reasonCodes || [],
            clinicalNotes: clinicalNotes || '',
            requestedDate: requestedDate || now.split('T')[0],
            expirationDate: expirationDate || null,
            completedDate: null,
            createdAt: now,
            updatedAt: now,
        };

        await db.send(new PutCommand({ TableName: TABLE_REFERRALS, Item: referral }));

        await writeAuditLog(user.id, patientId, 'REFERRAL_CREATED', `Referral to ${specialty.display}`, { region, referralId, specialty: specialty.code });

        res.status(201).json(toFHIRServiceRequest(referral));

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to create referral', details: error.message });
    }
};

// ─── GET /referrals/patient/:patientId — Get referrals for a patient ────────

export const getPatientReferrals = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const { status } = req.query;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new QueryCommand({
            TableName: TABLE_REFERRALS,
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        let referrals = (Items || []);
        if (status) referrals = referrals.filter((r: any) => r.status === status);

        referrals.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.json({
            resourceType: 'Bundle',
            type: 'searchset',
            total: referrals.length,
            entry: referrals.map((r: any) => ({ resource: toFHIRServiceRequest(r) })),
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get referrals', details: error.message });
    }
};

// ─── GET /referrals/incoming — Get referrals directed to current doctor ─────

export const getIncomingReferrals = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new ScanCommand({
            TableName: TABLE_REFERRALS,
            FilterExpression: 'targetDoctorId = :did',
            ExpressionAttributeValues: { ':did': user.id },
        }));

        const referrals = (Items || [])
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((r: any) => toFHIRServiceRequest(r));

        res.json({ resourceType: 'Bundle', type: 'searchset', total: referrals.length, entry: referrals });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get incoming referrals', details: error.message });
    }
};

// ─── PUT /referrals/:referralId — Update referral status ────────────────────

export const updateReferral = async (req: Request, res: Response) => {
    try {
        const { referralId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Item: existing } = await db.send(new GetCommand({
            TableName: TABLE_REFERRALS,
            Key: { referralId },
        }));

        if (!existing) return res.status(404).json({ error: 'Referral not found' });

        const { status, clinicalNotes, targetDoctorId } = req.body;
        const now = new Date().toISOString();

        const updates: string[] = ['updatedAt = :now'];
        const values: any = { ':now': now };
        const names: any = {};

        if (status) {
            const validStatuses = ['active', 'completed', 'revoked', 'on-hold', 'entered-in-error'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
            }
            updates.push('#s = :s');
            values[':s'] = status;
            names['#s'] = 'status';

            if (status === 'completed') {
                updates.push('completedDate = :cd');
                values[':cd'] = now;
            }
        }

        if (clinicalNotes !== undefined) {
            updates.push('clinicalNotes = :cn');
            values[':cn'] = clinicalNotes;
        }

        if (targetDoctorId) {
            updates.push('targetDoctorId = :td');
            values[':td'] = targetDoctorId;

            const { Item: doc } = await db.send(new GetCommand({
                TableName: TABLE_DOCTORS,
                Key: { cognitoSub: targetDoctorId },
            }));
            if (doc) {
                updates.push('targetDoctorName = :tdn');
                values[':tdn'] = `Dr. ${doc.firstName} ${doc.lastName}`;
            }
        }

        await db.send(new UpdateCommand({
            TableName: TABLE_REFERRALS,
            Key: { referralId },
            UpdateExpression: `SET ${updates.join(', ')}`,
            ExpressionAttributeValues: values,
            ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
        }));

        await writeAuditLog(user.id, existing.patientId, 'REFERRAL_UPDATED', `Referral updated: ${status || 'modified'}`, { region, referralId });

        const { Item: updated } = await db.send(new GetCommand({ TableName: TABLE_REFERRALS, Key: { referralId } }));
        res.json(toFHIRServiceRequest(updated));

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to update referral', details: error.message });
    }
};

// ─── GET /referrals/specialties — List available specialties ────────────────

export const getReferralSpecialties = async (_req: Request, res: Response) => {
    res.json({
        specialties: REFERRAL_SPECIALTIES,
        priorities: [
            { code: 'routine', display: 'Routine' },
            { code: 'urgent', display: 'Urgent' },
            { code: 'asap', display: 'ASAP' },
            { code: 'stat', display: 'STAT (Immediate)' },
        ],
    });
};
