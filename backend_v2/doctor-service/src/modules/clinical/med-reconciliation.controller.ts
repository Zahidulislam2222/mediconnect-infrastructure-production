// ─── FEATURE #27: Medication Reconciliation ───────────────────────────────
// Compare medication lists across sources (prescriptions, pharmacy, patient
// self-reported). Detect duplicates, conflicts, and gaps.
// FHIR MedicationStatement + DetectedIssue resources.
// Supports reconciliation at transitions of care (admission, discharge, transfer).
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';

const TABLE_MED_RECON = process.env.TABLE_MED_RECON || 'mediconnect-med-reconciliations';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Reconciliation Types (Transitions of Care) ────────────────────────────

const RECON_TYPES = [
    { code: 'admission', display: 'Hospital Admission' },
    { code: 'discharge', display: 'Hospital Discharge' },
    { code: 'transfer', display: 'Transfer Between Facilities' },
    { code: 'office-visit', display: 'Office Visit / Annual Review' },
    { code: 'new-provider', display: 'New Provider Onboarding' },
];

// ─── Known Drug Classes for Conflict Detection ─────────────────────────────

interface DrugClass {
    className: string;
    medications: string[];
    conflicts: string[];
    duplicateWarning: string;
}

const DRUG_CLASSES: DrugClass[] = [
    {
        className: 'ACE Inhibitors',
        medications: ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'benazepril'],
        conflicts: ['ARBs', 'Potassium-sparing Diuretics', 'Aliskiren'],
        duplicateWarning: 'Multiple ACE inhibitors — therapeutic duplication',
    },
    {
        className: 'ARBs',
        medications: ['losartan', 'valsartan', 'irbesartan', 'candesartan', 'olmesartan'],
        conflicts: ['ACE Inhibitors', 'Aliskiren'],
        duplicateWarning: 'Multiple ARBs — therapeutic duplication',
    },
    {
        className: 'Statins',
        medications: ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'],
        conflicts: ['Fibrates', 'Niacin'],
        duplicateWarning: 'Multiple statins — increased risk of myopathy/rhabdomyolysis',
    },
    {
        className: 'NSAIDs',
        medications: ['ibuprofen', 'naproxen', 'celecoxib', 'diclofenac', 'meloxicam', 'indomethacin'],
        conflicts: ['Anticoagulants', 'ACE Inhibitors', 'ARBs'],
        duplicateWarning: 'Multiple NSAIDs — increased GI bleeding and renal risk',
    },
    {
        className: 'Anticoagulants',
        medications: ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin'],
        conflicts: ['NSAIDs', 'Antiplatelets'],
        duplicateWarning: 'Multiple anticoagulants — high bleeding risk',
    },
    {
        className: 'Antiplatelets',
        medications: ['aspirin', 'clopidogrel', 'prasugrel', 'ticagrelor'],
        conflicts: ['Anticoagulants', 'NSAIDs'],
        duplicateWarning: 'Multiple antiplatelets — increased bleeding risk',
    },
    {
        className: 'Benzodiazepines',
        medications: ['alprazolam', 'lorazepam', 'diazepam', 'clonazepam', 'temazepam'],
        conflicts: ['Opioids', 'Alcohol', 'Sedatives'],
        duplicateWarning: 'Multiple benzodiazepines — excessive sedation and respiratory depression risk',
    },
    {
        className: 'Opioids',
        medications: ['oxycodone', 'hydrocodone', 'morphine', 'fentanyl', 'tramadol', 'codeine', 'methadone'],
        conflicts: ['Benzodiazepines', 'Sedatives'],
        duplicateWarning: 'Multiple opioids — high overdose risk',
    },
    {
        className: 'SSRIs',
        medications: ['fluoxetine', 'sertraline', 'escitalopram', 'citalopram', 'paroxetine'],
        conflicts: ['MAOIs', 'SNRIs', 'Triptans'],
        duplicateWarning: 'Multiple SSRIs — serotonin syndrome risk',
    },
    {
        className: 'PPIs',
        medications: ['omeprazole', 'pantoprazole', 'esomeprazole', 'lansoprazole', 'rabeprazole'],
        conflicts: ['Clopidogrel'],
        duplicateWarning: 'Multiple PPIs — no additional benefit, increased side effects',
    },
    {
        className: 'Beta Blockers',
        medications: ['metoprolol', 'atenolol', 'propranolol', 'carvedilol', 'bisoprolol'],
        conflicts: ['Calcium Channel Blockers (non-dihydropyridine)'],
        duplicateWarning: 'Multiple beta blockers — risk of severe bradycardia',
    },
];

// ─── Helper: Classify a medication ──────────────────────────────────────────

function classifyMedication(name: string): DrugClass | null {
    const normalized = name.toLowerCase().trim();
    return DRUG_CLASSES.find(dc => dc.medications.some(m => normalized.includes(m))) || null;
}

// ─── Helper: Detect issues between medication lists ─────────────────────────

interface DetectedIssue {
    id: string;
    severity: 'high' | 'moderate' | 'low';
    type: 'duplicate' | 'conflict' | 'gap' | 'discrepancy';
    code: string;
    display: string;
    medications: string[];
    detail: string;
}

function detectIssues(allMedications: any[]): DetectedIssue[] {
    const issues: DetectedIssue[] = [];
    const classifiedMeds: { med: any; drugClass: DrugClass }[] = [];

    // Classify all medications
    for (const med of allMedications) {
        const dc = classifyMedication(med.name);
        if (dc) classifiedMeds.push({ med, drugClass: dc });
    }

    // Detect duplicates within same class
    const classGroups: Record<string, typeof classifiedMeds> = {};
    for (const cm of classifiedMeds) {
        if (!classGroups[cm.drugClass.className]) classGroups[cm.drugClass.className] = [];
        classGroups[cm.drugClass.className].push(cm);
    }

    for (const [className, meds] of Object.entries(classGroups)) {
        if (meds.length > 1) {
            issues.push({
                id: uuidv4(),
                severity: 'high',
                type: 'duplicate',
                code: 'DUPTHER',
                display: `Therapeutic Duplication: ${className}`,
                medications: meds.map(m => m.med.name),
                detail: meds[0].drugClass.duplicateWarning,
            });
        }
    }

    // Detect conflicts between classes
    const seenConflicts = new Set<string>();
    for (const cm1 of classifiedMeds) {
        for (const cm2 of classifiedMeds) {
            if (cm1 === cm2) continue;
            const conflictKey = [cm1.drugClass.className, cm2.drugClass.className].sort().join('|');
            if (seenConflicts.has(conflictKey)) continue;

            if (cm1.drugClass.conflicts.includes(cm2.drugClass.className)) {
                seenConflicts.add(conflictKey);
                issues.push({
                    id: uuidv4(),
                    severity: 'high',
                    type: 'conflict',
                    code: 'DRG',
                    display: `Drug Class Conflict: ${cm1.drugClass.className} + ${cm2.drugClass.className}`,
                    medications: [cm1.med.name, cm2.med.name],
                    detail: `${cm1.drugClass.className} may interact adversely with ${cm2.drugClass.className}`,
                });
            }
        }
    }

    // Detect discrepancies between sources
    const sourceGroups: Record<string, string[]> = {};
    for (const med of allMedications) {
        const source = med.source || 'unknown';
        if (!sourceGroups[source]) sourceGroups[source] = [];
        sourceGroups[source].push(med.name.toLowerCase());
    }

    const sources = Object.keys(sourceGroups);
    if (sources.length > 1) {
        for (let i = 0; i < sources.length; i++) {
            for (let j = i + 1; j < sources.length; j++) {
                const inFirst = sourceGroups[sources[i]].filter(m => !sourceGroups[sources[j]].includes(m));
                const inSecond = sourceGroups[sources[j]].filter(m => !sourceGroups[sources[i]].includes(m));

                for (const med of inFirst) {
                    issues.push({
                        id: uuidv4(),
                        severity: 'moderate',
                        type: 'discrepancy',
                        code: 'DISSRC',
                        display: `Source Discrepancy`,
                        medications: [med],
                        detail: `Found in ${sources[i]} but missing from ${sources[j]}`,
                    });
                }
                for (const med of inSecond) {
                    issues.push({
                        id: uuidv4(),
                        severity: 'moderate',
                        type: 'discrepancy',
                        code: 'DISSRC',
                        display: `Source Discrepancy`,
                        medications: [med],
                        detail: `Found in ${sources[j]} but missing from ${sources[i]}`,
                    });
                }
            }
        }
    }

    return issues;
}

// ─── POST /med-reconciliation — Perform medication reconciliation ───────────

export const performReconciliation = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        if (!user.isDoctor) {
            return res.status(403).json({ error: 'Only doctors can perform medication reconciliation' });
        }

        const { patientId, reconciliationType, medicationSources } = req.body;

        if (!patientId || !medicationSources || !Array.isArray(medicationSources)) {
            return res.status(400).json({ error: 'patientId and medicationSources[] required' });
        }

        const reconType = RECON_TYPES.find(t => t.code === reconciliationType) || RECON_TYPES[0];

        // Flatten all medications from all sources
        const allMedications: any[] = [];
        for (const source of medicationSources) {
            for (const med of (source.medications || [])) {
                allMedications.push({
                    ...med,
                    source: source.sourceName || 'unknown',
                    sourceType: source.sourceType || 'other',
                });
            }
        }

        // Detect issues
        const issues = detectIssues(allMedications);

        const reconId = uuidv4();
        const now = new Date().toISOString();

        const reconciliation = {
            reconId,
            patientId,
            performedBy: user.id,
            reconciliationType: reconType.code,
            reconciliationTypeDisplay: reconType.display,
            status: 'completed',
            medicationSources: medicationSources.map((s: any) => ({
                sourceName: s.sourceName,
                sourceType: s.sourceType,
                medicationCount: (s.medications || []).length,
                medications: s.medications,
            })),
            totalMedications: allMedications.length,
            detectedIssues: issues,
            issueCount: {
                total: issues.length,
                high: issues.filter(i => i.severity === 'high').length,
                moderate: issues.filter(i => i.severity === 'moderate').length,
                low: issues.filter(i => i.severity === 'low').length,
            },
            reconciledList: null, // To be filled by doctor's decision
            createdAt: now,
        };

        await db.send(new PutCommand({ TableName: TABLE_MED_RECON, Item: reconciliation }));

        await writeAuditLog(user.id, patientId, 'MED_RECONCILIATION', `Medication reconciliation (${reconType.display}): ${issues.length} issues detected`, { region, reconId });

        // Return as FHIR Bundle with MedicationStatements + DetectedIssues
        res.status(201).json({
            resourceType: 'Bundle',
            id: reconId,
            type: 'document',
            timestamp: now,
            entry: [
                // MedicationStatement entries
                ...allMedications.map((med, idx) => ({
                    resource: {
                        resourceType: 'MedicationStatement',
                        id: `${reconId}-med-${idx}`,
                        status: med.status || 'active',
                        medicationCodeableConcept: {
                            coding: med.rxcui ? [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: med.rxcui, display: med.name }] : [],
                            text: med.name,
                        },
                        subject: { reference: `Patient/${patientId}` },
                        dosage: med.dosage ? [{ text: med.dosage }] : [],
                        informationSource: { display: med.source },
                    },
                })),
                // DetectedIssue entries
                ...issues.map(issue => ({
                    resource: {
                        resourceType: 'DetectedIssue',
                        id: issue.id,
                        status: 'final',
                        severity: issue.severity,
                        code: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: issue.code, display: issue.display }] },
                        detail: issue.detail,
                        implicated: issue.medications.map(m => ({ display: m })),
                    },
                })),
            ],
            summary: reconciliation.issueCount,
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Medication reconciliation failed', details: error.message });
    }
};

// ─── GET /med-reconciliation/:patientId — Get reconciliation history ────────

export const getReconciliationHistory = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new QueryCommand({
            TableName: TABLE_MED_RECON,
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        const history = (Items || [])
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((r: any) => ({
                reconId: r.reconId,
                reconciliationType: r.reconciliationTypeDisplay,
                status: r.status,
                totalMedications: r.totalMedications,
                issueCount: r.issueCount,
                performedBy: r.performedBy,
                createdAt: r.createdAt,
            }));

        res.json({ resourceType: 'Bundle', type: 'searchset', total: history.length, entry: history });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get reconciliation history', details: error.message });
    }
};

// ─── GET /med-reconciliation/detail/:reconId — Get specific reconciliation ──

export const getReconciliation = async (req: Request, res: Response) => {
    try {
        const { reconId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Item } = await db.send(new GetCommand({
            TableName: TABLE_MED_RECON,
            Key: { reconId },
        }));

        if (!Item) return res.status(404).json({ error: 'Reconciliation not found' });

        res.json(Item);

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get reconciliation', details: error.message });
    }
};

// ─── GET /med-reconciliation/drug-classes — List known drug classes ──────────

export const getDrugClasses = async (_req: Request, res: Response) => {
    res.json({
        drugClasses: DRUG_CLASSES.map(dc => ({
            className: dc.className,
            medications: dc.medications,
            knownConflicts: dc.conflicts,
        })),
        reconciliationTypes: RECON_TYPES,
    });
};
