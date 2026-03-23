// ─── FEATURE #13: CVX Immunization Codes + Reporting ───────────────────────
// CDC CVX code database (built-in). FHIR Immunization resource.
// Vaccine administration recording + history.
// Table: mediconnect-immunizations (PK: patientId, SK: immunizationId)
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';
import { validateUSCore } from '../../../../shared/us-core-profiles';
import { safeError } from '../../../../shared/logger';

const TABLE = process.env.TABLE_IMMUNIZATIONS || 'mediconnect-immunizations';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── CDC CVX Code Database (Common Vaccines) ──────────────────────────────

const CVX_CODES: Array<{
    cvx: string;
    shortDescription: string;
    fullName: string;
    vaccineGroup: string;
    status: 'Active' | 'Inactive' | 'Non-US';
    notes?: string;
}> = [
    // COVID-19
    { cvx: '207', shortDescription: 'COVID-19, mRNA, LNP-S, PF, 100 mcg/0.5mL dose', fullName: 'Moderna COVID-19 Vaccine', vaccineGroup: 'COVID-19', status: 'Active' },
    { cvx: '208', shortDescription: 'COVID-19, mRNA, LNP-S, PF, 30 mcg/0.3mL dose', fullName: 'Pfizer-BioNTech COVID-19 Vaccine', vaccineGroup: 'COVID-19', status: 'Active' },
    { cvx: '212', shortDescription: 'COVID-19, vector-nr, rS-Ad26, PF, 0.5mL', fullName: 'Janssen COVID-19 Vaccine', vaccineGroup: 'COVID-19', status: 'Inactive' },
    { cvx: '228', shortDescription: 'COVID-19, mRNA, LNP-S, bivalent, PF', fullName: 'Pfizer-BioNTech COVID-19 Bivalent', vaccineGroup: 'COVID-19', status: 'Active' },
    { cvx: '229', shortDescription: 'COVID-19, mRNA, LNP-S, bivalent booster, PF', fullName: 'Moderna COVID-19 Bivalent', vaccineGroup: 'COVID-19', status: 'Active' },

    // Influenza
    { cvx: '141', shortDescription: 'Influenza, seasonal, injectable', fullName: 'Influenza Vaccine (Seasonal, Injectable)', vaccineGroup: 'Influenza', status: 'Active' },
    { cvx: '150', shortDescription: 'Influenza, injectable, quadrivalent, preservative free', fullName: 'Influenza Vaccine (IIV4, PF)', vaccineGroup: 'Influenza', status: 'Active' },
    { cvx: '155', shortDescription: 'Influenza, recombinant, injectable, preservative free', fullName: 'Influenza Vaccine (RIV4)', vaccineGroup: 'Influenza', status: 'Active' },
    { cvx: '185', shortDescription: 'Influenza, recombinant, quadrivalent, injectable, PF', fullName: 'Influenza Vaccine (ccIIV4)', vaccineGroup: 'Influenza', status: 'Active' },
    { cvx: '197', shortDescription: 'Influenza, high-dose, quadrivalent', fullName: 'Influenza High-Dose Vaccine (IIV4-HD)', vaccineGroup: 'Influenza', status: 'Active' },

    // Childhood vaccines
    { cvx: '20', shortDescription: 'DTaP', fullName: 'Diphtheria, Tetanus, Pertussis (DTaP)', vaccineGroup: 'DTaP', status: 'Active' },
    { cvx: '10', shortDescription: 'IPV', fullName: 'Inactivated Poliovirus Vaccine (IPV)', vaccineGroup: 'Polio', status: 'Active' },
    { cvx: '03', shortDescription: 'MMR', fullName: 'Measles, Mumps, Rubella (MMR)', vaccineGroup: 'MMR', status: 'Active' },
    { cvx: '21', shortDescription: 'Varicella', fullName: 'Varicella (Chickenpox) Vaccine', vaccineGroup: 'Varicella', status: 'Active' },
    { cvx: '08', shortDescription: 'Hep B, adolescent or pediatric', fullName: 'Hepatitis B Vaccine (Pediatric)', vaccineGroup: 'Hep B', status: 'Active' },
    { cvx: '49', shortDescription: 'Hib (PRP-OMP)', fullName: 'Haemophilus influenzae type b (PRP-OMP)', vaccineGroup: 'Hib', status: 'Active' },
    { cvx: '133', shortDescription: 'PCV13', fullName: 'Pneumococcal Conjugate Vaccine (PCV13)', vaccineGroup: 'Pneumococcal', status: 'Active' },
    { cvx: '116', shortDescription: 'Rotavirus, pentavalent', fullName: 'Rotavirus Vaccine (RV5, RotaTeq)', vaccineGroup: 'Rotavirus', status: 'Active' },

    // Adolescent/Adult
    { cvx: '62', shortDescription: 'HPV, quadrivalent', fullName: 'Human Papillomavirus Vaccine (HPV4)', vaccineGroup: 'HPV', status: 'Inactive' },
    { cvx: '165', shortDescription: 'HPV9', fullName: 'Human Papillomavirus 9-valent Vaccine (HPV9, Gardasil 9)', vaccineGroup: 'HPV', status: 'Active' },
    { cvx: '114', shortDescription: 'MenACWY-D (Menactra)', fullName: 'Meningococcal ACWY Vaccine (MenACWY)', vaccineGroup: 'Meningococcal', status: 'Active' },
    { cvx: '115', shortDescription: 'Tdap', fullName: 'Tetanus, Diphtheria, Pertussis (Tdap)', vaccineGroup: 'Tdap', status: 'Active' },

    // Adult
    { cvx: '33', shortDescription: 'Pneumococcal polysaccharide PPV23', fullName: 'Pneumococcal Polysaccharide Vaccine (PPSV23)', vaccineGroup: 'Pneumococcal', status: 'Active' },
    { cvx: '216', shortDescription: 'Pneumococcal conjugate PCV20', fullName: 'Pneumococcal 20-valent Conjugate (PCV20)', vaccineGroup: 'Pneumococcal', status: 'Active' },
    { cvx: '187', shortDescription: 'Recombinant zoster vaccine', fullName: 'Shingles Vaccine (Shingrix, RZV)', vaccineGroup: 'Zoster', status: 'Active' },
    { cvx: '52', shortDescription: 'Hep A, adult', fullName: 'Hepatitis A Vaccine (Adult)', vaccineGroup: 'Hep A', status: 'Active' },
    { cvx: '43', shortDescription: 'Hep B, adult', fullName: 'Hepatitis B Vaccine (Adult)', vaccineGroup: 'Hep B', status: 'Active' },

    // Travel
    { cvx: '25', shortDescription: 'Typhoid, oral', fullName: 'Typhoid Vaccine (Oral, Ty21a)', vaccineGroup: 'Typhoid', status: 'Active' },
    { cvx: '18', shortDescription: 'Rabies, intramuscular injection', fullName: 'Rabies Vaccine (IM)', vaccineGroup: 'Rabies', status: 'Active' },
    { cvx: '37', shortDescription: 'Yellow fever', fullName: 'Yellow Fever Vaccine', vaccineGroup: 'Yellow Fever', status: 'Active' },

    // RSV
    { cvx: '230', shortDescription: 'RSVpreF (Abrysvo)', fullName: 'RSV Vaccine (Abrysvo, Pfizer)', vaccineGroup: 'RSV', status: 'Active' },
    { cvx: '231', shortDescription: 'RSVpreF (Arexvy)', fullName: 'RSV Vaccine (Arexvy, GSK)', vaccineGroup: 'RSV', status: 'Active' },
];

// ─── Build FHIR Immunization Resource ──────────────────────────────────────

function toFHIR(record: any): any {
    const cvxInfo = CVX_CODES.find(c => c.cvx === record.cvxCode);
    return {
        resourceType: 'Immunization',
        id: record.immunizationId,
        status: record.status || 'completed',
        vaccineCode: {
            coding: [{
                system: 'http://hl7.org/fhir/sid/cvx',
                code: record.cvxCode,
                display: cvxInfo?.shortDescription || record.vaccineName,
            }],
            text: record.vaccineName || cvxInfo?.fullName,
        },
        patient: { reference: `Patient/${record.patientId}` },
        occurrenceDateTime: record.administrationDate,
        recorded: record.recordedDate,
        primarySource: record.primarySource !== false,
        location: record.location ? { display: record.location } : undefined,
        lotNumber: record.lotNumber,
        expirationDate: record.expirationDate,
        site: record.site ? {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/v3-ActSite',
                code: record.site,
                display: record.site
            }]
        } : undefined,
        route: record.route ? {
            coding: [{
                system: 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration',
                code: record.route,
                display: record.route
            }]
        } : undefined,
        doseQuantity: record.doseQuantity ? {
            value: record.doseQuantity.value,
            unit: record.doseQuantity.unit || 'mL',
            system: 'http://unitsofmeasure.org',
            code: record.doseQuantity.unit || 'mL',
        } : undefined,
        performer: record.performedBy ? [{
            actor: { reference: `Practitioner/${record.performedBy}`, display: record.performerName }
        }] : undefined,
        note: record.notes ? [{ text: record.notes }] : undefined,
        protocolApplied: record.doseNumber ? [{
            doseNumberPositiveInt: record.doseNumber,
            seriesDosesPositiveInt: record.seriesDoses,
        }] : undefined,
    };
}

// ─── GET /immunizations/cvx/search ─────────────────────────────────────────

export const searchCVXCodes = async (req: Request, res: Response) => {
    const query = (req.query.q as string || '').toLowerCase();
    const group = req.query.group as string;
    const activeOnly = req.query.active !== 'false';

    let results = CVX_CODES;

    if (activeOnly) results = results.filter(c => c.status === 'Active');
    if (group) results = results.filter(c => c.vaccineGroup.toLowerCase() === group.toLowerCase());
    if (query && query.length >= 2) {
        results = results.filter(c =>
            c.shortDescription.toLowerCase().includes(query) ||
            c.fullName.toLowerCase().includes(query) ||
            c.vaccineGroup.toLowerCase().includes(query) ||
            c.cvx === query
        );
    }

    res.json({
        total: results.length,
        codes: results.map(c => ({
            cvx: c.cvx,
            shortDescription: c.shortDescription,
            fullName: c.fullName,
            vaccineGroup: c.vaccineGroup,
            status: c.status,
            fhir: {
                coding: [{
                    system: 'http://hl7.org/fhir/sid/cvx',
                    code: c.cvx,
                    display: c.shortDescription,
                }]
            }
        }))
    });
};

// ─── GET /immunizations/cvx/groups ─────────────────────────────────────────

export const getCVXGroups = async (_req: Request, res: Response) => {
    const groups = [...new Set(CVX_CODES.filter(c => c.status === 'Active').map(c => c.vaccineGroup))].sort();
    res.json({
        groups: groups.map(g => ({
            name: g,
            count: CVX_CODES.filter(c => c.vaccineGroup === g && c.status === 'Active').length,
        }))
    });
};

// ─── POST /immunizations ───────────────────────────────────────────────────

export const recordImmunization = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);

        // Only doctors can record immunizations
        if (!user.isDoctor) {
            return res.status(403).json({ error: 'Only healthcare providers can record immunizations' });
        }

        const {
            patientId, cvxCode, vaccineName, administrationDate,
            lotNumber, expirationDate, site, route, doseQuantity,
            doseNumber, seriesDoses, location, notes,
            performerName,
        } = req.body;

        if (!patientId || !cvxCode) {
            return res.status(400).json({ error: 'patientId and cvxCode are required' });
        }

        const cvxInfo = CVX_CODES.find(c => c.cvx === cvxCode);
        if (!cvxInfo) {
            return res.status(400).json({ error: `Invalid CVX code: ${cvxCode}` });
        }

        const immunizationId = uuidv4();
        const now = new Date().toISOString();

        const record = {
            patientId,
            immunizationId,
            cvxCode,
            vaccineName: vaccineName || cvxInfo.fullName,
            vaccineGroup: cvxInfo.vaccineGroup,
            status: 'completed',
            administrationDate: administrationDate || now,
            recordedDate: now,
            primarySource: true,
            lotNumber,
            expirationDate,
            site,
            route: route || 'IM', // intramuscular default
            doseQuantity,
            doseNumber,
            seriesDoses,
            location,
            performedBy: user.id,
            performerName: performerName || user.email,
            notes,
            createdAt: now,
        };

        // ─── Gap #4 FIX: US Core validation before write ─────────────────
        const fhirResource = toFHIR(record);
        const validation = validateUSCore(fhirResource);
        if (!validation.valid) {
            return res.status(422).json({
                error: 'US Core Immunization validation failed',
                profile: validation.profile,
                issues: validation.errors,
            });
        }

        const db = getRegionalClient(region);
        await db.send(new PutCommand({ TableName: TABLE, Item: record }));

        await writeAuditLog(user.id, patientId, 'RECORD_IMMUNIZATION',
            `Recorded immunization: ${cvxInfo.shortDescription} (CVX ${cvxCode})`,
            { region, immunizationId, cvxCode }
        );

        res.status(201).json(fhirResource);
    } catch (error: any) {
        safeError('Record immunization error:', error);
        res.status(500).json({ error: 'Failed to record immunization' });
    }
};

// ─── GET /immunizations/:patientId ─────────────────────────────────────────

export const getPatientImmunizations = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        // Authorization
        if (!user.isDoctor && user.id !== patientId) {
            return res.status(403).json({ error: 'Not authorized to view this patient\'s immunizations' });
        }

        const db = getRegionalClient(region);
        const { Items = [] } = await db.send(new QueryCommand({
            TableName: TABLE,
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        // Sort by date descending
        const sorted = Items.sort((a: any, b: any) =>
            new Date(b.administrationDate).getTime() - new Date(a.administrationDate).getTime()
        );

        // Group by vaccine group for immunization schedule view
        const byGroup: Record<string, any[]> = {};
        for (const item of sorted) {
            const group = (item as any).vaccineGroup || 'Other';
            if (!byGroup[group]) byGroup[group] = [];
            byGroup[group].push(toFHIR(item));
        }

        await writeAuditLog(user.id, patientId, 'VIEW_IMMUNIZATIONS', `Viewed immunizations for patient ${patientId}`, { region });

        res.json({
            resourceType: 'Bundle',
            type: 'searchset',
            total: sorted.length,
            entry: sorted.map((item: any) => ({ resource: toFHIR(item) })),
            groupedByVaccine: byGroup,
        });
    } catch (error: any) {
        safeError('Get immunizations error:', error);
        res.status(500).json({ error: 'Failed to retrieve immunizations' });
    }
};

// ─── PUT /immunizations/:patientId/:immunizationId ─────────────────────────

export const updateImmunization = async (req: Request, res: Response) => {
    try {
        const { patientId, immunizationId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        if (!user.isDoctor) {
            return res.status(403).json({ error: 'Only healthcare providers can update immunizations' });
        }

        const db = getRegionalClient(region);
        const { Item } = await db.send(new GetCommand({
            TableName: TABLE,
            Key: { patientId, immunizationId }
        }));

        if (!Item) {
            return res.status(404).json({ error: 'Immunization record not found' });
        }

        const allowedFields = ['status', 'notes', 'lotNumber', 'expirationDate', 'doseNumber', 'seriesDoses'];
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

        // US Core validation before write: merge existing record with proposed updates
        const merged = { ...Item };
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) merged[field] = req.body[field];
        }
        const preValidation = validateUSCore(toFHIR(merged));
        if (!preValidation.valid) {
            return res.status(422).json({
                error: 'US Core Immunization validation failed',
                profile: preValidation.profile,
                issues: preValidation.errors,
            });
        }

        updates.push('#updatedAt = :now');
        names['#updatedAt'] = 'updatedAt';

        const { Attributes } = await db.send(new UpdateCommand({
            TableName: TABLE,
            Key: { patientId, immunizationId },
            UpdateExpression: `SET ${updates.join(', ')}`,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: 'ALL_NEW'
        }));

        await writeAuditLog(user.id, patientId, 'UPDATE_IMMUNIZATION', `Updated immunization: ${immunizationId}`, { region });

        res.json(toFHIR(Attributes));
    } catch (error: any) {
        safeError('Update immunization error:', error);
        res.status(500).json({ error: 'Failed to update immunization' });
    }
};
