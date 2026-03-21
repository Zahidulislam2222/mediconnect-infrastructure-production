// ─── FEATURE #19: DEA Number Validation ────────────────────────────────────
// Validates DEA (Drug Enforcement Administration) license numbers for
// controlled substance prescribing authorization.
// Format: 2 letters + 6 digits + 1 check digit
// First letter: registrant type (A/B/C/D/F/G/M)
// Second letter: first letter of registrant's last name
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { writeAuditLog } from '../../../../shared/audit';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── DEA Registrant Type Codes ─────────────────────────────────────────────

const DEA_REGISTRANT_TYPES: Record<string, string> = {
    'A': 'Deprecated (used by older registrants)',
    'B': 'Hospital/Clinic',
    'C': 'Practitioner (MD, DO, DDS, DVM, etc.)',
    'D': 'Teaching Institution',
    'E': 'Manufacturer',
    'F': 'Distributor',
    'G': 'Researcher',
    'H': 'Analytical Lab',
    'J': 'Importer',
    'K': 'Exporter',
    'L': 'Reverse Distributor',
    'M': 'Mid-Level Practitioner (NP, PA, etc.)',
    'P': 'Narcotic Treatment Program',
    'R': 'Narcotic Treatment Program (Compounder)',
    'S': 'Narcotic Treatment Program (Supplier)',
    'T': 'Narcotic Treatment Program (Researcher)',
    'X': 'Suboxone/Subutex Prescriber (DATA 2000 waiver)',
};

// Schedule descriptions
const SCHEDULES: Record<string, string> = {
    'I': 'No accepted medical use, high abuse potential (heroin, LSD, ecstasy)',
    'II': 'High abuse potential, severe dependence (oxycodone, fentanyl, Adderall)',
    'III': 'Moderate abuse potential (testosterone, ketamine, Tylenol with codeine)',
    'IV': 'Lower abuse potential (Xanax, Valium, Ambien, tramadol)',
    'V': 'Lowest abuse potential (cough preparations with codeine, pregabalin)',
};

// ─── DEA Checksum Algorithm ────────────────────────────────────────────────
// 1. Add digits in positions 1, 3, 5
// 2. Add digits in positions 2, 4, 6 and multiply by 2
// 3. Sum of above mod 10 = check digit (position 7)

function validateDEAChecksum(dea: string): { valid: boolean; details: string } {
    const cleaned = dea.toUpperCase().trim();

    // Must be exactly 9 characters
    if (cleaned.length !== 9) {
        return { valid: false, details: 'DEA number must be exactly 9 characters' };
    }

    // First character: registrant type
    const firstChar = cleaned[0];
    if (!DEA_REGISTRANT_TYPES[firstChar]) {
        return { valid: false, details: `Invalid registrant type code: ${firstChar}. Valid: ${Object.keys(DEA_REGISTRANT_TYPES).join(', ')}` };
    }

    // Second character: must be a letter (first letter of last name)
    const secondChar = cleaned[1];
    if (!/[A-Z]/.test(secondChar)) {
        return { valid: false, details: 'Second character must be a letter (first letter of registrant\'s last name)' };
    }

    // Characters 3-9: must be digits
    const digits = cleaned.substring(2);
    if (!/^\d{7}$/.test(digits)) {
        return { valid: false, details: 'Characters 3-9 must be digits' };
    }

    // Checksum calculation
    const d = digits.split('').map(Number);
    const oddSum = d[0] + d[2] + d[4];    // positions 1, 3, 5
    const evenSum = d[1] + d[3] + d[5];    // positions 2, 4, 6
    const total = oddSum + (evenSum * 2);
    const checkDigit = total % 10;

    if (checkDigit !== d[6]) {
        return { valid: false, details: `Checksum failed: expected ${checkDigit}, found ${d[6]}` };
    }

    return { valid: true, details: 'Checksum verified' };
}

// ─── GET /doctors/dea/validate/:dea ────────────────────────────────────────

export const validateDEA = async (req: Request, res: Response) => {
    try {
        const { dea } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        if (!dea) {
            return res.status(400).json({ error: 'DEA number is required' });
        }

        const cleaned = dea.toUpperCase().trim();
        const checksumResult = validateDEAChecksum(cleaned);

        const firstChar = cleaned[0] || '';
        const secondChar = cleaned[1] || '';
        const registrantType = DEA_REGISTRANT_TYPES[firstChar];

        // Determine if this is a practitioner-type DEA
        const isPractitioner = ['A', 'B', 'C', 'D', 'M', 'X'].includes(firstChar);

        const result: any = {
            dea: cleaned,
            valid: checksumResult.valid,
            format: {
                registrantTypeCode: firstChar,
                registrantType: registrantType || 'Unknown',
                lastNameInitial: /[A-Z]/.test(secondChar) ? secondChar : null,
                isPractitioner,
            },
            checksum: checksumResult.details,
        };

        // FHIR Practitioner.qualification
        if (checksumResult.valid) {
            result.fhir = {
                resourceType: 'Practitioner',
                identifier: [{
                    system: 'http://hl7.org/fhir/sid/us-dea',
                    value: cleaned,
                    type: {
                        coding: [{
                            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                            code: 'DEA',
                            display: 'Drug Enforcement Administration registration number'
                        }]
                    }
                }],
                qualification: [{
                    code: {
                        coding: [{
                            system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
                            code: 'DEA',
                            display: 'DEA Registration'
                        }]
                    },
                    identifier: [{
                        system: 'http://hl7.org/fhir/sid/us-dea',
                        value: cleaned
                    }]
                }]
            };

            result.controlledSubstanceSchedules = SCHEDULES;
        }

        await writeAuditLog(user.id, 'DEA_VALIDATION', 'VALIDATE_DEA', `DEA validation: ${cleaned} → ${checksumResult.valid ? 'VALID' : 'INVALID'}`, { region });

        res.json(result);
    } catch (error: any) {
        console.error('DEA validation error:', error);
        res.status(500).json({ error: 'DEA validation failed' });
    }
};

// ─── GET /doctors/dea/schedules ────────────────────────────────────────────

export const getDEASchedules = async (_req: Request, res: Response) => {
    res.json({
        schedules: Object.entries(SCHEDULES).map(([schedule, description]) => ({
            schedule: `Schedule ${schedule}`,
            code: schedule,
            description,
        })),
        registrantTypes: Object.entries(DEA_REGISTRANT_TYPES).map(([code, description]) => ({
            code,
            description,
        }))
    });
};
