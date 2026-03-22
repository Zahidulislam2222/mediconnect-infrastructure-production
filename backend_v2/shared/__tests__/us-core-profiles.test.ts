// ─── Gap #6 FIX: Unit tests for US Core FHIR validators ──────────────────
// Pure function tests — no AWS mocking needed.
// Run: npx tsx shared/__tests__/us-core-profiles.test.ts
// Or:  npx ts-node shared/__tests__/us-core-profiles.test.ts
// ──────────────────────────────────────────────────────────────────────────

import {
    validateUSCore,
    validateUSCorePatient,
    validateUSCoreAllergyIntolerance,
    validateUSCoreImmunization,
    validateUSCoreCarePlan,
    validateUSCoreGoal,
    validateUSCoreProcedure,
    validateUSCoreMedicationRequest,
    validateUSCoreDiagnosticReport,
    validateUSCoreOrganization,
    validateUSCoreMedication,
    validateUSCoreObservationVitals,
    validateUSCoreDocumentReference,
    validateUSCoreServiceRequest,
    validateUSCoreCoverage,
    getSupportedProfiles,
} from '../us-core-profiles';

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

// ─── Patient Validator ───────────────────────────────────────────────────

describe('validateUSCorePatient', () => {
    const validPatient = {
        resourceType: 'Patient',
        identifier: [{ system: 'urn:test', value: '123' }],
        name: [{ family: 'Smith', given: ['John'] }],
        gender: 'male',
        birthDate: '1990-01-01',
    };

    const result = validateUSCorePatient(validPatient);
    assert(result.valid === true, 'Valid patient passes validation');
    assert(result.errors.length === 0, 'No errors on valid patient');

    const noName = validateUSCorePatient({ ...validPatient, name: [] });
    assert(noName.valid === false, 'Missing name fails validation');

    const noGender = validateUSCorePatient({ ...validPatient, gender: undefined });
    assert(noGender.valid === false, 'Missing gender fails validation');

    const badGender = validateUSCorePatient({ ...validPatient, gender: 'invalid' });
    assert(badGender.valid === false, 'Invalid gender value fails');

    const noIdentifier = validateUSCorePatient({ ...validPatient, identifier: [] });
    assert(noIdentifier.valid === false, 'Empty identifier array fails');
});

// ─── AllergyIntolerance Validator ────────────────────────────────────────

describe('validateUSCoreAllergyIntolerance', () => {
    const validAllergy = {
        resourceType: 'AllergyIntolerance',
        clinicalStatus: { coding: [{ code: 'active' }] },
        verificationStatus: { coding: [{ code: 'confirmed' }] },
        code: { coding: [{ display: 'Penicillin' }] },
        patient: { reference: 'Patient/123' },
    };

    const result = validateUSCoreAllergyIntolerance(validAllergy);
    assert(result.valid === true, 'Valid allergy passes validation');

    const noCode = validateUSCoreAllergyIntolerance({ ...validAllergy, code: undefined });
    assert(noCode.valid === false, 'Missing code fails');

    const noPatient = validateUSCoreAllergyIntolerance({ ...validAllergy, patient: {} });
    assert(noPatient.valid === false, 'Missing patient reference fails');
});

// ─── Immunization Validator ──────────────────────────────────────────────

describe('validateUSCoreImmunization', () => {
    const validImm = {
        resourceType: 'Immunization',
        status: 'completed',
        vaccineCode: { coding: [{ system: 'http://hl7.org/fhir/sid/cvx', code: '207', display: 'COVID-19' }] },
        patient: { reference: 'Patient/123' },
        occurrenceDateTime: '2024-01-15',
    };

    const result = validateUSCoreImmunization(validImm);
    assert(result.valid === true, 'Valid immunization passes');

    const noStatus = validateUSCoreImmunization({ ...validImm, status: undefined });
    assert(noStatus.valid === false, 'Missing status fails');

    const noVaccine = validateUSCoreImmunization({ ...validImm, vaccineCode: undefined });
    assert(noVaccine.valid === false, 'Missing vaccineCode fails');
});

// ─── CarePlan Validator ──────────────────────────────────────────────────

describe('validateUSCoreCarePlan', () => {
    const validPlan = {
        resourceType: 'CarePlan',
        status: 'active',
        intent: 'plan',
        category: [{ coding: [{ code: 'assess-plan' }] }],
        subject: { reference: 'Patient/123' },
        title: 'Diabetes Management',
    };

    const result = validateUSCoreCarePlan(validPlan);
    assert(result.valid === true, 'Valid CarePlan passes');

    const noStatus = validateUSCoreCarePlan({ ...validPlan, status: undefined });
    assert(noStatus.valid === false, 'Missing status fails');

    const noIntent = validateUSCoreCarePlan({ ...validPlan, intent: undefined });
    assert(noIntent.valid === false, 'Missing intent fails');

    const noSubject = validateUSCoreCarePlan({ ...validPlan, subject: {} });
    assert(noSubject.valid === false, 'Missing subject reference fails');
});

// ─── Goal Validator ──────────────────────────────────────────────────────

describe('validateUSCoreGoal', () => {
    const validGoal = {
        resourceType: 'Goal',
        lifecycleStatus: 'active',
        description: { text: 'Reduce food insecurity risk' },
        subject: { reference: 'Patient/123' },
        target: [{ detailString: 'Score < 2' }],
    };

    const result = validateUSCoreGoal(validGoal);
    assert(result.valid === true, 'Valid Goal passes');

    const noLifecycle = validateUSCoreGoal({ ...validGoal, lifecycleStatus: undefined });
    assert(noLifecycle.valid === false, 'Missing lifecycleStatus fails');

    const noDesc = validateUSCoreGoal({ ...validGoal, description: {} });
    assert(noDesc.valid === false, 'Missing description fails');
});

// ─── Organization Validator ─────────────────────────────────────────────

describe('validateUSCoreOrganization', () => {
    const validOrg = {
        resourceType: 'Organization',
        name: 'General Hospital',
        active: true,
        identifier: [{ system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567890' }],
    };

    const result = validateUSCoreOrganization(validOrg);
    assert(result.valid === true, 'Valid Organization passes validation');
    assert(result.errors.length === 0, 'No errors on valid Organization');

    const noName = validateUSCoreOrganization({ ...validOrg, name: undefined });
    assert(noName.valid === false, 'Missing name fails');

    const noActive = validateUSCoreOrganization({ ...validOrg, active: undefined });
    assert(noActive.valid === false, 'Missing active fails');

    const badActive = validateUSCoreOrganization({ ...validOrg, active: 'yes' as any });
    assert(badActive.valid === false, 'Non-boolean active fails');

    const noIdentifier = validateUSCoreOrganization({ ...validOrg, identifier: [] });
    assert(noIdentifier.valid === false, 'Empty identifier array fails');

    const badIdentifier = validateUSCoreOrganization({ ...validOrg, identifier: [{ system: 'urn:test' }] });
    assert(badIdentifier.valid === false, 'Identifier without value fails');

    const wrongType = validateUSCoreOrganization({ resourceType: 'Patient' });
    assert(wrongType.valid === false, 'Wrong resourceType fails');
});

// ─── Medication Validator ───────────────────────────────────────────────

describe('validateUSCoreMedication', () => {
    const validMed = {
        resourceType: 'Medication',
        code: { coding: [{ system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '1049502', display: 'Acetaminophen' }] },
        status: 'active',
    };

    const result = validateUSCoreMedication(validMed);
    assert(result.valid === true, 'Valid Medication passes validation');
    assert(result.errors.length === 0, 'No errors on valid Medication');

    const noCode = validateUSCoreMedication({ ...validMed, code: undefined });
    assert(noCode.valid === false, 'Missing code fails');

    const noCoding = validateUSCoreMedication({ ...validMed, code: { text: 'Aspirin' } });
    assert(noCoding.valid === false, 'Code without coding array fails');

    const emptyCoding = validateUSCoreMedication({ ...validMed, code: { coding: [] } });
    assert(emptyCoding.valid === false, 'Empty coding array fails');

    const badCoding = validateUSCoreMedication({ ...validMed, code: { coding: [{ display: 'test' }] } });
    assert(badCoding.valid === false, 'Coding without system+code fails');

    const wrongType = validateUSCoreMedication({ resourceType: 'Patient' });
    assert(wrongType.valid === false, 'Wrong resourceType fails');
});

// ─── Observation Vitals Validator ───────────────────────────────────────

describe('validateUSCoreObservationVitals', () => {
    const validVitals = {
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
        code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure' }] },
        subject: { reference: 'Patient/123' },
        effectiveDateTime: '2024-06-15T10:30:00Z',
        valueQuantity: { value: 120, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
    };

    const result = validateUSCoreObservationVitals(validVitals);
    assert(result.valid === true, 'Valid vital signs passes validation');
    assert(result.errors.length === 0, 'No errors on valid vital signs');

    const noStatus = validateUSCoreObservationVitals({ ...validVitals, status: undefined });
    assert(noStatus.valid === false, 'Missing status fails');

    const noCategory = validateUSCoreObservationVitals({ ...validVitals, category: [] });
    assert(noCategory.valid === false, 'Empty category fails');

    const wrongCategory = validateUSCoreObservationVitals({
        ...validVitals,
        category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    });
    assert(wrongCategory.valid === false, 'Non-vital-signs category fails');

    const noSubject = validateUSCoreObservationVitals({ ...validVitals, subject: {} });
    assert(noSubject.valid === false, 'Missing subject reference fails');

    const noEffective = validateUSCoreObservationVitals({ ...validVitals, effectiveDateTime: undefined });
    assert(noEffective.valid === false, 'Missing effective[x] fails');

    const withPeriod = validateUSCoreObservationVitals({ ...validVitals, effectiveDateTime: undefined, effectivePeriod: { start: '2024-01-01' } });
    assert(withPeriod.valid === true, 'effectivePeriod accepted as alternative');

    const wrongType = validateUSCoreObservationVitals({ resourceType: 'Patient' });
    assert(wrongType.valid === false, 'Wrong resourceType fails');
});

// ─── DocumentReference Validator ────────────────────────────────────────

describe('validateUSCoreDocumentReference', () => {
    const validDoc = {
        resourceType: 'DocumentReference',
        status: 'current',
        type: { coding: [{ system: 'http://loinc.org', code: '34133-9', display: 'Summary of episode note' }] },
        category: [{ coding: [{ code: 'clinical-note' }] }],
        subject: { reference: 'Patient/123' },
        date: '2024-06-15T10:30:00Z',
        content: [{ attachment: { contentType: 'application/pdf', url: 'https://example.com/doc.pdf' } }],
    };

    const result = validateUSCoreDocumentReference(validDoc);
    assert(result.valid === true, 'Valid DocumentReference passes validation');
    assert(result.errors.length === 0, 'No errors on valid DocumentReference');

    const noStatus = validateUSCoreDocumentReference({ ...validDoc, status: undefined });
    assert(noStatus.valid === false, 'Missing status fails');

    const noType = validateUSCoreDocumentReference({ ...validDoc, type: undefined });
    assert(noType.valid === false, 'Missing type fails');

    const noCategory = validateUSCoreDocumentReference({ ...validDoc, category: [] });
    assert(noCategory.valid === false, 'Empty category fails');

    const noSubject = validateUSCoreDocumentReference({ ...validDoc, subject: {} });
    assert(noSubject.valid === false, 'Missing subject reference fails');

    const noDate = validateUSCoreDocumentReference({ ...validDoc, date: undefined });
    assert(noDate.valid === false, 'Missing date fails');

    const noContent = validateUSCoreDocumentReference({ ...validDoc, content: [] });
    assert(noContent.valid === false, 'Empty content fails');

    const badContent = validateUSCoreDocumentReference({ ...validDoc, content: [{ attachment: {} }] });
    assert(badContent.valid === false, 'Content without contentType fails');

    const wrongType = validateUSCoreDocumentReference({ resourceType: 'Patient' });
    assert(wrongType.valid === false, 'Wrong resourceType fails');
});

// ─── ServiceRequest Validator ───────────────────────────────────────────

describe('validateUSCoreServiceRequest', () => {
    const validReq = {
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: { coding: [{ system: 'http://snomed.info/sct', code: '306206005', display: 'Referral to cardiology' }] },
        subject: { reference: 'Patient/123' },
        authoredOn: '2024-06-15',
    };

    const result = validateUSCoreServiceRequest(validReq);
    assert(result.valid === true, 'Valid ServiceRequest passes validation');
    assert(result.errors.length === 0, 'No errors on valid ServiceRequest');

    const noStatus = validateUSCoreServiceRequest({ ...validReq, status: undefined });
    assert(noStatus.valid === false, 'Missing status fails');

    const noIntent = validateUSCoreServiceRequest({ ...validReq, intent: undefined });
    assert(noIntent.valid === false, 'Missing intent fails');

    const noCode = validateUSCoreServiceRequest({ ...validReq, code: undefined });
    assert(noCode.valid === false, 'Missing code fails');

    const noSubject = validateUSCoreServiceRequest({ ...validReq, subject: {} });
    assert(noSubject.valid === false, 'Missing subject reference fails');

    const noAuthoredOn = validateUSCoreServiceRequest({ ...validReq, authoredOn: undefined });
    assert(noAuthoredOn.valid === false, 'Missing authoredOn fails');

    const wrongType = validateUSCoreServiceRequest({ resourceType: 'Patient' });
    assert(wrongType.valid === false, 'Wrong resourceType fails');
});

// ─── Coverage Validator ─────────────────────────────────────────────────

describe('validateUSCoreCoverage', () => {
    const validCoverage = {
        resourceType: 'Coverage',
        status: 'active',
        beneficiary: { reference: 'Patient/123' },
        payor: [{ reference: 'Organization/ins-456' }],
        subscriberId: 'SUB-789',
    };

    const result = validateUSCoreCoverage(validCoverage);
    assert(result.valid === true, 'Valid Coverage passes validation');
    assert(result.errors.length === 0, 'No errors on valid Coverage');

    const noStatus = validateUSCoreCoverage({ ...validCoverage, status: undefined });
    assert(noStatus.valid === false, 'Missing status fails');

    const noBeneficiary = validateUSCoreCoverage({ ...validCoverage, beneficiary: {} });
    assert(noBeneficiary.valid === false, 'Missing beneficiary reference fails');

    const noPayor = validateUSCoreCoverage({ ...validCoverage, payor: [] });
    assert(noPayor.valid === false, 'Empty payor array fails');

    const noPayorArray = validateUSCoreCoverage({ ...validCoverage, payor: undefined });
    assert(noPayorArray.valid === false, 'Missing payor fails');

    const wrongType = validateUSCoreCoverage({ resourceType: 'Patient' });
    assert(wrongType.valid === false, 'Wrong resourceType fails');
});

// ─── Generic Dispatcher ─────────────────────────────────────────────────

describe('validateUSCore (dispatcher)', () => {
    const result1 = validateUSCore(null);
    assert(result1.valid === false, 'Null resource fails');

    const result2 = validateUSCore({ resourceType: 'UnknownType' });
    assert(result2.valid === true, 'Unknown resource type passes with warning');
    assert(result2.warnings.length > 0, 'Unknown type produces warning');

    const validPatient = {
        resourceType: 'Patient',
        identifier: [{ system: 'urn:test', value: '1' }],
        name: [{ family: 'Doe' }],
        gender: 'female',
    };
    const result3 = validateUSCore(validPatient);
    assert(result3.valid === true, 'Dispatcher routes Patient correctly');
});

// ─── getSupportedProfiles ────────────────────────────────────────────────

describe('getSupportedProfiles', () => {
    const profiles = getSupportedProfiles();
    assert(profiles.length >= 18, `Returns ${profiles.length} profiles (≥18 expected)`);
    assert(profiles.some(p => p.resourceType === 'CarePlan'), 'Includes CarePlan profile');
    assert(profiles.some(p => p.resourceType === 'Goal'), 'Includes Goal profile');
    assert(profiles.some(p => p.resourceType === 'Patient'), 'Includes Patient profile');
});

// ─── Summary ─────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('All tests passed!');
}
