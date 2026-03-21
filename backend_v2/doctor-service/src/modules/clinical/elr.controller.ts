// ─── FEATURE #12: ELR (Electronic Lab Reporting) ───────────────────────────
// FHIR DiagnosticReport → HL7 v2.x ORU^R01 generation for public health.
// Stores reports in mediconnect-elr-reports.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';

const TABLE = process.env.TABLE_ELR || 'mediconnect-elr-reports';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── LOINC Test Codes (Common Reportable Labs) ─────────────────────────────

const REPORTABLE_LAB_TESTS: Array<{
    loinc: string;
    display: string;
    category: string;
    specimen: string;
    reportable: boolean;
}> = [
    // COVID-19
    { loinc: '94500-6', display: 'SARS-CoV-2 RNA (NAA)', category: 'Microbiology', specimen: 'Nasopharyngeal swab', reportable: true },
    { loinc: '94558-4', display: 'SARS-CoV-2 Ag (Rapid)', category: 'Microbiology', specimen: 'Nasopharyngeal swab', reportable: true },
    { loinc: '96119-3', display: 'SARS-CoV-2 Ag (Quantitative)', category: 'Microbiology', specimen: 'Nasopharyngeal swab', reportable: true },

    // TB
    { loinc: '11477-7', display: 'Mycobacterium tuberculosis DNA', category: 'Microbiology', specimen: 'Sputum', reportable: true },
    { loinc: '48174-7', display: 'Mycobacterium tuberculosis complex rRNA', category: 'Microbiology', specimen: 'Sputum', reportable: true },

    // STI
    { loinc: '43305-2', display: 'Neisseria gonorrhoeae rRNA', category: 'Microbiology', specimen: 'Genital swab', reportable: true },
    { loinc: '43304-5', display: 'Chlamydia trachomatis rRNA', category: 'Microbiology', specimen: 'Genital swab', reportable: true },
    { loinc: '20507-0', display: 'Treponema pallidum Ab (Syphilis RPR)', category: 'Serology', specimen: 'Blood', reportable: true },
    { loinc: '7917-8', display: 'HIV 1 Ab (Confirm)', category: 'Serology', specimen: 'Blood', reportable: true },

    // Hepatitis
    { loinc: '5195-3', display: 'Hepatitis B surface Ag', category: 'Serology', specimen: 'Blood', reportable: true },
    { loinc: '16128-1', display: 'Hepatitis C Ab', category: 'Serology', specimen: 'Blood', reportable: true },

    // Food/Waterborne
    { loinc: '625-4', display: 'Salmonella sp culture', category: 'Microbiology', specimen: 'Stool', reportable: true },
    { loinc: '17563-8', display: 'E. coli O157 culture', category: 'Microbiology', specimen: 'Stool', reportable: true },

    // Lead
    { loinc: '5671-3', display: 'Lead [Mass/volume] in Blood', category: 'Chemistry', specimen: 'Blood', reportable: true },

    // Common non-reportable (for reference)
    { loinc: '2093-3', display: 'Cholesterol [Mass/volume] in Blood', category: 'Chemistry', specimen: 'Blood', reportable: false },
    { loinc: '2345-7', display: 'Glucose [Mass/volume] in Blood', category: 'Chemistry', specimen: 'Blood', reportable: false },
    { loinc: '718-7', display: 'Hemoglobin [Mass/volume] in Blood', category: 'Hematology', specimen: 'Blood', reportable: false },
    { loinc: '2160-0', display: 'Creatinine [Mass/volume] in Blood', category: 'Chemistry', specimen: 'Blood', reportable: false },
    { loinc: '1742-6', display: 'ALT [Enzymatic activity/volume] in Serum', category: 'Chemistry', specimen: 'Blood', reportable: false },
];

// ─── Generate HL7 v2.x ORU^R01 Message ────────────────────────────────────

function generateORU_R01(report: any): string {
    const now = new Date();
    const hl7Date = now.toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
    const msgId = report.reportId.replace(/-/g, '').substring(0, 20);

    const segments = [
        // MSH - Message Header
        `MSH|^~\\&|MEDICONNECT|MEDICONNECT_LAB|PH_AGENCY|STATE_DOH|${hl7Date}||ORU^R01^ORU_R01|${msgId}|P|2.5.1|||AL|NE|||||PHLabReport-NoAck^ELR_Receiver^2.16.840.1.113883.9.11^ISO`,

        // SFT - Software
        `SFT|MediConnect Healthcare Platform|2.0|MediConnect ELR|`,

        // PID - Patient
        `PID|1||${report.patientId}^^^MEDICONNECT^MR||${report.patientName || 'UNKNOWN'}||${report.patientDob || ''}|${report.patientGender || 'U'}|||${report.patientAddress || ''}`,

        // ORC - Common Order
        `ORC|RE|${report.orderId || report.reportId}|${report.reportId}|||||||||${report.orderingProvider || ''}`,

        // OBR - Observation Request
        `OBR|1|${report.orderId || report.reportId}|${report.reportId}|${report.testLoinc}^${report.testDisplay}^LN|||${hl7Date}|||||||${hl7Date}||${report.orderingProvider || ''}||||||${hl7Date}|||F`,

        // OBX - Observation Result
        `OBX|1|${report.valueType || 'ST'}|${report.testLoinc}^${report.testDisplay}^LN||${report.resultValue || ''}|${report.resultUnit || ''}|${report.referenceRange || ''}|${report.abnormalFlag || 'N'}|||F|||${hl7Date}||${report.performingLab || 'MEDICONNECT_LAB'}`,
    ];

    // Add specimen segment if available
    if (report.specimen) {
        segments.splice(4, 0, `SPM|1|||${report.specimen}^${report.specimen}^SCT`);
    }

    // Add notes if present
    if (report.notes) {
        segments.push(`NTE|1|L|${report.notes.replace(/\n/g, '~')}`);
    }

    return segments.join('\r');
}

// ─── Build FHIR DiagnosticReport ───────────────────────────────────────────

function toFHIRDiagnosticReport(report: any): any {
    return {
        resourceType: 'DiagnosticReport',
        id: report.reportId,
        meta: {
            profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab']
        },
        status: report.status || 'final',
        category: [{
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
                code: 'LAB',
                display: 'Laboratory'
            }]
        }],
        code: {
            coding: [{
                system: 'http://loinc.org',
                code: report.testLoinc,
                display: report.testDisplay,
            }]
        },
        subject: { reference: `Patient/${report.patientId}` },
        effectiveDateTime: report.collectionDate || report.reportDate,
        issued: report.reportDate,
        performer: report.performingLab ? [{
            display: report.performingLab
        }] : undefined,
        result: [{
            reference: `Observation/${report.reportId}-obs`,
            display: `${report.testDisplay}: ${report.resultValue} ${report.resultUnit || ''}`
        }],
        conclusion: report.interpretation || undefined,
    };
}

// ─── POST /public-health/elr ───────────────────────────────────────────────

export const createELR = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);

        if (!user.isDoctor) {
            return res.status(403).json({ error: 'Only healthcare providers can submit lab reports' });
        }

        const {
            patientId, patientName, patientDob, patientGender,
            testLoinc, resultValue, resultUnit, referenceRange,
            abnormalFlag, interpretation, collectionDate,
            specimen, performingLab, orderingProvider, notes,
        } = req.body;

        if (!patientId || !testLoinc || !resultValue) {
            return res.status(400).json({ error: 'patientId, testLoinc, and resultValue are required' });
        }

        // Look up test info
        const testInfo = REPORTABLE_LAB_TESTS.find(t => t.loinc === testLoinc);
        if (!testInfo) {
            return res.status(400).json({
                error: `Unknown LOINC code: ${testLoinc}`,
                availableTests: REPORTABLE_LAB_TESTS.map(t => ({ loinc: t.loinc, display: t.display }))
            });
        }

        const reportId = uuidv4();
        const now = new Date().toISOString();

        const report = {
            reportId,
            patientId,
            patientName,
            patientDob,
            patientGender,
            authorId: user.id,
            testLoinc,
            testDisplay: testInfo.display,
            testCategory: testInfo.category,
            resultValue,
            resultUnit: resultUnit || '',
            referenceRange,
            abnormalFlag: abnormalFlag || 'N',
            valueType: typeof resultValue === 'number' ? 'NM' : 'ST',
            interpretation,
            specimen: specimen || testInfo.specimen,
            performingLab: performingLab || 'MediConnect Lab',
            orderingProvider,
            collectionDate: collectionDate || now,
            reportDate: now,
            status: 'final',
            isReportable: testInfo.reportable,
            notes,
            createdAt: now,
        };

        const db = getRegionalClient(region);
        await db.send(new PutCommand({ TableName: TABLE, Item: report }));

        // Generate HL7 ORU^R01
        const hl7Message = generateORU_R01(report);

        await writeAuditLog(user.id, patientId, 'CREATE_ELR',
            `Filed ELR: ${testInfo.display} (LOINC ${testLoinc}) — ${testInfo.reportable ? 'REPORTABLE' : 'non-reportable'}`,
            { region, reportId, testLoinc, isReportable: testInfo.reportable }
        );

        res.status(201).json({
            report: {
                id: reportId,
                status: 'filed',
                isReportable: testInfo.reportable,
                message: testInfo.reportable
                    ? 'This lab result is REPORTABLE to public health authorities.'
                    : 'Lab result recorded. Not a reportable condition.',
            },
            fhirDiagnosticReport: toFHIRDiagnosticReport(report),
            hl7v2: {
                messageType: 'ORU^R01',
                version: '2.5.1',
                message: hl7Message,
            }
        });
    } catch (error: any) {
        console.error('Create ELR error:', error);
        res.status(500).json({ error: 'Failed to create lab report' });
    }
};

// ─── GET /public-health/elr ────────────────────────────────────────────────

export const listELRs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const reportableOnly = req.query.reportable === 'true';
        const patientId = req.query.patientId as string;

        const db = getRegionalClient(region);

        const filterParts: string[] = [];
        const values: any = {};

        if (!user.isAdmin) {
            filterParts.push('(authorId = :uid OR patientId = :uid)');
            values[':uid'] = user.id;
        }
        if (reportableOnly) {
            filterParts.push('isReportable = :rep');
            values[':rep'] = true;
        }
        if (patientId) {
            filterParts.push('patientId = :pid');
            values[':pid'] = patientId;
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

        const sorted = Items.sort((a: any, b: any) =>
            new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime()
        );

        res.json({
            total: sorted.length,
            reports: sorted.map((r: any) => ({
                reportId: r.reportId,
                patientId: r.patientId,
                testLoinc: r.testLoinc,
                testDisplay: r.testDisplay,
                resultValue: r.resultValue,
                resultUnit: r.resultUnit,
                isReportable: r.isReportable,
                status: r.status,
                reportDate: r.reportDate,
            }))
        });
    } catch (error: any) {
        console.error('List ELRs error:', error);
        res.status(500).json({ error: 'Failed to list lab reports' });
    }
};

// ─── GET /public-health/elr/tests ──────────────────────────────────────────

export const getReportableLabTests = async (req: Request, res: Response) => {
    const reportableOnly = req.query.reportable !== 'false';
    const category = req.query.category as string;

    let results = REPORTABLE_LAB_TESTS;
    if (reportableOnly) results = results.filter(t => t.reportable);
    if (category) results = results.filter(t => t.category.toLowerCase() === category.toLowerCase());

    const categories = [...new Set(REPORTABLE_LAB_TESTS.map(t => t.category))];

    res.json({
        total: results.length,
        categories,
        tests: results.map(t => ({
            loinc: t.loinc,
            display: t.display,
            category: t.category,
            specimen: t.specimen,
            reportable: t.reportable,
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
