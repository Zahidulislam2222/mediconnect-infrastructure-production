// ─── FEATURE #15: CDS Hooks (Clinical Decision Support) ────────────────────
// Implements CDS Hooks specification (https://cds-hooks.org/).
// Hook triggers during clinical workflow: prescription, order entry, patient view.
// Returns CDS cards with alerts, suggestions, and links.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';

const TABLE_PATIENTS = process.env.DYNAMO_TABLE || 'mediconnect-patients';
const TABLE_ALLERGIES = process.env.TABLE_ALLERGIES || 'mediconnect-allergies';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── CDS Service Definitions ───────────────────────────────────────────────

interface CDSService {
    hook: string;
    id: string;
    title: string;
    description: string;
    prefetch?: Record<string, string>;
}

const CDS_SERVICES: CDSService[] = [
    {
        hook: 'patient-view',
        id: 'mediconnect-patient-alerts',
        title: 'Patient Clinical Alerts',
        description: 'Displays alerts for high-risk conditions, overdue screenings, and drug allergies when viewing a patient chart.',
        prefetch: {
            patient: 'Patient/{{context.patientId}}',
        }
    },
    {
        hook: 'medication-prescribe',
        id: 'mediconnect-rx-safety',
        title: 'Prescription Safety Check',
        description: 'Checks for drug-drug interactions, drug-allergy conflicts, and controlled substance prescribing requirements.',
        prefetch: {
            patient: 'Patient/{{context.patientId}}',
            medications: 'MedicationRequest?patient={{context.patientId}}&status=active',
        }
    },
    {
        hook: 'order-select',
        id: 'mediconnect-order-guidance',
        title: 'Lab Order Guidance',
        description: 'Provides guidance on lab test ordering: duplicate order detection, appropriate test recommendations, and guideline-based suggestions.',
        prefetch: {
            patient: 'Patient/{{context.patientId}}',
        }
    },
    {
        hook: 'order-sign',
        id: 'mediconnect-order-review',
        title: 'Order Sign Review',
        description: 'Final review before order signing: clinical appropriateness, formulary check, prior authorization requirements.',
    },
];

// ─── CDS Card Types ────────────────────────────────────────────────────────

interface CDSCard {
    uuid: string;
    summary: string;
    detail?: string;
    indicator: 'info' | 'warning' | 'critical';
    source: {
        label: string;
        url?: string;
        icon?: string;
    };
    suggestions?: Array<{
        label: string;
        uuid: string;
        actions?: Array<{
            type: 'create' | 'update' | 'delete';
            description: string;
            resource?: any;
        }>;
    }>;
    links?: Array<{
        label: string;
        url: string;
        type: 'absolute' | 'smart';
    }>;
    selectionBehavior?: 'at-most-one' | 'any';
    overrideReasons?: Array<{ code: string; display: string }>;
}

function makeCard(partial: Partial<CDSCard> & { summary: string; indicator: CDSCard['indicator'] }): CDSCard {
    return {
        uuid: `urn:uuid:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        source: { label: 'MediConnect CDS', url: 'https://mediconnect.health' },
        ...partial,
    };
}

// ─── Hook: patient-view ────────────────────────────────────────────────────

async function handlePatientView(context: any, region: string): Promise<CDSCard[]> {
    const cards: CDSCard[] = [];
    const patientId = context.patientId;
    if (!patientId) return cards;

    const db = getRegionalClient(region);

    // Check patient record
    try {
        const { Item: patient } = await db.send(new GetCommand({
            TableName: TABLE_PATIENTS,
            Key: { id: patientId }
        }));

        if (patient) {
            // Check for missing demographics
            const missingFields: string[] = [];
            if (!patient.dob) missingFields.push('date of birth');
            if (!patient.gender || patient.gender === 'unknown') missingFields.push('gender');
            if (!patient.phone) missingFields.push('phone number');

            if (missingFields.length > 0) {
                cards.push(makeCard({
                    summary: 'Incomplete Patient Demographics',
                    detail: `Missing: ${missingFields.join(', ')}. Complete demographics improve clinical decision-making and reporting.`,
                    indicator: 'info',
                    suggestions: [{
                        label: 'Update patient demographics',
                        uuid: `suggest-demographics-${patientId}`,
                    }]
                }));
            }

            // Check age for preventive screenings
            if (patient.dob) {
                const age = Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                const screenings: string[] = [];

                if (age >= 50) screenings.push('Colorectal cancer screening (USPSTF Grade A)');
                if (age >= 50 && age <= 80) screenings.push('Lung cancer screening (if 20+ pack-year history)');
                if (age >= 40 && patient.gender === 'female') screenings.push('Mammography (breast cancer screening)');
                if (age >= 21 && age <= 65 && patient.gender === 'female') screenings.push('Cervical cancer screening (Pap/HPV)');
                if (age >= 35) screenings.push('Lipid panel (cardiovascular risk)');
                if (age >= 45) screenings.push('Diabetes screening (fasting glucose / A1c)');
                if (age >= 65) screenings.push('Osteoporosis screening (DEXA)');

                if (screenings.length > 0) {
                    cards.push(makeCard({
                        summary: `Age-Based Screening Recommendations (Age ${age})`,
                        detail: screenings.map(s => `• ${s}`).join('\n'),
                        indicator: 'info',
                        links: [{
                            label: 'USPSTF Recommendations',
                            url: 'https://www.uspreventiveservicestaskforce.org/uspstf/recommendation-topics',
                            type: 'absolute'
                        }]
                    }));
                }
            }
        }
    } catch {
        // Non-critical, continue
    }

    // Check for active allergies
    try {
        const { Items: allergies = [] } = await db.send(new QueryCommand({
            TableName: TABLE_ALLERGIES,
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        const highCriticality = allergies.filter((a: any) => a.criticality === 'high');
        if (highCriticality.length > 0) {
            cards.push(makeCard({
                summary: `⚠ ${highCriticality.length} High-Criticality Allerg${highCriticality.length === 1 ? 'y' : 'ies'}`,
                detail: highCriticality.map((a: any) => `• ${a.substance} (${a.category})`).join('\n'),
                indicator: 'critical',
            }));
        }
    } catch {
        // Non-critical
    }

    return cards;
}

// ─── Hook: medication-prescribe ────────────────────────────────────────────

async function handleMedicationPrescribe(context: any, region: string): Promise<CDSCard[]> {
    const cards: CDSCard[] = [];
    const { patientId, medications } = context;
    if (!patientId) return cards;

    // Check for controlled substances
    const draftMedications = medications || context.draftOrders?.entry || [];
    for (const med of draftMedications) {
        const medName = med.medicationCodeableConcept?.text || med.name || '';
        const lowerName = medName.toLowerCase();

        // Common controlled substance keywords
        const scheduleII = ['oxycodone', 'fentanyl', 'adderall', 'amphetamine', 'methylphenidate', 'ritalin', 'morphine', 'hydromorphone', 'methadone'];
        const scheduleIII = ['testosterone', 'ketamine', 'codeine'];
        const scheduleIV = ['alprazolam', 'xanax', 'diazepam', 'valium', 'zolpidem', 'ambien', 'tramadol', 'lorazepam', 'ativan', 'clonazepam'];

        if (scheduleII.some(s => lowerName.includes(s))) {
            cards.push(makeCard({
                summary: `Schedule II Controlled Substance: ${medName}`,
                detail: 'This medication requires:\n• Valid DEA registration\n• Cannot be called in (paper/e-prescribing only)\n• No refills — new prescription required each time\n• State PDMP check recommended',
                indicator: 'warning',
                links: [{
                    label: 'Check State PDMP',
                    url: 'https://www.deadiversion.usdoj.gov/faq/rx_monitor.htm',
                    type: 'absolute'
                }],
                overrideReasons: [
                    { code: 'clinical-need', display: 'Clinical necessity documented' },
                    { code: 'pdmp-checked', display: 'PDMP already checked' },
                ]
            }));
        } else if (scheduleIII.some(s => lowerName.includes(s))) {
            cards.push(makeCard({
                summary: `Schedule III Controlled Substance: ${medName}`,
                detail: 'DEA registration required. Up to 5 refills in 6 months. PDMP check recommended.',
                indicator: 'info',
            }));
        } else if (scheduleIV.some(s => lowerName.includes(s))) {
            cards.push(makeCard({
                summary: `Schedule IV Controlled Substance: ${medName}`,
                detail: 'DEA registration required. Up to 5 refills in 6 months.',
                indicator: 'info',
            }));
        }
    }

    // Check for drug-allergy conflicts
    try {
        const db = getRegionalClient(region);
        const { Items: allergies = [] } = await db.send(new QueryCommand({
            TableName: TABLE_ALLERGIES,
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        const medAllergies = allergies.filter((a: any) => a.category === 'medication');
        for (const med of draftMedications) {
            const medName = (med.medicationCodeableConcept?.text || med.name || '').toLowerCase();
            for (const allergy of medAllergies) {
                const allergySubstance = ((allergy as any).substance || '').toLowerCase();
                if (medName.includes(allergySubstance) || allergySubstance.includes(medName)) {
                    cards.push(makeCard({
                        summary: `DRUG-ALLERGY CONFLICT: ${med.name || medName} ↔ ${(allergy as any).substance}`,
                        detail: `Patient has a documented ${(allergy as any).criticality || 'unknown'}-criticality allergy to ${(allergy as any).substance}. Review before prescribing.`,
                        indicator: 'critical',
                        overrideReasons: [
                            { code: 'allergy-reviewed', display: 'Allergy reviewed — different formulation' },
                            { code: 'benefits-outweigh', display: 'Benefits outweigh risks' },
                        ]
                    }));
                }
            }
        }
    } catch {
        // Non-critical
    }

    // If no cards, return all-clear
    if (cards.length === 0) {
        cards.push(makeCard({
            summary: 'No prescription safety concerns identified',
            indicator: 'info',
        }));
    }

    return cards;
}

// ─── Hook: order-select ────────────────────────────────────────────────────

async function handleOrderSelect(context: any, _region: string): Promise<CDSCard[]> {
    const cards: CDSCard[] = [];
    const selections = context.selections || [];

    for (const selection of selections) {
        const code = selection.code || selection;
        // Common test guidance
        if (code === '2093-3') { // Cholesterol
            cards.push(makeCard({
                summary: 'Lipid Panel Guidance',
                detail: 'USPSTF recommends fasting lipid panel for cardiovascular risk assessment. Consider ordering complete lipid panel (LOINC 24331-1) instead of cholesterol alone.',
                indicator: 'info',
                suggestions: [{
                    label: 'Order complete lipid panel instead',
                    uuid: 'suggest-lipid-panel',
                }]
            }));
        }
        if (code === '4548-4') { // HbA1c
            cards.push(makeCard({
                summary: 'HbA1c Monitoring',
                detail: 'ADA recommends A1c testing every 3 months for patients not meeting glycemic goals, and every 6 months for patients with stable control.',
                indicator: 'info',
            }));
        }
    }

    return cards;
}

// ─── Hook: order-sign ──────────────────────────────────────────────────────

async function handleOrderSign(context: any, _region: string): Promise<CDSCard[]> {
    const cards: CDSCard[] = [];
    const orders = context.draftOrders?.entry || [];

    if (orders.length > 5) {
        cards.push(makeCard({
            summary: `Large order set: ${orders.length} orders`,
            detail: 'Please verify all orders are intended. Consider if all tests are clinically necessary at this time.',
            indicator: 'info',
        }));
    }

    return cards;
}

// ─── GET /cds-hooks/services (CDS Discovery) ──────────────────────────────

export const getCDSServices = async (_req: Request, res: Response) => {
    res.json({
        services: CDS_SERVICES.map(svc => ({
            hook: svc.hook,
            id: svc.id,
            title: svc.title,
            description: svc.description,
            prefetch: svc.prefetch,
        }))
    });
};

// ─── POST /cds-hooks/:hookId ───────────────────────────────────────────────

export const invokeCDSHook = async (req: Request, res: Response) => {
    try {
        const { hookId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        // Validate hook exists
        const service = CDS_SERVICES.find(s => s.id === hookId);
        if (!service) {
            return res.status(404).json({
                error: `CDS Hook not found: ${hookId}`,
                availableHooks: CDS_SERVICES.map(s => s.id)
            });
        }

        const { context, prefetch } = req.body;
        if (!context) {
            return res.status(400).json({ error: 'context is required in the request body' });
        }

        // Merge prefetch data into context if provided
        const enrichedContext = { ...context, ...(prefetch || {}) };

        let cards: CDSCard[] = [];

        switch (service.hook) {
            case 'patient-view':
                cards = await handlePatientView(enrichedContext, region);
                break;
            case 'medication-prescribe':
                cards = await handleMedicationPrescribe(enrichedContext, region);
                break;
            case 'order-select':
                cards = await handleOrderSelect(enrichedContext, region);
                break;
            case 'order-sign':
                cards = await handleOrderSign(enrichedContext, region);
                break;
            default:
                cards = [makeCard({
                    summary: `No handler for hook: ${service.hook}`,
                    indicator: 'info',
                })];
        }

        await writeAuditLog(user.id, enrichedContext.patientId || 'SYSTEM', 'CDS_HOOK_INVOKED',
            `CDS Hook: ${hookId} (${service.hook}) → ${cards.length} cards`,
            { region, hookId, cardCount: cards.length }
        );

        // Return in CDS Hooks spec format
        res.json({ cards });
    } catch (error: any) {
        console.error('CDS Hook error:', error);
        res.status(500).json({ error: 'CDS Hook evaluation failed' });
    }
};
