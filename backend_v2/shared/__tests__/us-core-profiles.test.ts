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
    assert(profiles.length >= 12, `Returns ${profiles.length} profiles (≥12 expected)`);
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
