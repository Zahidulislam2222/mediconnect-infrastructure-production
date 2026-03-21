// ─── FEATURE #11: eCR (Electronic Case Reporting) ──────────────────────────
// Reportable condition triggers (COVID-19, TB, measles, hepatitis, STIs).
// Generates eICR documents as FHIR Composition resources.
// Stores in mediconnect-ecr-reports for public health reporting.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';

const TABLE = process.env.TABLE_ECR || 'mediconnect-ecr-reports';
const TABLE_PATIENTS = process.env.DYNAMO_TABLE || 'mediconnect-patients';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Reportable Conditions (CDC RCTC — Reportable Condition Trigger Codes) ─

interface ReportableCondition {
    code: string;
    system: 'ICD-10' | 'SNOMED';
    display: string;
    category: string;
    urgency: 'immediate' | 'routine' | 'urgent';
    reportingTimeframe: string;
    jurisdiction: string;
}

const REPORTABLE_CONDITIONS: ReportableCondition[] = [
    // Immediate (24-hour) reporting
    { code: 'U07.1', system: 'ICD-10', display: 'COVID-19, virus identified', category: 'Infectious', urgency: 'immediate', reportingTimeframe: '24 hours', jurisdiction: 'Federal + State' },
    { code: 'A15', system: 'ICD-10', display: 'Respiratory tuberculosis', category: 'Infectious', urgency: 'immediate', reportingTimeframe: '24 hours', jurisdiction: 'Federal + State' },
    { code: 'B05', system: 'ICD-10', display: 'Measles', category: 'Infectious', urgency: 'immediate', reportingTimeframe: '24 hours', jurisdiction: 'Federal + State' },
    { code: 'A39', system: 'ICD-10', display: 'Meningococcal infection', category: 'Infectious', urgency: 'immediate', reportingTimeframe: '24 hours', jurisdiction: 'Federal + State' },
    { code: 'A00', system: 'ICD-10', display: 'Cholera', category: 'Infectious', urgency: 'immediate', reportingTimeframe: '24 hours', jurisdiction: 'Federal + State' },
    { code: 'A20', system: 'ICD-10', display: 'Plague', category: 'Infectious', urgency: 'immediate', reportingTimeframe: 'Immediately', jurisdiction: 'Federal + State' },
    { code: 'A22', system: 'ICD-10', display: 'Anthrax', category: 'Infectious', urgency: 'immediate', reportingTimeframe: 'Immediately', jurisdiction: 'Federal + State' },
    { code: 'A75', system: 'ICD-10', display: 'Typhus fever', category: 'Infectious', urgency: 'immediate', reportingTimeframe: '24 hours', jurisdiction: 'Federal + State' },
    { code: 'A78', system: 'ICD-10', display: 'Q fever', category: 'Infectious', urgency: 'immediate', reportingTimeframe: '24 hours', jurisdiction: 'Federal + State' },
    { code: 'A98.4', system: 'ICD-10', display: 'Ebola virus disease', category: 'Infectious', urgency: 'immediate', reportingTimeframe: 'Immediately', jurisdiction: 'Federal + State + WHO' },

    // Urgent (3-day) reporting
    { code: 'B15', system: 'ICD-10', display: 'Acute hepatitis A', category: 'Infectious', urgency: 'urgent', reportingTimeframe: '3 days', jurisdiction: 'State' },
    { code: 'B16', system: 'ICD-10', display: 'Acute hepatitis B', category: 'Infectious', urgency: 'urgent', reportingTimeframe: '3 days', jurisdiction: 'State' },
    { code: 'B17.1', system: 'ICD-10', display: 'Acute hepatitis C', category: 'Infectious', urgency: 'urgent', reportingTimeframe: '3 days', jurisdiction: 'State' },
    { code: 'A54', system: 'ICD-10', display: 'Gonococcal infection', category: 'STI', urgency: 'urgent', reportingTimeframe: '3 days', jurisdiction: 'State' },
    { code: 'A51', system: 'ICD-10', display: 'Early syphilis', category: 'STI', urgency: 'urgent', reportingTimeframe: '3 days', jurisdiction: 'State' },
    { code: 'A56', system: 'ICD-10', display: 'Chlamydial infection', category: 'STI', urgency: 'urgent', reportingTimeframe: '3 days', jurisdiction: 'State' },

    // Routine (7-day) reporting
    { code: 'B20', system: 'ICD-10', display: 'HIV disease', category: 'Infectious', urgency: 'routine', reportingTimeframe: '7 days', jurisdiction: 'State' },
    { code: 'A01', system: 'ICD-10', display: 'Typhoid and paratyphoid fevers', category: 'Infectious', urgency: 'routine', reportingTimeframe: '7 days', jurisdiction: 'State' },
    { code: 'A02', system: 'ICD-10', display: 'Salmonella infections', category: 'Infectious', urgency: 'routine', reportingTimeframe: '7 days', jurisdiction: 'State' },
    { code: 'A03', system: 'ICD-10', display: 'Shigellosis', category: 'Infectious', urgency: 'routine', reportingTimeframe: '7 days', jurisdiction: 'State' },
    { code: 'A36', system: 'ICD-10', display: 'Diphtheria', category: 'Infectious', urgency: 'routine', reportingTimeframe: '7 days', jurisdiction: 'State' },
    { code: 'B06', system: 'ICD-10', display: 'Rubella', category: 'Infectious', urgency: 'routine', reportingTimeframe: '7 days', jurisdiction: 'State' },
    { code: 'A37', system: 'ICD-10', display: 'Whooping cough (Pertussis)', category: 'Infectious', urgency: 'routine', reportingTimeframe: '7 days', jurisdiction: 'State' },
    { code: 'A80', system: 'ICD-10', display: 'Acute poliomyelitis', category: 'Infectious', urgency: 'routine', reportingTimeframe: '7 days', jurisdiction: 'Federal + State' },
];

// ─── Build eICR FHIR Composition ───────────────────────────────────────────

function buildEICRComposition(report: any): any {
    return {
        resourceType: 'Composition',
        id: report.reportId,
        meta: {
            profile: ['http://hl7.org/fhir/us/ecr/StructureDefinition/eicr-composition']
        },
        status: report.status || 'final',
        type: {
            coding: [{
                system: 'http://loinc.org',
                code: '55751-2',
                display: 'Public Health Case Report'
            }]
        },
        subject: { reference: `Patient/${report.patientId}` },
        date: report.reportDate,
        author: report.authorId ? [{ reference: `Practitioner/${report.authorId}` }] : [],
        title: 'Initial Public Health Case Report',
        confidentiality: 'N',
        section: [
            // Reason for Report
            {
                title: 'Reason for Report',
                code: {
                    coding: [{
                        system: 'http://loinc.org',
                        code: '29549-3',
                        display: 'Reason for report'
                    }]
                },
                text: {
                    status: 'generated',
                    div: `<div xmlns="http://www.w3.org/1999/xhtml">Reportable condition: ${report.conditionDisplay} (${report.conditionCode})</div>`
                },
                entry: [{
                    reference: `Condition/${report.conditionId || report.reportId}`
                }]
            },
            // Encounters
            {
                title: 'Encounters',
                code: {
                    coding: [{
                        system: 'http://loinc.org',
                        code: '46240-8',
                        display: 'History of Encounters'
                    }]
                },
                text: {
                    status: 'generated',
                    div: `<div xmlns="http://www.w3.org/1999/xhtml">Encounter date: ${report.encounterDate || report.reportDate}</div>`
                }
            },
            // Reportability Response
            {
                title: 'Reportability Response Information',
                code: {
                    coding: [{
                        system: 'http://loinc.org',
                        code: '88085-6',
                        display: 'Reportability response information'
                    }]
                },
                text: {
                    status: 'generated',
                    div: `<div xmlns="http://www.w3.org/1999/xhtml">Reporting jurisdiction: ${report.jurisdiction}. Timeframe: ${report.reportingTimeframe}.</div>`
                }
            },
        ],
        // Extensions
        extension: [{
            url: 'http://hl7.org/fhir/us/ecr/StructureDefinition/eicr-trigger-code-flag-extension',
            valueCodeableConcept: {
                coding: [{
                    system: 'http://hl7.org/fhir/sid/icd-10-cm',
                    code: report.conditionCode,
                    display: report.conditionDisplay,
                }]
            }
        }]
    };
}

// ─── POST /public-health/ecr ───────────────────────────────────────────────

export const createECR = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);

        if (!user.isDoctor) {
            return res.status(403).json({ error: 'Only healthcare providers can file case reports' });
        }

        const {
            patientId, conditionCode, conditionDisplay,
            encounterDate, clinicalNotes, labResults,
        } = req.body;

        if (!patientId || !conditionCode) {
            return res.status(400).json({ error: 'patientId and conditionCode are required' });
        }

        // Find the reportable condition
        const condition = REPORTABLE_CONDITIONS.find(c => c.code === conditionCode);
        if (!condition) {
            return res.status(400).json({
                error: `${conditionCode} is not a recognized reportable condition`,
                reportableConditions: REPORTABLE_CONDITIONS.map(c => ({ code: c.code, display: c.display }))
            });
        }

        // Verify patient exists
        const db = getRegionalClient(region);
        const { Item: patient } = await db.send(new GetCommand({
            TableName: TABLE_PATIENTS,
            Key: { id: patientId }
        }));

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        const reportId = uuidv4();
        const now = new Date().toISOString();

        const report = {
            reportId,
            patientId,
            authorId: user.id,
            conditionCode: condition.code,
            conditionDisplay: conditionDisplay || condition.display,
            conditionCategory: condition.category,
            urgency: condition.urgency,
            reportingTimeframe: condition.reportingTimeframe,
            jurisdiction: condition.jurisdiction,
            status: 'final',
            reportDate: now,
            encounterDate: encounterDate || now,
            clinicalNotes,
            labResults,
            submittedToPublicHealth: false,
            createdAt: now,
        };

        await db.send(new PutCommand({ TableName: TABLE, Item: report }));

        await writeAuditLog(user.id, patientId, 'CREATE_ECR',
            `Filed eCR: ${condition.display} (${condition.code}) — ${condition.urgency} reporting`,
            { region, reportId, conditionCode: condition.code, urgency: condition.urgency }
        );

        const composition = buildEICRComposition(report);

        res.status(201).json({
            report: {
                id: reportId,
                status: 'filed',
                urgency: condition.urgency,
                reportingTimeframe: condition.reportingTimeframe,
                jurisdiction: condition.jurisdiction,
                message: `Reportable condition filed. ${condition.urgency === 'immediate' ? 'IMMEDIATE reporting required within ' + condition.reportingTimeframe + '.' : 'Report within ' + condition.reportingTimeframe + '.'}`,
            },
            fhirComposition: composition,
        });
    } catch (error: any) {
        console.error('Create eCR error:', error);
        res.status(500).json({ error: 'Failed to create electronic case report' });
    }
};

// ─── GET /public-health/ecr/:reportId ──────────────────────────────────────

export const getECR = async (req: Request, res: Response) => {
    try {
        const { reportId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        const db = getRegionalClient(region);

        // Scan for the report (reportId is SK, we need to find it)
        const { Items = [] } = await db.send(new ScanCommand({
            TableName: TABLE,
            FilterExpression: 'reportId = :rid',
            ExpressionAttributeValues: { ':rid': reportId },
            Limit: 1,
        }));

        if (Items.length === 0) {
            return res.status(404).json({ error: 'eCR report not found' });
        }

        const report = Items[0] as any;

        // Authorization: only the author or the patient can view
        if (user.id !== report.authorId && user.id !== report.patientId && !user.isAdmin) {
            return res.status(403).json({ error: 'Not authorized to view this report' });
        }

        await writeAuditLog(user.id, report.patientId, 'VIEW_ECR', `Viewed eCR: ${reportId}`, { region });

        res.json({
            report,
            fhirComposition: buildEICRComposition(report),
        });
    } catch (error: any) {
        console.error('Get eCR error:', error);
        res.status(500).json({ error: 'Failed to retrieve case report' });
    }
};

// ─── GET /public-health/ecr ────────────────────────────────────────────────

export const listECRs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const patientId = req.query.patientId as string;
        const urgency = req.query.urgency as string;

        const db = getRegionalClient(region);

        let filterParts: string[] = [];
        const values: any = {};

        if (patientId) {
            filterParts.push('patientId = :pid');
            values[':pid'] = patientId;
        }
        if (!user.isAdmin) {
            // Non-admins only see their own reports
            filterParts.push('(authorId = :uid OR patientId = :uid)');
            values[':uid'] = user.id;
        }
        if (urgency) {
            filterParts.push('urgency = :urg');
            values[':urg'] = urgency;
        }

        const params: any = {
            TableName: TABLE,
            Limit: 50,
        };

        if (filterParts.length > 0) {
            params.FilterExpression = filterParts.join(' AND ');
            params.ExpressionAttributeValues = values;
        }

        const { Items = [] } = await db.send(new ScanCommand(params));

        // Sort by date descending
        const sorted = Items.sort((a: any, b: any) =>
            new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime()
        );

        res.json({
            total: sorted.length,
            reports: sorted.map((r: any) => ({
                reportId: r.reportId,
                patientId: r.patientId,
                conditionCode: r.conditionCode,
                conditionDisplay: r.conditionDisplay,
                urgency: r.urgency,
                status: r.status,
                reportDate: r.reportDate,
                reportingTimeframe: r.reportingTimeframe,
            }))
        });
    } catch (error: any) {
        console.error('List eCRs error:', error);
        res.status(500).json({ error: 'Failed to list case reports' });
    }
};

// ─── GET /public-health/reportable-conditions ──────────────────────────────

export const getReportableConditions = async (req: Request, res: Response) => {
    const category = req.query.category as string;
    const urgency = req.query.urgency as string;

    let results = REPORTABLE_CONDITIONS;
    if (category) results = results.filter(c => c.category.toLowerCase() === category.toLowerCase());
    if (urgency) results = results.filter(c => c.urgency === urgency);

    const categories = [...new Set(REPORTABLE_CONDITIONS.map(c => c.category))];

    res.json({
        total: results.length,
        categories,
        conditions: results.map(c => ({
            code: c.code,
            system: c.system === 'ICD-10' ? 'http://hl7.org/fhir/sid/icd-10-cm' : 'http://snomed.info/sct',
            display: c.display,
            category: c.category,
            urgency: c.urgency,
            reportingTimeframe: c.reportingTimeframe,
            jurisdiction: c.jurisdiction,
        }))
    });
};
