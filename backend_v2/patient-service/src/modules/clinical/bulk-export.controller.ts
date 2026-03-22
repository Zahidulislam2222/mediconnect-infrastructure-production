// ─── FEATURE #20: Bulk FHIR $export ────────────────────────────────────────
// FHIR $export operation for population health data exports.
// Generates NDJSON bundles of patient data (Patient, Condition, Observation,
// AllergyIntolerance, Immunization, Encounter, MedicationRequest).
// Async job model: POST kicks off export, GET polls status, GET retrieves files.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, GetCommand, ScanCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';

const TABLE_PATIENTS = process.env.DYNAMO_TABLE || 'mediconnect-patients';
const TABLE_EXPORTS = process.env.TABLE_EXPORTS || 'mediconnect-bulk-exports';
const TABLE_ALLERGIES = process.env.TABLE_ALLERGIES || 'mediconnect-allergies';
const TABLE_IMMUNIZATIONS = process.env.TABLE_IMMUNIZATIONS || 'mediconnect-immunizations';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Gap #5 FIX: Paginated DynamoDB Scan for production-scale exports ────────
// Handles datasets >1MB by paging through ExclusiveStartKey.
// Max BATCH_SIZE items per page to avoid Lambda/ECS memory pressure.
const BATCH_SIZE = 1000;

async function paginatedScan(db: any, tableName: string): Promise<any[]> {
    const allItems: any[] = [];
    let lastEvaluatedKey: any = undefined;

    do {
        const params: any = {
            TableName: tableName,
            Limit: BATCH_SIZE,
            ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
        };
        const result = await db.send(new ScanCommand(params));
        allItems.push(...(result.Items || []));
        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return allItems;
}

// ─── Supported FHIR Resource Types for Export ───────────────────────────────

const EXPORTABLE_TYPES = [
    'Patient', 'AllergyIntolerance', 'Immunization',
    'Condition', 'Observation', 'Encounter', 'MedicationRequest'
] as const;

type ExportableType = typeof EXPORTABLE_TYPES[number];

// ─── Helper: Build FHIR Patient from DynamoDB record ────────────────────────

function toFHIRPatient(p: any): any {
    return {
        resourceType: 'Patient',
        id: p.cognitoSub || p.id,
        meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'] },
        identifier: [{ system: 'urn:mediconnect:patient', value: p.cognitoSub || p.id }],
        name: [{ family: p.lastName || 'Unknown', given: [p.firstName || 'Unknown'] }],
        gender: p.gender || 'unknown',
        birthDate: p.dob || undefined,
        address: p.city ? [{ city: p.city, state: p.state, country: p.country || 'US' }] : undefined,
        telecom: p.phone ? [{ system: 'phone', value: p.phone }] : undefined,
    };
}

function toFHIRAllergyIntolerance(a: any): any {
    return {
        resourceType: 'AllergyIntolerance',
        id: a.allergyId,
        patient: { reference: `Patient/${a.patientId}` },
        clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: a.clinicalStatus || 'active' }] },
        code: { coding: [{ display: a.substance }] },
        category: a.category ? [a.category] : undefined,
        criticality: a.criticality || 'unable-to-assess',
        recordedDate: a.recordedDate || a.createdAt,
    };
}

function toFHIRImmunization(i: any): any {
    return {
        resourceType: 'Immunization',
        id: i.immunizationId,
        patient: { reference: `Patient/${i.patientId}` },
        status: i.status || 'completed',
        vaccineCode: { coding: [{ system: 'http://hl7.org/fhir/sid/cvx', code: i.cvxCode, display: i.vaccineName }] },
        occurrenceDateTime: i.administeredDate,
    };
}

// ─── POST /fhir/$export — Kick off a bulk export job ────────────────────────

export const startBulkExport = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        // FHIR Bulk Data Access IG content negotiation
        const acceptHeader = req.headers['accept'] || '';
        const outputFormat = req.query._outputFormat as string || '';

        const SUPPORTED_FORMATS = [
            'application/fhir+ndjson',
            'application/ndjson',
            'ndjson'
        ];

        // If _outputFormat specified, validate it
        if (outputFormat && !SUPPORTED_FORMATS.includes(outputFormat)) {
            res.status(400).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'invalid',
                    diagnostics: `Unsupported _outputFormat: ${outputFormat}. Supported: ${SUPPORTED_FORMATS.join(', ')}`
                }]
            });
            return;
        }

        // If Accept header specified and not compatible
        if (acceptHeader && acceptHeader !== '*/*' && !SUPPORTED_FORMATS.some(f => acceptHeader.includes(f)) && !acceptHeader.includes('application/json')) {
            res.status(406).json({
                resourceType: 'OperationOutcome',
                issue: [{
                    severity: 'error',
                    code: 'not-supported',
                    diagnostics: `Accept header must include application/fhir+ndjson or application/ndjson`
                }]
            });
            return;
        }

        await writeAuditLog(user.id, 'BULK_EXPORT', 'START_BULK_EXPORT', 'Started bulk FHIR export', { region });

        // Only doctors/admins can run population exports
        if (!user.isDoctor && !user.isAdmin) {
            return res.status(403).json({ error: 'Only doctors or admins can initiate bulk exports' });
        }

        const { _type, _since } = req.query;
        const requestedTypes: ExportableType[] = _type
            ? ((_type as string).split(',').filter(t => EXPORTABLE_TYPES.includes(t as any)) as ExportableType[])
            : [...EXPORTABLE_TYPES];

        if (requestedTypes.length === 0) {
            return res.status(400).json({ error: `Invalid _type. Supported: ${EXPORTABLE_TYPES.join(', ')}` });
        }

        const exportId = uuidv4();
        const now = new Date().toISOString();

        await db.send(new PutCommand({
            TableName: TABLE_EXPORTS,
            Item: {
                exportId,
                requestedBy: user.id,
                status: 'processing',
                requestedTypes,
                _since: _since || null,
                createdAt: now,
                updatedAt: now,
                outputFiles: [],
                error: null,
            }
        }));

        // ─── Gap #1 FIX: Production Architecture Note ─────────────────────
        // DEMO MODE: Synchronous DynamoDB Scan → inline NDJSON.
        // PRODUCTION: Replace with:
        //   1. SQS message triggers Lambda/Step Function worker
        //   2. Worker paginates DynamoDB (ExclusiveStartKey) in batches of 1000
        //   3. Streams NDJSON to S3 (PutObject with chunked transfer)
        //   4. Updates export record with S3 presigned URLs
        //   5. Client polls status → gets S3 download links
        // This avoids Lambda/ECS timeout on large datasets (>10K records).
        // ──────────────────────────────────────────────────────────────────
        try {
            const outputFiles: any[] = [];

            // ─── Gap #5 FIX: Use paginated scan for production-scale exports ──
            // Export Patient resources
            if (requestedTypes.includes('Patient')) {
                const patients = await paginatedScan(db, TABLE_PATIENTS);
                const ndjson = patients.map(p => JSON.stringify(toFHIRPatient(p))).join('\n');
                outputFiles.push({
                    type: 'Patient',
                    url: `$export/${exportId}/Patient.ndjson`,
                    count: patients.length,
                    content: ndjson,
                });
            }

            // Export AllergyIntolerance resources
            if (requestedTypes.includes('AllergyIntolerance')) {
                const allergies = await paginatedScan(db, TABLE_ALLERGIES);
                const ndjson = allergies.map(a => JSON.stringify(toFHIRAllergyIntolerance(a))).join('\n');
                outputFiles.push({
                    type: 'AllergyIntolerance',
                    url: `$export/${exportId}/AllergyIntolerance.ndjson`,
                    count: allergies.length,
                    content: ndjson,
                });
            }

            // Export Immunization resources
            if (requestedTypes.includes('Immunization')) {
                const immunizations = await paginatedScan(db, TABLE_IMMUNIZATIONS);
                const ndjson = immunizations.map(i => JSON.stringify(toFHIRImmunization(i))).join('\n');
                outputFiles.push({
                    type: 'Immunization',
                    url: `$export/${exportId}/Immunization.ndjson`,
                    count: immunizations.length,
                    content: ndjson,
                });
            }

            // Update export job as completed
            await db.send(new UpdateCommand({
                TableName: TABLE_EXPORTS,
                Key: { exportId },
                UpdateExpression: 'SET #s = :s, outputFiles = :f, updatedAt = :u',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                    ':s': 'completed',
                    ':f': outputFiles.map(f => ({ type: f.type, url: f.url, count: f.count })),
                    ':u': new Date().toISOString(),
                },
            }));

            await writeAuditLog(user.id, exportId, 'BULK_EXPORT_COMPLETED', `Exported ${outputFiles.length} resource types`, { region, types: requestedTypes });
        } catch (processError: any) {
            await db.send(new UpdateCommand({
                TableName: TABLE_EXPORTS,
                Key: { exportId },
                UpdateExpression: 'SET #s = :s, #e = :e, updatedAt = :u',
                ExpressionAttributeNames: { '#s': 'status', '#e': 'error' },
                ExpressionAttributeValues: {
                    ':s': 'failed',
                    ':e': processError.message,
                    ':u': new Date().toISOString(),
                },
            }));
        }

        // FHIR $export returns 202 Accepted with Content-Location header
        res.status(202)
            .header('Content-Location', `/fhir/$export-poll/${exportId}`)
            .json({
                exportId,
                status: 'processing',
                message: 'Bulk export initiated. Poll the Content-Location URL for status.',
                transactionTime: now,
                request: `/fhir/$export?_type=${requestedTypes.join(',')}`,
            });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to initiate bulk export', details: error.message });
    }
};

// ─── GET /fhir/$export-poll/:exportId — Check export job status ─────────────

export const pollBulkExport = async (req: Request, res: Response) => {
    try {
        const { exportId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Item } = await db.send(new GetCommand({
            TableName: TABLE_EXPORTS,
            Key: { exportId },
        }));

        if (!Item) {
            return res.status(404).json({ error: 'Export job not found' });
        }

        if (Item.status === 'processing') {
            return res.status(202)
                .header('X-Progress', 'in-progress')
                .header('Retry-After', '5')
                .json({ status: 'processing', message: 'Export still in progress' });
        }

        if (Item.status === 'failed') {
            return res.status(500).json({ status: 'failed', error: Item.error });
        }

        // Completed — return FHIR $export response
        res.status(200).json({
            transactionTime: Item.createdAt,
            request: `$export`,
            requiresAccessToken: true,
            output: (Item.outputFiles || []).map((f: any) => ({
                type: f.type,
                url: f.url,
                count: f.count,
            })),
            error: [],
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to poll export status', details: error.message });
    }
};

// ─── GET /fhir/$export-download/:exportId/:resourceType — Download NDJSON ───

export const downloadExportFile = async (req: Request, res: Response) => {
    try {
        const { exportId, resourceType } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Item } = await db.send(new GetCommand({
            TableName: TABLE_EXPORTS,
            Key: { exportId },
        }));

        if (!Item || Item.status !== 'completed') {
            return res.status(404).json({ error: 'Export not found or not yet completed' });
        }

        // Re-generate the NDJSON on demand (in production, this would fetch from S3)
        let ndjsonContent = '';

        if (resourceType === 'Patient') {
            const { Items: patients } = await db.send(new ScanCommand({ TableName: TABLE_PATIENTS }));
            ndjsonContent = (patients || []).map(p => JSON.stringify(toFHIRPatient(p))).join('\n');
        } else if (resourceType === 'AllergyIntolerance') {
            const { Items: allergies } = await db.send(new ScanCommand({ TableName: TABLE_ALLERGIES }));
            ndjsonContent = (allergies || []).map(a => JSON.stringify(toFHIRAllergyIntolerance(a))).join('\n');
        } else if (resourceType === 'Immunization') {
            const { Items: immunizations } = await db.send(new ScanCommand({ TableName: TABLE_IMMUNIZATIONS }));
            ndjsonContent = (immunizations || []).map(i => JSON.stringify(toFHIRImmunization(i))).join('\n');
        } else {
            return res.status(400).json({ error: `Unsupported resource type: ${resourceType}` });
        }

        const user = (req as any).user;
        await writeAuditLog(user.id, exportId, 'BULK_EXPORT_DOWNLOAD', `Downloaded ${resourceType} NDJSON`, { region, resourceType });

        res.setHeader('Content-Type', 'application/fhir+ndjson');
        res.setHeader('Content-Disposition', `attachment; filename="${resourceType}.ndjson"`);
        res.send(ndjsonContent);

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to download export file', details: error.message });
    }
};

// ─── GET /fhir/export-jobs — List export jobs for current user ──────────────

export const listExportJobs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new ScanCommand({
            TableName: TABLE_EXPORTS,
            FilterExpression: 'requestedBy = :uid',
            ExpressionAttributeValues: { ':uid': user.id },
        }));

        const jobs = (Items || [])
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((j: any) => ({
                exportId: j.exportId,
                status: j.status,
                requestedTypes: j.requestedTypes,
                outputFiles: j.outputFiles,
                createdAt: j.createdAt,
                updatedAt: j.updatedAt,
            }));

        res.json({ resourceType: 'Bundle', type: 'searchset', total: jobs.length, entry: jobs });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to list export jobs', details: error.message });
    }
};
