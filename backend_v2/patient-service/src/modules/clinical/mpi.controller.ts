// ─── FEATURE #22: Master Patient Index (MPI) ──────────────────────────────
// Patient deduplication and matching using probabilistic scoring.
// Matches on: name (phonetic), DOB, gender, phone, email, address.
// Supports merge operations for confirmed duplicates.
// Returns FHIR Patient with match confidence scores.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, ScanCommand, GetCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';

const TABLE_PATIENTS = process.env.DYNAMO_TABLE || 'mediconnect-patients';
const TABLE_MPI = process.env.TABLE_MPI || 'mediconnect-mpi-links';
const SOUNDEX_GSI = process.env.MPI_SOUNDEX_GSI || ''; // Set to GSI name when available (e.g., 'soundexLastName-index')

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Gap #6 FIX: GSI-ready phonetic search ──────────────────────────────────
// When SOUNDEX_GSI is configured, narrows candidates to same phonetic block
// before doing pairwise scoring. Reduces O(n²) to O(k²) where k << n.
// Without GSI, falls back to full Scan (demo mode).

async function getCandidatePatients(
    db: any,
    criteria: { lastName?: string },
): Promise<any[]> {
    if (SOUNDEX_GSI && criteria.lastName) {
        // Production path: Query GSI on Soundex(lastName)
        const phoneticKey = soundex(criteria.lastName);
        try {
            const { Items } = await db.send(new QueryCommand({
                TableName: TABLE_PATIENTS,
                IndexName: SOUNDEX_GSI,
                KeyConditionExpression: 'soundexLastName = :sk',
                ExpressionAttributeValues: { ':sk': phoneticKey },
            }));
            return Items || [];
        } catch {
            // GSI not yet created — fall back to Scan
        }
    }

    // Demo/fallback: Full table scan
    const { Items } = await db.send(new ScanCommand({ TableName: TABLE_PATIENTS }));
    return Items || [];
}

// ─── Phonetic Matching (Soundex) ────────────────────────────────────────────

function soundex(name: string): string {
    if (!name) return '';
    const s = name.toUpperCase().replace(/[^A-Z]/g, '');
    if (s.length === 0) return '';

    const codes: Record<string, string> = {
        B: '1', F: '1', P: '1', V: '1',
        C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
        D: '3', T: '3',
        L: '4',
        M: '5', N: '5',
        R: '6',
    };

    let result = s[0];
    let lastCode = codes[s[0]] || '';

    for (let i = 1; i < s.length && result.length < 4; i++) {
        const code = codes[s[i]] || '';
        if (code && code !== lastCode) {
            result += code;
        }
        lastCode = code || lastCode;
    }

    return result.padEnd(4, '0');
}

// ─── Match Scoring Weights ──────────────────────────────────────────────────

interface MatchWeights {
    exactName: number;
    phoneticName: number;
    dob: number;
    gender: number;
    phone: number;
    email: number;
    city: number;
}

const WEIGHTS: MatchWeights = {
    exactName: 30,
    phoneticName: 15,
    dob: 25,
    gender: 5,
    phone: 15,
    email: 15,
    city: 5,
};

const MATCH_THRESHOLDS = {
    definite: 85,   // Auto-link
    probable: 65,   // Review recommended
    possible: 45,   // Needs manual review
};

// ─── Scoring Function ───────────────────────────────────────────────────────

interface MatchResult {
    patientId: string;
    score: number;
    confidence: 'definite' | 'probable' | 'possible' | 'no-match';
    matchDetails: { field: string; matched: boolean; weight: number }[];
    patient: any;
}

function scoreMatch(candidate: any, criteria: any): MatchResult {
    const details: { field: string; matched: boolean; weight: number }[] = [];
    let score = 0;

    // Exact name match
    const candidateFirst = (candidate.firstName || '').toLowerCase().trim();
    const candidateLast = (candidate.lastName || '').toLowerCase().trim();
    const searchFirst = (criteria.firstName || '').toLowerCase().trim();
    const searchLast = (criteria.lastName || '').toLowerCase().trim();

    const exactNameMatch = candidateFirst === searchFirst && candidateLast === searchLast && searchFirst.length > 0;
    details.push({ field: 'exactName', matched: exactNameMatch, weight: exactNameMatch ? WEIGHTS.exactName : 0 });
    if (exactNameMatch) score += WEIGHTS.exactName;

    // Phonetic name match (only if no exact match)
    if (!exactNameMatch && searchFirst) {
        const phoneticMatch = soundex(candidateFirst) === soundex(searchFirst) && soundex(candidateLast) === soundex(searchLast);
        details.push({ field: 'phoneticName', matched: phoneticMatch, weight: phoneticMatch ? WEIGHTS.phoneticName : 0 });
        if (phoneticMatch) score += WEIGHTS.phoneticName;
    }

    // DOB match
    if (criteria.dob) {
        const dobMatch = candidate.dob === criteria.dob;
        details.push({ field: 'dob', matched: dobMatch, weight: dobMatch ? WEIGHTS.dob : 0 });
        if (dobMatch) score += WEIGHTS.dob;
    }

    // Gender match
    if (criteria.gender) {
        const genderMatch = (candidate.gender || '').toLowerCase() === criteria.gender.toLowerCase();
        details.push({ field: 'gender', matched: genderMatch, weight: genderMatch ? WEIGHTS.gender : 0 });
        if (genderMatch) score += WEIGHTS.gender;
    }

    // Phone match
    if (criteria.phone) {
        const normalizePhone = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
        const phoneMatch = normalizePhone(candidate.phone) === normalizePhone(criteria.phone) && normalizePhone(criteria.phone).length >= 10;
        details.push({ field: 'phone', matched: phoneMatch, weight: phoneMatch ? WEIGHTS.phone : 0 });
        if (phoneMatch) score += WEIGHTS.phone;
    }

    // Email match
    if (criteria.email) {
        const emailMatch = (candidate.email || '').toLowerCase() === criteria.email.toLowerCase();
        details.push({ field: 'email', matched: emailMatch, weight: emailMatch ? WEIGHTS.email : 0 });
        if (emailMatch) score += WEIGHTS.email;
    }

    // City match
    if (criteria.city) {
        const cityMatch = (candidate.city || '').toLowerCase() === criteria.city.toLowerCase();
        details.push({ field: 'city', matched: cityMatch, weight: cityMatch ? WEIGHTS.city : 0 });
        if (cityMatch) score += WEIGHTS.city;
    }

    // Normalize score to 0-100
    const maxPossible = Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - (exactNameMatch ? WEIGHTS.phoneticName : 0);
    const normalizedScore = Math.round((score / maxPossible) * 100);

    const confidence = normalizedScore >= MATCH_THRESHOLDS.definite ? 'definite'
        : normalizedScore >= MATCH_THRESHOLDS.probable ? 'probable'
        : normalizedScore >= MATCH_THRESHOLDS.possible ? 'possible'
        : 'no-match';

    return {
        patientId: candidate.cognitoSub || candidate.id,
        score: normalizedScore,
        confidence,
        matchDetails: details,
        patient: {
            resourceType: 'Patient',
            id: candidate.cognitoSub || candidate.id,
            name: [{ family: candidate.lastName, given: [candidate.firstName] }],
            gender: candidate.gender,
            birthDate: candidate.dob,
            telecom: [
                candidate.phone ? { system: 'phone', value: candidate.phone } : null,
                candidate.email ? { system: 'email', value: candidate.email } : null,
            ].filter(Boolean),
            address: candidate.city ? [{ city: candidate.city, state: candidate.state }] : [],
        },
    };
}

// ─── POST /mpi/search — Search for matching patients ────────────────────────

export const searchMPI = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { firstName, lastName, dob, gender, phone, email, city } = req.body;
        if (!firstName && !lastName && !dob && !phone && !email) {
            return res.status(400).json({ error: 'At least one search criterion required (firstName, lastName, dob, phone, or email)' });
        }

        const criteria = { firstName, lastName, dob, gender, phone, email, city };

        // ─── Gap #6 FIX: Use GSI-ready candidate search ────────────────
        const patients = await getCandidatePatients(db, { lastName });

        const matches: MatchResult[] = patients
            .map(p => scoreMatch(p, criteria))
            .filter(m => m.confidence !== 'no-match')
            .sort((a, b) => b.score - a.score);

        await writeAuditLog(user.id, 'MPI', 'MPI_SEARCH', `MPI search: ${matches.length} matches found`, { region, criteria: { firstName, lastName, dob } });

        res.json({
            resourceType: 'Bundle',
            type: 'searchset',
            total: matches.length,
            entry: matches.map(m => ({
                resource: m.patient,
                search: {
                    mode: 'match',
                    score: m.score / 100,
                    extension: [
                        { url: 'http://mediconnect.health/fhir/mpi-confidence', valueString: m.confidence },
                        { url: 'http://mediconnect.health/fhir/mpi-match-details', valueString: JSON.stringify(m.matchDetails) },
                    ],
                },
            })),
            thresholds: MATCH_THRESHOLDS,
        });

    } catch (error: any) {
        res.status(500).json({ error: 'MPI search failed', details: error.message });
    }
};

// ─── POST /mpi/link — Link two patient records as duplicates ────────────────

export const linkPatients = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        if (!user.isDoctor && !user.isAdmin) {
            return res.status(403).json({ error: 'Only doctors or admins can link patient records' });
        }

        const { sourcePatientId, targetPatientId, linkType } = req.body;
        if (!sourcePatientId || !targetPatientId) {
            return res.status(400).json({ error: 'sourcePatientId and targetPatientId required' });
        }

        const linkId = uuidv4();
        const now = new Date().toISOString();

        await db.send(new PutCommand({
            TableName: TABLE_MPI,
            Item: {
                linkId,
                sourcePatientId,
                targetPatientId,
                linkType: linkType || 'duplicate',
                status: 'active',
                linkedBy: user.id,
                createdAt: now,
            },
        }));

        await writeAuditLog(user.id, sourcePatientId, 'MPI_LINK_CREATED', `Linked ${sourcePatientId} → ${targetPatientId} (${linkType || 'duplicate'})`, { region, targetPatientId, linkId });

        res.status(201).json({
            resourceType: 'Patient',
            id: sourcePatientId,
            link: [{
                other: { reference: `Patient/${targetPatientId}` },
                type: linkType === 'refer' ? 'refer' : 'replaced-by',
            }],
            meta: { linkId, status: 'active', linkedBy: user.id, createdAt: now },
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to link patients', details: error.message });
    }
};

// ─── GET /mpi/links/:patientId — Get links for a patient ───────────────────

export const getPatientLinks = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new ScanCommand({
            TableName: TABLE_MPI,
            FilterExpression: 'sourcePatientId = :pid OR targetPatientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        const links = (Items || []).map((l: any) => ({
            linkId: l.linkId,
            type: l.linkType,
            status: l.status,
            source: { reference: `Patient/${l.sourcePatientId}` },
            target: { reference: `Patient/${l.targetPatientId}` },
            linkedBy: l.linkedBy,
            createdAt: l.createdAt,
        }));

        res.json({ resourceType: 'Bundle', type: 'searchset', total: links.length, entry: links });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get patient links', details: error.message });
    }
};

// ─── GET /mpi/duplicates — Scan for potential duplicates ────────────────────

export const scanDuplicates = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        if (!user.isDoctor && !user.isAdmin) {
            return res.status(403).json({ error: 'Only doctors or admins can scan for duplicates' });
        }

        // ─── Gap #6 FIX: Use paginated scan for full duplicate detection ──
        const patients = await (async () => {
            const allItems: any[] = [];
            let lastKey: any = undefined;
            do {
                const params: any = { TableName: TABLE_PATIENTS, Limit: 1000, ...(lastKey && { ExclusiveStartKey: lastKey }) };
                const result = await db.send(new ScanCommand(params));
                allItems.push(...(result.Items || []));
                lastKey = result.LastEvaluatedKey;
            } while (lastKey);
            return allItems;
        })();
        if (patients.length < 2) {
            return res.json({ duplicates: [], total: 0 });
        }

        const potentialDuplicates: any[] = [];
        const seen = new Set<string>();

        // ─── Gap #2 FIX: Production Scaling Note ──────────────────────
        // DEMO MODE: O(n²) pairwise comparison via DynamoDB Scan.
        // PRODUCTION: Replace with:
        //   1. GSI on Soundex(lastName) — narrows candidates to same phonetic block
        //   2. ElasticSearch / OpenSearch fuzzy matching for real-time queries
        //   3. Pagination via ExclusiveStartKey (DynamoDB) or scroll API (ES)
        //   4. LSH (Locality-Sensitive Hashing) for approximate nearest neighbors
        // Current approach is fine for <1000 patients; breaks at >5000.
        // ─────────────────────────────────────────────────────────────────
        for (let i = 0; i < patients.length; i++) {
            for (let j = i + 1; j < patients.length; j++) {
                const pairKey = `${patients[i].cognitoSub}-${patients[j].cognitoSub}`;
                if (seen.has(pairKey)) continue;

                const result = scoreMatch(patients[j], {
                    firstName: patients[i].firstName,
                    lastName: patients[i].lastName,
                    dob: patients[i].dob,
                    gender: patients[i].gender,
                    phone: patients[i].phone,
                    email: patients[i].email,
                    city: patients[i].city,
                });

                if (result.confidence === 'definite' || result.confidence === 'probable') {
                    seen.add(pairKey);
                    potentialDuplicates.push({
                        patient1: { id: patients[i].cognitoSub, name: `${patients[i].firstName} ${patients[i].lastName}` },
                        patient2: { id: patients[j].cognitoSub, name: `${patients[j].firstName} ${patients[j].lastName}` },
                        score: result.score,
                        confidence: result.confidence,
                        matchDetails: result.matchDetails,
                    });
                }
            }
        }

        potentialDuplicates.sort((a, b) => b.score - a.score);

        res.json({
            total: potentialDuplicates.length,
            thresholds: MATCH_THRESHOLDS,
            duplicates: potentialDuplicates,
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Duplicate scan failed', details: error.message });
    }
};
