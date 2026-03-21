// ─── FEATURE #17: Lab Orders + Results (ORM/ORU) ───────────────────────────
// Lab order management with LOINC codes.
// Generates HL7 v2.x ORM^O01 (orders) and ORU^R01 (results).
// Table: mediconnect-lab-orders (PK: orderId, SK: patientId)
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';
import { validateUSCore } from '../../../../shared/us-core-profiles';

const TABLE = process.env.TABLE_LAB_ORDERS || 'mediconnect-lab-orders';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Common LOINC Lab Test Panels ──────────────────────────────────────────

interface LabTest {
    loinc: string;
    display: string;
    panel?: string;
    category: string;
    specimen: string;
    units: string;
    referenceRange?: string;
    turnaroundTime: string;
}

const LAB_TESTS: LabTest[] = [
    // Complete Blood Count (CBC)
    { loinc: '58410-2', display: 'CBC panel - Blood by Automated count', panel: 'CBC', category: 'Hematology', specimen: 'Blood', units: '', referenceRange: '', turnaroundTime: '4 hours' },
    { loinc: '6690-2', display: 'Leukocytes [#/volume] in Blood', panel: 'CBC', category: 'Hematology', specimen: 'Blood', units: '10*3/uL', referenceRange: '4.5-11.0', turnaroundTime: '4 hours' },
    { loinc: '789-8', display: 'Erythrocytes [#/volume] in Blood', panel: 'CBC', category: 'Hematology', specimen: 'Blood', units: '10*6/uL', referenceRange: '4.5-5.5', turnaroundTime: '4 hours' },
    { loinc: '718-7', display: 'Hemoglobin [Mass/volume] in Blood', panel: 'CBC', category: 'Hematology', specimen: 'Blood', units: 'g/dL', referenceRange: '12.0-17.5', turnaroundTime: '4 hours' },
    { loinc: '777-3', display: 'Platelets [#/volume] in Blood', panel: 'CBC', category: 'Hematology', specimen: 'Blood', units: '10*3/uL', referenceRange: '150-400', turnaroundTime: '4 hours' },

    // Basic Metabolic Panel (BMP)
    { loinc: '51990-0', display: 'Basic metabolic panel - Blood', panel: 'BMP', category: 'Chemistry', specimen: 'Blood', units: '', referenceRange: '', turnaroundTime: '4 hours' },
    { loinc: '2345-7', display: 'Glucose [Mass/volume] in Serum or Plasma', panel: 'BMP', category: 'Chemistry', specimen: 'Blood', units: 'mg/dL', referenceRange: '74-106', turnaroundTime: '4 hours' },
    { loinc: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma', panel: 'BMP', category: 'Chemistry', specimen: 'Blood', units: 'mg/dL', referenceRange: '0.7-1.3', turnaroundTime: '4 hours' },
    { loinc: '3094-0', display: 'Urea nitrogen [Mass/volume] in Serum or Plasma', panel: 'BMP', category: 'Chemistry', specimen: 'Blood', units: 'mg/dL', referenceRange: '7-20', turnaroundTime: '4 hours' },
    { loinc: '2951-2', display: 'Sodium [Moles/volume] in Serum or Plasma', panel: 'BMP', category: 'Chemistry', specimen: 'Blood', units: 'mmol/L', referenceRange: '136-145', turnaroundTime: '4 hours' },
    { loinc: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma', panel: 'BMP', category: 'Chemistry', specimen: 'Blood', units: 'mmol/L', referenceRange: '3.5-5.1', turnaroundTime: '4 hours' },

    // Liver Function
    { loinc: '24325-3', display: 'Hepatic function panel', panel: 'LFT', category: 'Chemistry', specimen: 'Blood', units: '', referenceRange: '', turnaroundTime: '4 hours' },
    { loinc: '1742-6', display: 'ALT [Enzymatic activity/volume] in Serum or Plasma', panel: 'LFT', category: 'Chemistry', specimen: 'Blood', units: 'U/L', referenceRange: '7-56', turnaroundTime: '4 hours' },
    { loinc: '1920-8', display: 'AST [Enzymatic activity/volume] in Serum or Plasma', panel: 'LFT', category: 'Chemistry', specimen: 'Blood', units: 'U/L', referenceRange: '10-40', turnaroundTime: '4 hours' },
    { loinc: '1975-2', display: 'Bilirubin.total [Mass/volume] in Serum or Plasma', panel: 'LFT', category: 'Chemistry', specimen: 'Blood', units: 'mg/dL', referenceRange: '0.1-1.2', turnaroundTime: '4 hours' },

    // Lipid Panel
    { loinc: '24331-1', display: 'Lipid panel with direct LDL - Serum or Plasma', panel: 'Lipid', category: 'Chemistry', specimen: 'Blood', units: '', referenceRange: '', turnaroundTime: '4 hours' },
    { loinc: '2093-3', display: 'Cholesterol [Mass/volume] in Serum or Plasma', panel: 'Lipid', category: 'Chemistry', specimen: 'Blood', units: 'mg/dL', referenceRange: '<200', turnaroundTime: '4 hours' },
    { loinc: '2571-8', display: 'Triglyceride [Mass/volume] in Serum or Plasma', panel: 'Lipid', category: 'Chemistry', specimen: 'Blood', units: 'mg/dL', referenceRange: '<150', turnaroundTime: '4 hours' },
    { loinc: '2085-9', display: 'HDL Cholesterol [Mass/volume] in Serum or Plasma', panel: 'Lipid', category: 'Chemistry', specimen: 'Blood', units: 'mg/dL', referenceRange: '>40', turnaroundTime: '4 hours' },
    { loinc: '18262-6', display: 'LDL Cholesterol [Mass/volume] in Serum or Plasma', panel: 'Lipid', category: 'Chemistry', specimen: 'Blood', units: 'mg/dL', referenceRange: '<100', turnaroundTime: '4 hours' },

    // Thyroid
    { loinc: '3016-3', display: 'TSH [Units/volume] in Serum or Plasma', panel: 'Thyroid', category: 'Chemistry', specimen: 'Blood', units: 'mIU/L', referenceRange: '0.4-4.0', turnaroundTime: '8 hours' },
    { loinc: '3026-2', display: 'Thyroxine (T4) free [Mass/volume] in Serum or Plasma', panel: 'Thyroid', category: 'Chemistry', specimen: 'Blood', units: 'ng/dL', referenceRange: '0.8-1.8', turnaroundTime: '8 hours' },

    // Diabetes
    { loinc: '4548-4', display: 'Hemoglobin A1c/Hemoglobin.total in Blood', panel: 'Diabetes', category: 'Chemistry', specimen: 'Blood', units: '%', referenceRange: '<5.7', turnaroundTime: '4 hours' },

    // Urinalysis
    { loinc: '24356-8', display: 'Urinalysis complete panel - Urine', panel: 'UA', category: 'Urinalysis', specimen: 'Urine', units: '', referenceRange: '', turnaroundTime: '4 hours' },

    // Coagulation
    { loinc: '5902-2', display: 'Prothrombin time (PT)', panel: 'Coag', category: 'Hematology', specimen: 'Blood', units: 'sec', referenceRange: '11.0-13.5', turnaroundTime: '4 hours' },
    { loinc: '6301-6', display: 'INR in Platelet poor plasma by Coagulation assay', panel: 'Coag', category: 'Hematology', specimen: 'Blood', units: '', referenceRange: '0.9-1.1', turnaroundTime: '4 hours' },
];

// ─── Generate HL7 v2.x ORM^O01 (Lab Order) ────────────────────────────────

function generateORM_O01(order: any): string {
    const now = new Date();
    const hl7Date = now.toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
    const msgId = order.orderId.replace(/-/g, '').substring(0, 20);

    const segments = [
        `MSH|^~\\&|MEDICONNECT|MEDICONNECT_EHR|LAB_SYSTEM|MEDICONNECT_LAB|${hl7Date}||ORM^O01^ORM_O01|${msgId}|P|2.5.1|||AL|NE`,
        `PID|1||${order.patientId}^^^MEDICONNECT^MR||${order.patientName || 'UNKNOWN'}||${order.patientDob || ''}|${order.patientGender || 'U'}`,
        `PV1|1|O||||||${order.orderingProviderId || ''}^${order.orderingProviderName || ''}`,
        `ORC|NW|${order.orderId}|||SC|^^^^^R||${hl7Date}|||${order.orderingProviderId || ''}^${order.orderingProviderName || ''}`,
    ];

    // Add OBR for each test
    (order.tests || []).forEach((test: any, idx: number) => {
        segments.push(
            `OBR|${idx + 1}|${order.orderId}||${test.loinc}^${test.display}^LN|||${hl7Date}|||||||${hl7Date}||${order.orderingProviderId || ''}^${order.orderingProviderName || ''}||||||${hl7Date}|||1`
        );
    });

    // Clinical notes
    if (order.clinicalNotes) {
        segments.push(`NTE|1|L|${order.clinicalNotes.replace(/\n/g, '~')}`);
    }

    return segments.join('\r');
}

// ─── Build FHIR ServiceRequest ─────────────────────────────────────────────

function toFHIRServiceRequest(order: any): any {
    return {
        resourceType: 'ServiceRequest',
        id: order.orderId,
        status: order.status || 'active',
        intent: 'order',
        category: [{
            coding: [{
                system: 'http://snomed.info/sct',
                code: '108252007',
                display: 'Laboratory procedure'
            }]
        }],
        priority: order.priority || 'routine',
        code: {
            coding: (order.tests || []).map((t: any) => ({
                system: 'http://loinc.org',
                code: t.loinc,
                display: t.display,
            }))
        },
        subject: { reference: `Patient/${order.patientId}` },
        requester: order.orderingProviderId
            ? { reference: `Practitioner/${order.orderingProviderId}` }
            : undefined,
        authoredOn: order.orderDate,
        note: order.clinicalNotes ? [{ text: order.clinicalNotes }] : undefined,
        specimen: order.specimenCollected ? [{
            display: order.specimenType || 'Collected'
        }] : undefined,
    };
}

// ─── POST /lab/orders ──────────────────────────────────────────────────────

export const createLabOrder = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);

        if (!user.isDoctor) {
            return res.status(403).json({ error: 'Only healthcare providers can create lab orders' });
        }

        const {
            patientId, patientName, patientDob, patientGender,
            tests, priority, clinicalNotes, fasting,
        } = req.body;

        if (!patientId || !tests || !Array.isArray(tests) || tests.length === 0) {
            return res.status(400).json({ error: 'patientId and tests array are required' });
        }

        // Validate test LOINC codes
        const resolvedTests: any[] = [];
        for (const test of tests) {
            const loincCode = typeof test === 'string' ? test : test.loinc;
            const found = LAB_TESTS.find(t => t.loinc === loincCode);
            if (!found) {
                return res.status(400).json({
                    error: `Invalid LOINC code: ${loincCode}`,
                    hint: 'Use GET /lab/tests to see available tests'
                });
            }
            resolvedTests.push({
                loinc: found.loinc,
                display: found.display,
                panel: found.panel,
                category: found.category,
                specimen: found.specimen,
                units: found.units,
                referenceRange: found.referenceRange,
                turnaroundTime: found.turnaroundTime,
            });
        }

        const orderId = uuidv4();
        const now = new Date().toISOString();

        const order = {
            orderId,
            patientId,
            patientName,
            patientDob,
            patientGender,
            orderingProviderId: user.id,
            orderingProviderName: user.email,
            tests: resolvedTests,
            status: 'active',
            priority: priority || 'routine',
            clinicalNotes,
            fasting: fasting || false,
            orderDate: now,
            createdAt: now,
        };

        // ─── Gap #2 FIX: US Core validation before write ─────────────────
        const fhirServiceRequest = toFHIRServiceRequest(order);
        const validation = validateUSCore(fhirServiceRequest);
        if (!validation.valid) {
            return res.status(422).json({
                error: 'US Core ServiceRequest validation failed',
                profile: validation.profile,
                issues: validation.errors,
            });
        }

        const db = getRegionalClient(region);
        await db.send(new PutCommand({ TableName: TABLE, Item: order }));

        // Generate HL7 ORM^O01
        const hl7Message = generateORM_O01(order);

        await writeAuditLog(user.id, patientId, 'CREATE_LAB_ORDER',
            `Lab order created: ${resolvedTests.map(t => t.display).join(', ')}`,
            { region, orderId, testCount: resolvedTests.length }
        );

        res.status(201).json({
            order: {
                id: orderId,
                status: 'active',
                testCount: resolvedTests.length,
                estimatedTurnaround: resolvedTests.map(t => t.turnaroundTime).sort().pop(),
                fasting: order.fasting,
            },
            fhirServiceRequest,
            hl7v2: {
                messageType: 'ORM^O01',
                version: '2.5.1',
                message: hl7Message,
            }
        });
    } catch (error: any) {
        console.error('Create lab order error:', error);
        res.status(500).json({ error: 'Failed to create lab order' });
    }
};

// ─── GET /lab/orders ───────────────────────────────────────────────────────

export const getLabOrders = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const patientId = req.query.patientId as string;
        const status = req.query.status as string;

        const db = getRegionalClient(region);

        const filterParts: string[] = [];
        const values: any = {};
        const names: any = {};

        if (patientId) {
            filterParts.push('patientId = :pid');
            values[':pid'] = patientId;
        }
        if (status) {
            filterParts.push('#status = :st');
            values[':st'] = status;
            names['#status'] = 'status';
        }
        if (!user.isAdmin) {
            filterParts.push('(orderingProviderId = :uid OR patientId = :uid)');
            values[':uid'] = user.id;
        }

        const params: any = { TableName: TABLE, Limit: 50 };
        if (filterParts.length > 0) {
            params.FilterExpression = filterParts.join(' AND ');
            params.ExpressionAttributeValues = values;
            if (Object.keys(names).length > 0) params.ExpressionAttributeNames = names;
        }

        const { Items = [] } = await db.send(new ScanCommand(params));

        const sorted = Items.sort((a: any, b: any) =>
            new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()
        );

        res.json({
            total: sorted.length,
            orders: sorted.map((o: any) => ({
                orderId: o.orderId,
                patientId: o.patientId,
                status: o.status,
                priority: o.priority,
                tests: (o.tests || []).map((t: any) => ({ loinc: t.loinc, display: t.display })),
                orderDate: o.orderDate,
                resultDate: o.resultDate,
            }))
        });
    } catch (error: any) {
        console.error('Get lab orders error:', error);
        res.status(500).json({ error: 'Failed to retrieve lab orders' });
    }
};

// ─── GET /lab/orders/:orderId ──────────────────────────────────────────────

export const getLabOrder = async (req: Request, res: Response) => {
    try {
        const { orderId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        const db = getRegionalClient(region);
        const { Items = [] } = await db.send(new ScanCommand({
            TableName: TABLE,
            FilterExpression: 'orderId = :oid',
            ExpressionAttributeValues: { ':oid': orderId },
            Limit: 1,
        }));

        if (Items.length === 0) {
            return res.status(404).json({ error: 'Lab order not found' });
        }

        const order = Items[0] as any;
        if (user.id !== order.orderingProviderId && user.id !== order.patientId && !user.isAdmin) {
            return res.status(403).json({ error: 'Not authorized to view this order' });
        }

        await writeAuditLog(user.id, order.patientId, 'VIEW_LAB_ORDER', `Viewed lab order: ${orderId}`, { region });

        res.json({
            order,
            fhirServiceRequest: toFHIRServiceRequest(order),
        });
    } catch (error: any) {
        console.error('Get lab order error:', error);
        res.status(500).json({ error: 'Failed to retrieve lab order' });
    }
};

// ─── POST /lab/results ─────────────────────────────────────────────────────

export const submitLabResults = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);

        if (!user.isDoctor) {
            return res.status(403).json({ error: 'Only healthcare providers can submit lab results' });
        }

        const { orderId, results } = req.body;

        if (!orderId || !results || !Array.isArray(results)) {
            return res.status(400).json({ error: 'orderId and results array are required' });
        }

        const db = getRegionalClient(region);

        // Find the order
        const { Items = [] } = await db.send(new ScanCommand({
            TableName: TABLE,
            FilterExpression: 'orderId = :oid',
            ExpressionAttributeValues: { ':oid': orderId },
            Limit: 1,
        }));

        if (Items.length === 0) {
            return res.status(404).json({ error: 'Lab order not found' });
        }

        const order = Items[0] as any;
        const now = new Date().toISOString();

        // Update order with results
        await db.send(new UpdateCommand({
            TableName: TABLE,
            Key: { orderId: order.orderId, patientId: order.patientId },
            UpdateExpression: 'SET #status = :st, results = :res, resultDate = :rd, resultEnteredBy = :reb, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':st': 'completed',
                ':res': results.map((r: any) => ({
                    loinc: r.loinc,
                    display: r.display || LAB_TESTS.find(t => t.loinc === r.loinc)?.display || '',
                    value: r.value,
                    unit: r.unit || LAB_TESTS.find(t => t.loinc === r.loinc)?.units || '',
                    referenceRange: r.referenceRange || LAB_TESTS.find(t => t.loinc === r.loinc)?.referenceRange || '',
                    abnormalFlag: r.abnormalFlag || 'N',
                    interpretation: r.interpretation,
                })),
                ':rd': now,
                ':reb': user.id,
                ':now': now,
            }
        }));

        // Generate HL7 ORU^R01 for results
        const hl7Date = now.replace(/[-:T.Z]/g, '').substring(0, 14);
        const msgId = orderId.replace(/-/g, '').substring(0, 20);

        const oruSegments = [
            `MSH|^~\\&|MEDICONNECT_LAB|MEDICONNECT|MEDICONNECT_EHR|MEDICONNECT|${hl7Date}||ORU^R01^ORU_R01|${msgId}|P|2.5.1|||AL|NE`,
            `PID|1||${order.patientId}^^^MEDICONNECT^MR||${order.patientName || 'UNKNOWN'}`,
            `ORC|RE|${orderId}||||||||||${user.id}`,
        ];

        results.forEach((r: any, idx: number) => {
            const testInfo = LAB_TESTS.find(t => t.loinc === r.loinc);
            oruSegments.push(
                `OBR|${idx + 1}|${orderId}|${orderId}|${r.loinc}^${testInfo?.display || r.display || ''}^LN|||${hl7Date}|||||||${hl7Date}||||||||||F`
            );
            oruSegments.push(
                `OBX|1|NM|${r.loinc}^${testInfo?.display || ''}^LN||${r.value}|${r.unit || testInfo?.units || ''}|${r.referenceRange || testInfo?.referenceRange || ''}|${r.abnormalFlag || 'N'}|||F`
            );
        });

        const hl7Message = oruSegments.join('\r');

        await writeAuditLog(user.id, order.patientId, 'SUBMIT_LAB_RESULTS',
            `Lab results submitted for order: ${orderId} (${results.length} results)`,
            { region, orderId, resultCount: results.length }
        );

        res.json({
            message: 'Lab results submitted successfully',
            orderId,
            status: 'completed',
            resultCount: results.length,
            hl7v2: {
                messageType: 'ORU^R01',
                version: '2.5.1',
                message: hl7Message,
            }
        });
    } catch (error: any) {
        console.error('Submit lab results error:', error);
        res.status(500).json({ error: 'Failed to submit lab results' });
    }
};

// ─── GET /lab/tests ────────────────────────────────────────────────────────

export const getLabTests = async (req: Request, res: Response) => {
    const panel = req.query.panel as string;
    const category = req.query.category as string;
    const query = (req.query.q as string || '').toLowerCase();

    let results = LAB_TESTS;
    if (panel) results = results.filter(t => t.panel?.toLowerCase() === panel.toLowerCase());
    if (category) results = results.filter(t => t.category.toLowerCase() === category.toLowerCase());
    if (query && query.length >= 2) {
        results = results.filter(t =>
            t.display.toLowerCase().includes(query) ||
            t.loinc.includes(query) ||
            (t.panel || '').toLowerCase().includes(query)
        );
    }

    const panels = [...new Set(LAB_TESTS.map(t => t.panel).filter(Boolean))];
    const categories = [...new Set(LAB_TESTS.map(t => t.category))];

    res.json({
        total: results.length,
        panels,
        categories,
        tests: results.map(t => ({
            loinc: t.loinc,
            display: t.display,
            panel: t.panel,
            category: t.category,
            specimen: t.specimen,
            units: t.units,
            referenceRange: t.referenceRange,
            turnaroundTime: t.turnaroundTime,
            fhir: {
                coding: [{
                    system: 'http://loinc.org',
                    code: t.loinc,
                    display: t.display,
                }]
            }
        }))
    });
};
