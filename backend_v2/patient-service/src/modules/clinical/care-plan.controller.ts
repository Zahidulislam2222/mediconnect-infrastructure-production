// ─── FEATURE #25: CarePlan FHIR Resource ──────────────────────────────────
// Chronic care management and care coordination plans.
// FHIR CarePlan with activities, goals, conditions, and care team.
// Supports multiple plan categories: chronic-care, post-discharge,
// preventive, behavioral-health, and custom plans.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';
import { validateUSCore } from '../../../../shared/us-core-profiles';

const TABLE_CAREPLANS = process.env.TABLE_CAREPLANS || 'mediconnect-care-plans';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── CarePlan Categories ────────────────────────────────────────────────────

const CAREPLAN_CATEGORIES = [
    { code: 'chronic-care', display: 'Chronic Care Management', system: 'http://hl7.org/fhir/us/core/CodeSystem/careplan-category' },
    { code: 'post-discharge', display: 'Post-Discharge Follow-up', system: 'http://hl7.org/fhir/us/core/CodeSystem/careplan-category' },
    { code: 'preventive', display: 'Preventive Care Plan', system: 'http://hl7.org/fhir/us/core/CodeSystem/careplan-category' },
    { code: 'behavioral-health', display: 'Behavioral Health Plan', system: 'http://hl7.org/fhir/us/core/CodeSystem/careplan-category' },
    { code: 'assess-plan', display: 'Assessment and Plan of Treatment', system: 'http://hl7.org/fhir/us/core/CodeSystem/careplan-category' },
];

// ─── Activity Templates ────────────────────────────────────────────────────

const ACTIVITY_TEMPLATES: Record<string, any[]> = {
    'chronic-care': [
        { code: '170258001', display: 'Chronic disease management', system: 'http://snomed.info/sct' },
        { code: '710081004', display: 'Self-monitoring of health status', system: 'http://snomed.info/sct' },
        { code: '385763009', display: 'Dietary and nutritional regime', system: 'http://snomed.info/sct' },
        { code: '229065009', display: 'Exercise therapy', system: 'http://snomed.info/sct' },
        { code: '430193006', display: 'Medication reconciliation', system: 'http://snomed.info/sct' },
    ],
    'post-discharge': [
        { code: '306206005', display: 'Referral to rehabilitation service', system: 'http://snomed.info/sct' },
        { code: '183644000', display: 'Follow-up appointment', system: 'http://snomed.info/sct' },
        { code: '410265008', display: 'Medication education', system: 'http://snomed.info/sct' },
        { code: '305396003', display: 'Wound care follow-up', system: 'http://snomed.info/sct' },
    ],
    'preventive': [
        { code: '243788004', display: 'Health screening', system: 'http://snomed.info/sct' },
        { code: '171207006', display: 'Immunization schedule', system: 'http://snomed.info/sct' },
        { code: '61310001', display: 'Nutrition counseling', system: 'http://snomed.info/sct' },
        { code: '710841007', display: 'Cancer screening', system: 'http://snomed.info/sct' },
    ],
    'behavioral-health': [
        { code: '228557008', display: 'Cognitive behavioral therapy', system: 'http://snomed.info/sct' },
        { code: '410289001', display: 'Anxiety management', system: 'http://snomed.info/sct' },
        { code: '24165007', display: 'Substance abuse treatment', system: 'http://snomed.info/sct' },
        { code: '385724002', display: 'Stress management education', system: 'http://snomed.info/sct' },
    ],
};

// ─── Helper: Build FHIR CarePlan ────────────────────────────────────────────

function toFHIRCarePlan(plan: any): any {
    return {
        resourceType: 'CarePlan',
        id: plan.carePlanId,
        meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-careplan'] },
        status: plan.status,
        intent: plan.intent || 'plan',
        category: [{
            coding: [plan.category || CAREPLAN_CATEGORIES[0]],
        }],
        title: plan.title,
        description: plan.description,
        subject: { reference: `Patient/${plan.patientId}` },
        period: {
            start: plan.startDate,
            end: plan.endDate || undefined,
        },
        author: plan.authorId ? { reference: `Practitioner/${plan.authorId}` } : undefined,
        careTeam: (plan.careTeam || []).map((m: any) => ({ reference: `Practitioner/${m.id}`, display: m.name })),
        addresses: (plan.conditions || []).map((c: any) => ({
            reference: `Condition/${c.code}`,
            display: c.display,
        })),
        goal: (plan.goals || []).map((g: any) => ({
            reference: `Goal/${g.id}`,
            display: g.description,
        })),
        activity: (plan.activities || []).map((a: any) => ({
            detail: {
                status: a.status || 'not-started',
                code: a.code ? { coding: [a.code] } : undefined,
                description: a.description,
                scheduledPeriod: a.scheduledDate ? { start: a.scheduledDate } : undefined,
            },
        })),
        note: plan.notes ? [{ text: plan.notes }] : undefined,
        created: plan.createdAt,
    };
}

// ─── POST /care-plans — Create a care plan ──────────────────────────────────

export const createCarePlan = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const {
            patientId, title, description, categoryCode,
            startDate, endDate, conditions, goals, activities,
            careTeam, notes, useTemplate
        } = req.body;

        if (!patientId || !title) {
            return res.status(400).json({ error: 'patientId and title are required' });
        }

        const category = CAREPLAN_CATEGORIES.find(c => c.code === categoryCode) || CAREPLAN_CATEGORIES[0];

        // Optionally populate activities from template
        let resolvedActivities = activities || [];
        if (useTemplate && ACTIVITY_TEMPLATES[categoryCode]) {
            resolvedActivities = ACTIVITY_TEMPLATES[categoryCode].map(t => ({
                code: t,
                description: t.display,
                status: 'not-started',
            }));
        }

        const carePlanId = uuidv4();
        const now = new Date().toISOString();

        const plan = {
            carePlanId,
            patientId,
            authorId: user.id,
            title,
            description: description || '',
            category,
            status: 'active',
            intent: 'plan',
            startDate: startDate || now.split('T')[0],
            endDate: endDate || null,
            conditions: conditions || [],
            goals: (goals || []).map((g: any) => ({ ...g, id: g.id || uuidv4() })),
            activities: resolvedActivities.map((a: any, i: number) => ({ ...a, id: a.id || `activity-${i}` })),
            careTeam: careTeam || [],
            notes: notes || '',
            createdAt: now,
            updatedAt: now,
        };

        // ─── Gap #4 FIX: US Core validation before write ─────────────────
        const fhirResource = toFHIRCarePlan(plan);
        const validation = validateUSCore(fhirResource);
        if (!validation.valid) {
            return res.status(422).json({
                error: 'US Core CarePlan validation failed',
                profile: validation.profile,
                issues: validation.errors,
            });
        }

        await db.send(new PutCommand({ TableName: TABLE_CAREPLANS, Item: plan }));

        await writeAuditLog(user.id, patientId, 'CAREPLAN_CREATED', `Created care plan: ${title}`, { region, carePlanId, category: category.code });

        res.status(201).json(fhirResource);

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to create care plan', details: error.message });
    }
};

// ─── GET /care-plans/:patientId — Get patient's care plans ──────────────────

export const getPatientCarePlans = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const { status, category } = req.query;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new QueryCommand({
            TableName: TABLE_CAREPLANS,
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        let plans = (Items || []);

        if (status) plans = plans.filter((p: any) => p.status === status);
        if (category) plans = plans.filter((p: any) => p.category?.code === category);

        plans.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.json({
            resourceType: 'Bundle',
            type: 'searchset',
            total: plans.length,
            entry: plans.map((p: any) => ({ resource: toFHIRCarePlan(p) })),
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get care plans', details: error.message });
    }
};

// ─── GET /care-plans/detail/:carePlanId — Get a specific care plan ──────────

export const getCarePlan = async (req: Request, res: Response) => {
    try {
        const { carePlanId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Item } = await db.send(new GetCommand({
            TableName: TABLE_CAREPLANS,
            Key: { carePlanId },
        }));

        if (!Item) return res.status(404).json({ error: 'Care plan not found' });

        res.json(toFHIRCarePlan(Item));

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get care plan', details: error.message });
    }
};

// ─── PUT /care-plans/:carePlanId — Update a care plan ───────────────────────

export const updateCarePlan = async (req: Request, res: Response) => {
    try {
        const { carePlanId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Item: existing } = await db.send(new GetCommand({
            TableName: TABLE_CAREPLANS,
            Key: { carePlanId },
        }));

        if (!existing) return res.status(404).json({ error: 'Care plan not found' });

        const { status, title, description, endDate, conditions, goals, activities, careTeam, notes } = req.body;
        const now = new Date().toISOString();

        const updates: string[] = ['updatedAt = :now'];
        const values: any = { ':now': now };
        const names: any = {};

        if (status) { updates.push('#s = :s'); values[':s'] = status; names['#s'] = 'status'; }
        if (title) { updates.push('title = :t'); values[':t'] = title; }
        if (description !== undefined) { updates.push('description = :d'); values[':d'] = description; }
        if (endDate) { updates.push('endDate = :ed'); values[':ed'] = endDate; }
        if (conditions) { updates.push('conditions = :c'); values[':c'] = conditions; }
        if (goals) { updates.push('goals = :g'); values[':g'] = goals.map((g: any) => ({ ...g, id: g.id || uuidv4() })); }
        if (activities) { updates.push('activities = :a'); values[':a'] = activities; }
        if (careTeam) { updates.push('careTeam = :ct'); values[':ct'] = careTeam; }
        if (notes !== undefined) { updates.push('notes = :n'); values[':n'] = notes; }

        await db.send(new UpdateCommand({
            TableName: TABLE_CAREPLANS,
            Key: { carePlanId },
            UpdateExpression: `SET ${updates.join(', ')}`,
            ExpressionAttributeValues: values,
            ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
        }));

        await writeAuditLog(user.id, existing.patientId, 'CAREPLAN_UPDATED', `Updated care plan: ${existing.title}`, { region, carePlanId });

        const { Item: updated } = await db.send(new GetCommand({ TableName: TABLE_CAREPLANS, Key: { carePlanId } }));
        res.json(toFHIRCarePlan(updated));

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to update care plan', details: error.message });
    }
};

// ─── GET /care-plans/categories — List available categories and templates ────

export const getCarePlanCategories = async (_req: Request, res: Response) => {
    res.json({
        categories: CAREPLAN_CATEGORIES,
        templates: Object.entries(ACTIVITY_TEMPLATES).map(([key, activities]) => ({
            categoryCode: key,
            activities,
        })),
    });
};
