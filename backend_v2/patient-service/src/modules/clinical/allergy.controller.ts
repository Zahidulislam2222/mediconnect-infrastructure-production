// ─── FEATURE #14: FHIR AllergyIntolerance Resource ─────────────────────────
// CRUD endpoints for patient allergy data. Used by RxNorm drug-allergy checks.
// Table: mediconnect-allergies (PK: patientId, SK: allergyId)
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';
import { validateUSCore } from '../../../../shared/us-core-profiles';
import { safeError } from '../../../../shared/logger';

const TABLE = process.env.TABLE_ALLERGIES || 'mediconnect-allergies';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Allergy Categories & Severity (FHIR R4 ValueSets) ────────────────────

const VALID_CATEGORIES = ['food', 'medication', 'environment', 'biologic'] as const;
const VALID_CRITICALITIES = ['low', 'high', 'unable-to-assess'] as const;
const VALID_TYPES = ['allergy', 'intolerance'] as const;
const VALID_CLINICAL_STATUSES = ['active', 'inactive', 'resolved'] as const;
const VALID_VERIFICATION_STATUSES = ['unconfirmed', 'presumed', 'confirmed', 'refuted', 'entered-in-error'] as const;

// Common allergens for quick lookup
const COMMON_ALLERGENS = [
    { code: '387458008', system: 'http://snomed.info/sct', display: 'Aspirin', category: 'medication' },
    { code: '372687004', system: 'http://snomed.info/sct', display: 'Amoxicillin', category: 'medication' },
    { code: '373270004', system: 'http://snomed.info/sct', display: 'Penicillin', category: 'medication' },
    { code: '387207008', system: 'http://snomed.info/sct', display: 'Ibuprofen', category: 'medication' },
    { code: '373254001', system: 'http://snomed.info/sct', display: 'Sulfonamide', category: 'medication' },
    { code: '387517004', system: 'http://snomed.info/sct', display: 'Codeine', category: 'medication' },
    { code: '89811004', system: 'http://snomed.info/sct', display: 'Latex', category: 'environment' },
    { code: '256259004', system: 'http://snomed.info/sct', display: 'Pollen', category: 'environment' },
    { code: '256277009', system: 'http://snomed.info/sct', display: 'Grass pollen', category: 'environment' },
    { code: '264295007', system: 'http://snomed.info/sct', display: 'Tree pollen', category: 'environment' },
    { code: '227493005', system: 'http://snomed.info/sct', display: 'Peanut', category: 'food' },
    { code: '102263004', system: 'http://snomed.info/sct', display: 'Eggs', category: 'food' },
    { code: '3718001', system: 'http://snomed.info/sct', display: 'Cow milk', category: 'food' },
    { code: '735029006', system: 'http://snomed.info/sct', display: 'Shellfish', category: 'food' },
    { code: '256350002', system: 'http://snomed.info/sct', display: 'Wheat', category: 'food' },
    { code: '256349002', system: 'http://snomed.info/sct', display: 'Soy', category: 'food' },
    { code: '420174000', system: 'http://snomed.info/sct', display: 'Bee venom', category: 'biologic' },
    { code: '260147004', system: 'http://snomed.info/sct', display: 'House dust mite', category: 'environment' },
];

// ─── Build FHIR AllergyIntolerance Resource ────────────────────────────────

function toFHIR(record: any): any {
    return {
        resourceType: 'AllergyIntolerance',
        id: record.allergyId,
        clinicalStatus: {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
                code: record.clinicalStatus || 'active',
                display: (record.clinicalStatus || 'active').charAt(0).toUpperCase() + (record.clinicalStatus || 'active').slice(1)
            }]
        },
        verificationStatus: {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
                code: record.verificationStatus || 'confirmed',
                display: (record.verificationStatus || 'confirmed').charAt(0).toUpperCase() + (record.verificationStatus || 'confirmed').slice(1)
            }]
        },
        type: record.type || 'allergy',
        category: record.category ? [record.category] : ['medication'],
        criticality: record.criticality || 'unable-to-assess',
        code: record.code || { text: record.substance },
        patient: { reference: `Patient/${record.patientId}` },
        onsetDateTime: record.onsetDate,
        recordedDate: record.recordedDate,
        recorder: record.recordedBy ? { reference: `Practitioner/${record.recordedBy}` } : undefined,
        note: record.notes ? [{ text: record.notes }] : undefined,
        reaction: record.reactions?.map((r: any) => ({
            substance: r.substance ? { text: r.substance } : undefined,
            manifestation: (r.manifestations || []).map((m: string) => ({ coding: [{ display: m }] })),
            severity: r.severity,
            description: r.description
        }))
    };
}

// ─── GET /patients/:patientId/allergies ────────────────────────────────────

export const getPatientAllergies = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        // Authorization: patient can see own, doctors can see their patients'
        if (!user.isDoctor && user.id !== patientId) {
            return res.status(403).json({ error: 'Not authorized to view this patient\'s allergies' });
        }

        const db = getRegionalClient(region);
        const { Items = [] } = await db.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        const category = req.query.category as string;
        const status = req.query.status as string;

        let filtered = Items;
        if (category) filtered = filtered.filter((i: any) => i.category === category);
        if (status) filtered = filtered.filter((i: any) => i.clinicalStatus === status);

        const bundle = {
            resourceType: 'Bundle',
            type: 'searchset',
            total: filtered.length,
            entry: filtered.map((item: any) => ({
                resource: toFHIR(item)
            }))
        };

        await writeAuditLog(user.id, patientId, 'VIEW_ALLERGIES', `Viewed allergies for patient ${patientId}`, { region });

        res.json(bundle);
    } catch (error: any) {
        safeError('Get allergies error:', error);
        res.status(500).json({ error: 'Failed to retrieve allergies' });
    }
};

// ─── POST /patients/:patientId/allergies ───────────────────────────────────

export const createAllergy = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        // Only doctors or the patient themselves can add allergies
        if (!user.isDoctor && user.id !== patientId) {
            return res.status(403).json({ error: 'Not authorized to add allergies for this patient' });
        }

        const {
            substance, code, category, type, criticality,
            clinicalStatus, verificationStatus, onsetDate,
            notes, reactions
        } = req.body;

        if (!substance && !code) {
            return res.status(400).json({ error: 'Either substance name or code is required' });
        }

        // Validate enums
        if (category && !VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
        }
        if (criticality && !VALID_CRITICALITIES.includes(criticality)) {
            return res.status(400).json({ error: `Invalid criticality. Must be one of: ${VALID_CRITICALITIES.join(', ')}` });
        }

        const allergyId = uuidv4();
        const now = new Date().toISOString();

        const record = {
            patientId,
            allergyId,
            substance: substance || code?.text || code?.coding?.[0]?.display || 'Unknown',
            code: code || (substance ? { text: substance } : undefined),
            category: category || 'medication',
            type: type || 'allergy',
            criticality: criticality || 'unable-to-assess',
            clinicalStatus: clinicalStatus || 'active',
            verificationStatus: verificationStatus || 'confirmed',
            onsetDate,
            recordedDate: now,
            recordedBy: user.id,
            notes,
            reactions: reactions || [],
            createdAt: now,
            updatedAt: now,
        };

        // ─── Gap #4 FIX: US Core validation before write ─────────────────
        const fhirResource = toFHIR(record);
        const validation = validateUSCore(fhirResource);
        if (!validation.valid) {
            return res.status(422).json({
                error: 'US Core AllergyIntolerance validation failed',
                profile: validation.profile,
                issues: validation.errors,
            });
        }

        const db = getRegionalClient(region);
        await db.send(new PutCommand({ TableName: TABLE, Item: record }));

        await writeAuditLog(user.id, patientId, 'CREATE_ALLERGY', `Created allergy record: ${record.substance}`, { region, allergyId });

        res.status(201).json(fhirResource);
    } catch (error: any) {
        safeError('Create allergy error:', error);
        res.status(500).json({ error: 'Failed to create allergy record' });
    }
};

// ─── PUT /patients/:patientId/allergies/:allergyId ─────────────────────────

export const updateAllergy = async (req: Request, res: Response) => {
    try {
        const { patientId, allergyId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        if (!user.isDoctor && user.id !== patientId) {
            return res.status(403).json({ error: 'Not authorized to update this allergy' });
        }

        const db = getRegionalClient(region);

        // Verify record exists
        const { Item } = await db.send(new GetCommand({
            TableName: TABLE,
            Key: { patientId, allergyId }
        }));

        if (!Item) {
            return res.status(404).json({ error: 'Allergy record not found' });
        }

        const allowedFields = ['clinicalStatus', 'verificationStatus', 'criticality', 'notes', 'reactions', 'onsetDate'];
        const updates: string[] = [];
        const names: any = {};
        const values: any = { ':now': new Date().toISOString() };

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates.push(`#${field} = :${field}`);
                names[`#${field}`] = field;
                values[`:${field}`] = req.body[field];
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        updates.push('#updatedAt = :now');
        names['#updatedAt'] = 'updatedAt';

        const { Attributes } = await db.send(new UpdateCommand({
            TableName: TABLE,
            Key: { patientId, allergyId },
            UpdateExpression: `SET ${updates.join(', ')}`,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: 'ALL_NEW'
        }));

        await writeAuditLog(user.id, patientId, 'UPDATE_ALLERGY', `Updated allergy: ${allergyId}`, { region, allergyId });

        res.json(toFHIR(Attributes));
    } catch (error: any) {
        safeError('Update allergy error:', error);
        res.status(500).json({ error: 'Failed to update allergy record' });
    }
};

// ─── DELETE /patients/:patientId/allergies/:allergyId ──────────────────────

export const deleteAllergy = async (req: Request, res: Response) => {
    try {
        const { patientId, allergyId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        // Only doctors can delete allergy records (clinical safety)
        if (!user.isDoctor) {
            return res.status(403).json({ error: 'Only doctors can delete allergy records' });
        }

        const db = getRegionalClient(region);

        const { Item } = await db.send(new GetCommand({
            TableName: TABLE,
            Key: { patientId, allergyId }
        }));

        if (!Item) {
            return res.status(404).json({ error: 'Allergy record not found' });
        }

        await db.send(new DeleteCommand({
            TableName: TABLE,
            Key: { patientId, allergyId }
        }));

        await writeAuditLog(user.id, patientId, 'DELETE_ALLERGY', `Deleted allergy: ${(Item as any).substance}`, { region, allergyId });

        res.json({ message: 'Allergy record deleted', id: allergyId });
    } catch (error: any) {
        safeError('Delete allergy error:', error);
        res.status(500).json({ error: 'Failed to delete allergy record' });
    }
};

// ─── GET /allergies/common ─────────────────────────────────────────────────

export const getCommonAllergens = async (_req: Request, res: Response) => {
    const category = _req.query.category as string;
    let results = COMMON_ALLERGENS;
    if (category) {
        results = results.filter(a => a.category === category);
    }
    res.json({
        resourceType: 'Bundle',
        type: 'collection',
        total: results.length,
        entry: results.map(a => ({
            resource: {
                resourceType: 'AllergyIntolerance',
                code: { coding: [{ system: a.system, code: a.code, display: a.display }] },
                category: [a.category]
            }
        }))
    });
};
