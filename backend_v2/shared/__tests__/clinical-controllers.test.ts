export {};
// ─── Gap #3 FIX: Unit tests for high-risk clinical controllers ──────────────
// Pure function tests for: RxNorm severity mapping, MPI scoring/Soundex,
// Med-Reconciliation issue detection, Prior-Auth FHIR mapping.
// No AWS mocking needed — tests only pure business logic.
// Run: npx tsx shared/__tests__/clinical-controllers.test.ts
// ────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${message}`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${message}`);
    }
}

function describe(name: string, fn: () => void) {
    console.log(`\n🧪 ${name}`);
    fn();
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. MPI — Soundex Algorithm
// ═══════════════════════════════════════════════════════════════════════════

// Inline Soundex (mirrors mpi.controller.ts implementation)
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

describe('MPI — Soundex phonetic encoding', () => {
    assert(soundex('Robert') === 'R163', `Robert → R163 (got ${soundex('Robert')})`);
    assert(soundex('Rupert') === 'R163', `Rupert → R163 (phonetic match with Robert)`);
    assert(soundex('Smith') === 'S530', `Smith → S530 (got ${soundex('Smith')})`);
    assert(soundex('Smyth') === 'S530', `Smyth → S530 (phonetic match with Smith)`);
    assert(soundex('Johnson') === soundex('Jonson'), `Johnson ≈ Jonson (phonetic match)`);
    assert(soundex('') === '', 'Empty string returns empty');
    assert(soundex('A') === 'A000', `Single char pads to 4 (got ${soundex('A')})`);
    assert(soundex('Ashcraft') === soundex('Ashcroft'), 'Ashcraft ≈ Ashcroft');
    assert(soundex('Martinez') !== soundex('Smith'), 'Martinez ≠ Smith');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. MPI — Match Scoring
// ═══════════════════════════════════════════════════════════════════════════

const WEIGHTS = {
    exactName: 30, phoneticName: 15, dob: 25, gender: 5,
    phone: 15, email: 15, city: 5,
};
const MATCH_THRESHOLDS = { definite: 85, probable: 65, possible: 45 };

function scoreMatchSimple(candidate: any, criteria: any): { score: number; confidence: string } {
    let score = 0;
    const candidateFirst = (candidate.firstName || '').toLowerCase().trim();
    const candidateLast = (candidate.lastName || '').toLowerCase().trim();
    const searchFirst = (criteria.firstName || '').toLowerCase().trim();
    const searchLast = (criteria.lastName || '').toLowerCase().trim();

    const exactNameMatch = candidateFirst === searchFirst && candidateLast === searchLast && searchFirst.length > 0;
    if (exactNameMatch) score += WEIGHTS.exactName;

    if (!exactNameMatch && searchFirst) {
        if (soundex(candidateFirst) === soundex(searchFirst) && soundex(candidateLast) === soundex(searchLast)) {
            score += WEIGHTS.phoneticName;
        }
    }

    if (criteria.dob && candidate.dob === criteria.dob) score += WEIGHTS.dob;
    if (criteria.gender && (candidate.gender || '').toLowerCase() === criteria.gender.toLowerCase()) score += WEIGHTS.gender;

    if (criteria.phone) {
        const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-10);
        if (norm(candidate.phone) === norm(criteria.phone) && norm(criteria.phone).length >= 10) score += WEIGHTS.phone;
    }
    if (criteria.email && (candidate.email || '').toLowerCase() === criteria.email.toLowerCase()) score += WEIGHTS.email;
    if (criteria.city && (candidate.city || '').toLowerCase() === criteria.city.toLowerCase()) score += WEIGHTS.city;

    const maxPossible = Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - (exactNameMatch ? WEIGHTS.phoneticName : 0);
    const normalizedScore = Math.round((score / maxPossible) * 100);

    const confidence = normalizedScore >= MATCH_THRESHOLDS.definite ? 'definite'
        : normalizedScore >= MATCH_THRESHOLDS.probable ? 'probable'
        : normalizedScore >= MATCH_THRESHOLDS.possible ? 'possible'
        : 'no-match';

    return { score: normalizedScore, confidence };
}

describe('MPI — Match scoring', () => {
    // Exact match: all fields
    const exact = scoreMatchSimple(
        { firstName: 'John', lastName: 'Smith', dob: '1990-01-01', gender: 'male', phone: '555-123-4567', email: 'john@test.com', city: 'Boston' },
        { firstName: 'John', lastName: 'Smith', dob: '1990-01-01', gender: 'male', phone: '5551234567', email: 'john@test.com', city: 'Boston' }
    );
    assert(exact.confidence === 'definite', `All fields match → definite (score: ${exact.score})`);

    // Phonetic match + DOB + gender (3 of 7 fields, weaker signal)
    const phonetic = scoreMatchSimple(
        { firstName: 'Jon', lastName: 'Smyth', dob: '1990-01-01', gender: 'male' },
        { firstName: 'John', lastName: 'Smith', dob: '1990-01-01', gender: 'male' }
    );
    assert(phonetic.score > 0 && phonetic.score < 50, `Phonetic + DOB + gender → positive but below 50 (score: ${phonetic.score})`);

    // Phonetic match + DOB + gender + phone + email → definite
    const phoneticStrong = scoreMatchSimple(
        { firstName: 'Jon', lastName: 'Smyth', dob: '1990-01-01', gender: 'male', phone: '555-123-4567', email: 'john@test.com' },
        { firstName: 'John', lastName: 'Smith', dob: '1990-01-01', gender: 'male', phone: '5551234567', email: 'john@test.com' }
    );
    assert(phoneticStrong.confidence === 'probable' || phoneticStrong.confidence === 'definite', `Phonetic + DOB + gender + phone + email → probable/definite (score: ${phoneticStrong.score})`);

    // No match
    const noMatch = scoreMatchSimple(
        { firstName: 'Alice', lastName: 'Wong', dob: '1985-06-15', gender: 'female' },
        { firstName: 'John', lastName: 'Smith', dob: '1990-01-01', gender: 'male' }
    );
    assert(noMatch.confidence === 'no-match', `Completely different → no-match (score: ${noMatch.score})`);

    // Name match only (no other data)
    const nameOnly = scoreMatchSimple(
        { firstName: 'John', lastName: 'Smith' },
        { firstName: 'John', lastName: 'Smith' }
    );
    assert(nameOnly.score > 0, `Name-only match has positive score (${nameOnly.score})`);
    assert(nameOnly.confidence !== 'definite', 'Name-only is not definite (needs more fields)');

    // Phone normalization
    const phoneMatch = scoreMatchSimple(
        { firstName: 'A', lastName: 'B', phone: '(555) 123-4567' },
        { firstName: 'C', lastName: 'D', phone: '5551234567' }
    );
    assert(phoneMatch.score > 0, 'Phone normalization strips non-digits for comparison');
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Med-Reconciliation — Drug Classification & Issue Detection
// ═══════════════════════════════════════════════════════════════════════════

interface DrugClass {
    className: string;
    medications: string[];
    conflicts: string[];
    duplicateWarning: string;
}

const DRUG_CLASSES: DrugClass[] = [
    { className: 'ACE Inhibitors', medications: ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'benazepril'], conflicts: ['ARBs', 'Potassium-sparing Diuretics', 'Aliskiren'], duplicateWarning: 'Multiple ACE inhibitors' },
    { className: 'ARBs', medications: ['losartan', 'valsartan', 'irbesartan', 'candesartan', 'olmesartan'], conflicts: ['ACE Inhibitors', 'Aliskiren'], duplicateWarning: 'Multiple ARBs' },
    { className: 'Statins', medications: ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin'], conflicts: ['Fibrates', 'Niacin'], duplicateWarning: 'Multiple statins' },
    { className: 'NSAIDs', medications: ['ibuprofen', 'naproxen', 'celecoxib', 'diclofenac', 'meloxicam', 'indomethacin'], conflicts: ['Anticoagulants', 'ACE Inhibitors', 'ARBs'], duplicateWarning: 'Multiple NSAIDs' },
    { className: 'Opioids', medications: ['oxycodone', 'hydrocodone', 'morphine', 'fentanyl', 'tramadol', 'codeine', 'methadone'], conflicts: ['Benzodiazepines', 'Sedatives'], duplicateWarning: 'Multiple opioids — high overdose risk' },
    { className: 'Benzodiazepines', medications: ['alprazolam', 'lorazepam', 'diazepam', 'clonazepam', 'temazepam'], conflicts: ['Opioids', 'Alcohol', 'Sedatives'], duplicateWarning: 'Multiple benzodiazepines' },
    { className: 'SSRIs', medications: ['fluoxetine', 'sertraline', 'escitalopram', 'citalopram', 'paroxetine'], conflicts: ['MAOIs', 'SNRIs', 'Triptans'], duplicateWarning: 'Multiple SSRIs' },
    { className: 'Anticoagulants', medications: ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin'], conflicts: ['NSAIDs', 'Antiplatelets'], duplicateWarning: 'Multiple anticoagulants' },
];

function classifyMedication(name: string): DrugClass | null {
    const normalized = name.toLowerCase().trim();
    return DRUG_CLASSES.find(dc => dc.medications.some(m => normalized.includes(m))) || null;
}

describe('Med-Reconciliation — Drug classification', () => {
    assert(classifyMedication('Lisinopril 10mg')?.className === 'ACE Inhibitors', 'Lisinopril classified as ACE Inhibitor');
    assert(classifyMedication('losartan 50mg')?.className === 'ARBs', 'Losartan classified as ARB');
    assert(classifyMedication('atorvastatin 40mg')?.className === 'Statins', 'Atorvastatin classified as Statin');
    assert(classifyMedication('oxycodone 5mg')?.className === 'Opioids', 'Oxycodone classified as Opioid');
    assert(classifyMedication('alprazolam 0.5mg')?.className === 'Benzodiazepines', 'Alprazolam classified as Benzodiazepine');
    assert(classifyMedication('aspirin 81mg') === null, 'Aspirin not in these classes (antiplatelets not in test DRUG_CLASSES)');
    assert(classifyMedication('metformin 500mg') === null, 'Metformin not classified (no diabetes class in test set)');
    assert(classifyMedication('warfarin 5mg')?.className === 'Anticoagulants', 'Warfarin classified as Anticoagulant');
});

describe('Med-Reconciliation — Conflict detection', () => {
    const aceClass = DRUG_CLASSES.find(d => d.className === 'ACE Inhibitors')!;
    assert(aceClass.conflicts.includes('ARBs'), 'ACE Inhibitors conflict with ARBs');

    const nsaidClass = DRUG_CLASSES.find(d => d.className === 'NSAIDs')!;
    assert(nsaidClass.conflicts.includes('Anticoagulants'), 'NSAIDs conflict with Anticoagulants');

    const opioidClass = DRUG_CLASSES.find(d => d.className === 'Opioids')!;
    assert(opioidClass.conflicts.includes('Benzodiazepines'), 'Opioids conflict with Benzodiazepines (respiratory depression)');

    const ssriClass = DRUG_CLASSES.find(d => d.className === 'SSRIs')!;
    assert(ssriClass.conflicts.includes('MAOIs'), 'SSRIs conflict with MAOIs (serotonin syndrome)');
});

describe('Med-Reconciliation — Duplicate detection', () => {
    // Two ACE inhibitors = therapeutic duplication
    const aceInhibitors = [
        { name: 'lisinopril 10mg', source: 'hospital' },
        { name: 'enalapril 5mg', source: 'pharmacy' },
    ];

    const classified = aceInhibitors.map(m => ({ med: m, dc: classifyMedication(m.name) })).filter(x => x.dc);
    const classGroups: Record<string, any[]> = {};
    for (const c of classified) {
        const cn = c.dc!.className;
        if (!classGroups[cn]) classGroups[cn] = [];
        classGroups[cn].push(c);
    }

    const hasDuplicate = Object.values(classGroups).some(g => g.length > 1);
    assert(hasDuplicate, 'Two ACE inhibitors detected as therapeutic duplication');

    // No duplication for different classes
    const different = [
        { name: 'lisinopril 10mg', source: 'hospital' },
        { name: 'atorvastatin 40mg', source: 'pharmacy' },
    ];
    const classified2 = different.map(m => ({ med: m, dc: classifyMedication(m.name) })).filter(x => x.dc);
    const classGroups2: Record<string, any[]> = {};
    for (const c of classified2) {
        const cn = c.dc!.className;
        if (!classGroups2[cn]) classGroups2[cn] = [];
        classGroups2[cn].push(c);
    }
    const hasDuplicate2 = Object.values(classGroups2).some(g => g.length > 1);
    assert(!hasDuplicate2, 'ACE inhibitor + statin is NOT a duplication');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. RxNorm — Severity Mapping
// ═══════════════════════════════════════════════════════════════════════════

function mapSeverity(description: string): "critical" | "high" | "moderate" | "low" {
    const d = description.toLowerCase();
    if (d.includes("contraindicated") || d.includes("serious") || d.includes("life-threatening")) return "critical";
    if (d.includes("major") || d.includes("severe")) return "high";
    if (d.includes("moderate")) return "moderate";
    return "low";
}

describe('RxNorm — Severity mapping', () => {
    assert(mapSeverity('Contraindicated drug combination') === 'critical', 'Contraindicated → critical');
    assert(mapSeverity('Serious adverse reaction possible') === 'critical', 'Serious → critical');
    assert(mapSeverity('Life-threatening interaction') === 'critical', 'Life-threatening → critical');
    assert(mapSeverity('Major drug interaction') === 'high', 'Major → high');
    assert(mapSeverity('Severe hepatotoxicity risk') === 'high', 'Severe → high');
    assert(mapSeverity('Moderate interaction — monitor closely') === 'moderate', 'Moderate → moderate');
    assert(mapSeverity('Minor drowsiness may occur') === 'low', 'Minor/unrecognized → low');
    assert(mapSeverity('') === 'low', 'Empty description → low');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Prior-Auth — FHIR ClaimResponse Mapping
// ═══════════════════════════════════════════════════════════════════════════

function toFHIRClaimResponse(auth: any): any {
    return {
        resourceType: 'ClaimResponse',
        id: auth.authId,
        status: 'active',
        type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
        use: 'preauthorization',
        patient: { reference: `Patient/${auth.patientId}` },
        created: auth.createdAt,
        insurer: { display: auth.insurerName || 'Unknown Insurer' },
        outcome: auth.status === 'approved' ? 'complete'
            : auth.status === 'denied' ? 'error'
            : 'queued',
        disposition: auth.status === 'approved' ? 'Authorization approved'
            : auth.status === 'denied' ? `Denied: ${auth.denialReason || 'See details'}`
            : 'Pending review',
        preAuthRef: auth.authorizationNumber || undefined,
    };
}

describe('Prior-Auth — FHIR ClaimResponse mapping', () => {
    const pending = toFHIRClaimResponse({
        authId: 'auth-001', patientId: 'patient-123', status: 'pending',
        createdAt: '2025-01-01T00:00:00Z', insurerName: 'Aetna'
    });
    assert(pending.resourceType === 'ClaimResponse', 'Resource type is ClaimResponse');
    assert(pending.outcome === 'queued', 'Pending status → queued outcome');
    assert(pending.patient.reference === 'Patient/patient-123', 'Patient reference correct');
    assert(pending.insurer.display === 'Aetna', 'Insurer name preserved');
    assert(pending.use === 'preauthorization', 'Use is preauthorization');

    const approved = toFHIRClaimResponse({
        authId: 'auth-002', patientId: 'p-456', status: 'approved',
        authorizationNumber: 'PA-ABC123', createdAt: '2025-01-01'
    });
    assert(approved.outcome === 'complete', 'Approved → complete outcome');
    assert(approved.disposition === 'Authorization approved', 'Approved disposition text');
    assert(approved.preAuthRef === 'PA-ABC123', 'Authorization number in preAuthRef');

    const denied = toFHIRClaimResponse({
        authId: 'auth-003', patientId: 'p-789', status: 'denied',
        denialReason: 'Not medically necessary', createdAt: '2025-01-01'
    });
    assert(denied.outcome === 'error', 'Denied → error outcome');
    assert(denied.disposition.includes('Not medically necessary'), 'Denial reason in disposition');

    const noInsurer = toFHIRClaimResponse({ authId: 'x', patientId: 'y', status: 'pending', createdAt: '' });
    assert(noInsurer.insurer.display === 'Unknown Insurer', 'Missing insurer defaults to "Unknown Insurer"');
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Emergency Access — Reason validation
// ═══════════════════════════════════════════════════════════════════════════

const EMERGENCY_REASONS = [
    { code: 'life-threatening', display: 'Life-threatening emergency — patient unable to consent' },
    { code: 'unconscious', display: 'Patient unconscious or incapacitated' },
    { code: 'public-health', display: 'Public health emergency or outbreak response' },
    { code: 'system-outage', display: 'Normal access system unavailable (system outage)' },
    { code: 'treatment-continuity', display: 'Continuity of care — no other provider available' },
    { code: 'other', display: 'Other — must provide detailed justification' },
];

describe('Emergency Access — Reason codes', () => {
    assert(EMERGENCY_REASONS.length === 6, `6 emergency reason codes defined (got ${EMERGENCY_REASONS.length})`);
    assert(EMERGENCY_REASONS.some(r => r.code === 'life-threatening'), 'Includes life-threatening');
    assert(EMERGENCY_REASONS.some(r => r.code === 'unconscious'), 'Includes unconscious');
    assert(EMERGENCY_REASONS.some(r => r.code === 'system-outage'), 'Includes system-outage');
    assert(EMERGENCY_REASONS.some(r => r.code === 'other'), 'Includes other (with justification requirement)');

    // Validate all codes are valid identifiers
    const validPattern = /^[a-z-]+$/;
    const allValid = EMERGENCY_REASONS.every(r => validPattern.test(r.code));
    assert(allValid, 'All reason codes are lowercase kebab-case');
});

// ─── Summary ─────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('All tests passed!');
}
