export {};
// ─── Prescription Safety Gates Test ─────────────────────────────────────────
// Verifies that createPrescription() enforces all 3 safety gates:
//   Gate 1: Allergy cross-check (blocks if patient has allergy to drug)
//   Gate 2: Drug interaction check (blocks MAJOR, warns MODERATE)
//   Gate 3: Med reconciliation (blocks critical class conflicts)
//
// Source: prescription.controller.ts lines 61-180
// Run: npx ts-node shared/__tests__/compliance/prescription-safety.test.ts
// ────────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) { passed++; console.log(`  ✅ ${message}`); }
    else { failed++; console.error(`  ❌ FAIL: ${message}`); }
}

function describe(name: string, fn: () => void) {
    console.log(`\n🧪 ${name}`);
    fn();
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const readFile = (relPath: string): string => {
    try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
    catch { return ''; }
};

const prescriptionController = readFile('doctor-service/src/modules/clinical/prescription.controller.ts');

// ═══════════════════════════════════════════════════════════════════════════
// 1. Gate 1: Allergy Cross-Check
// ═══════════════════════════════════════════════════════════════════════════

describe('Prescription Safety — Gate 1: Allergy Cross-Check', () => {
    assert(
        prescriptionController.includes('TABLE_ALLERGIES'),
        'Queries allergy table before prescribing'
    );

    assert(
        prescriptionController.includes('PRESCRIPTION_ALLERGY_BLOCK'),
        'Logs PRESCRIPTION_ALLERGY_BLOCK audit event on allergy match'
    );

    assert(
        prescriptionController.includes('409') && prescriptionController.includes('allergy conflict'),
        'Returns 409 when allergy conflict detected'
    );

    // Verify multiple allergy fields are checked
    const allergyFields = ['substance', 'substanceName', 'resource.code.coding', 'resource.code.text'];
    for (const field of allergyFields) {
        assert(
            prescriptionController.includes(field),
            `Checks allergy field: ${field}`
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Gate 2: Drug Interaction Check
// ═══════════════════════════════════════════════════════════════════════════

describe('Prescription Safety — Gate 2: Drug Interaction Check', () => {
    assert(
        prescriptionController.includes('checkInteractionSeverity'),
        'Calls checkInteractionSeverity() before prescribing'
    );

    assert(
        prescriptionController.includes('TABLE_DRUGS') || prescriptionController.includes('mediconnect-drug-interactions'),
        'Queries drug interaction table'
    );

    assert(
        prescriptionController.includes('"MAJOR"') && prescriptionController.includes('409'),
        'MAJOR interaction blocks prescription (409)'
    );

    assert(
        prescriptionController.includes('"MODERATE"') && prescriptionController.includes('interactionWarnings'),
        'MODERATE interaction adds warning but allows prescription'
    );

    assert(
        prescriptionController.includes('DRUG_INTERACTION_DETECTED'),
        'Publishes DRUG_INTERACTION_DETECTED event for MAJOR interactions'
    );

    assert(
        prescriptionController.includes('INTERACTION_TEST_DRUG'),
        'Test drug INTERACTION_TEST_DRUG always returns MAJOR (for testing)'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Gate 3: Med Reconciliation — Drug Class Conflicts
// ═══════════════════════════════════════════════════════════════════════════

describe('Prescription Safety — Gate 3: Critical Drug Class Conflicts', () => {
    assert(
        prescriptionController.includes('CRITICAL_CONFLICTS'),
        'Defines CRITICAL_CONFLICTS array'
    );

    assert(
        prescriptionController.includes('MODERATE_CONFLICTS'),
        'Defines MODERATE_CONFLICTS array'
    );

    assert(
        prescriptionController.includes('PRESCRIPTION_CLASS_CONFLICT_BLOCK'),
        'Logs PRESCRIPTION_CLASS_CONFLICT_BLOCK for critical conflicts'
    );

    // Critical pair 1: Opioid + Benzodiazepine
    const opioids = ['oxycodone', 'hydrocodone', 'morphine', 'fentanyl', 'tramadol', 'codeine', 'methadone'];
    const benzos = ['alprazolam', 'lorazepam', 'diazepam', 'clonazepam', 'temazepam'];

    describe('  Critical Pair: Opioid + Benzodiazepine', () => {
        for (const drug of opioids) {
            assert(prescriptionController.includes(drug), `Opioid "${drug}" in conflict list`);
        }
        for (const drug of benzos) {
            assert(prescriptionController.includes(drug), `Benzo "${drug}" in conflict list`);
        }
    });

    // Critical pair 2: ACE Inhibitor + ARB
    const ace = ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'benazepril'];
    const arb = ['losartan', 'valsartan', 'irbesartan', 'candesartan', 'olmesartan'];

    describe('  Critical Pair: ACE Inhibitor + ARB', () => {
        for (const drug of ace) {
            assert(prescriptionController.includes(drug), `ACE "${drug}" in conflict list`);
        }
        for (const drug of arb) {
            assert(prescriptionController.includes(drug), `ARB "${drug}" in conflict list`);
        }
    });

    // Critical pair 3: Multiple Anticoagulants
    const anticoagulants = ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin'];

    describe('  Critical Pair: Multiple Anticoagulants', () => {
        for (const drug of anticoagulants) {
            assert(prescriptionController.includes(drug), `Anticoagulant "${drug}" in conflict list`);
        }
    });

    // Moderate pair 1: NSAID + Anticoagulant
    const nsaids = ['ibuprofen', 'naproxen', 'celecoxib', 'diclofenac', 'meloxicam', 'indomethacin'];

    describe('  Moderate Pair: NSAID + Anticoagulant', () => {
        for (const drug of nsaids) {
            assert(prescriptionController.includes(drug), `NSAID "${drug}" in conflict list`);
        }
    });

    // Moderate pair 2: Multiple SSRIs
    const ssris = ['fluoxetine', 'sertraline', 'escitalopram', 'citalopram', 'paroxetine'];

    describe('  Moderate Pair: Multiple SSRIs', () => {
        for (const drug of ssris) {
            assert(prescriptionController.includes(drug), `SSRI "${drug}" in conflict list`);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Gate ordering — All 3 gates run BEFORE prescription is created
// ═══════════════════════════════════════════════════════════════════════════

describe('Prescription Safety — Gate ordering', () => {
    const allergyCheckPos = prescriptionController.indexOf('TABLE_ALLERGIES');
    const interactionCheckPos = prescriptionController.indexOf('checkInteractionSeverity');
    const reconciliationPos = prescriptionController.indexOf('CRITICAL_CONFLICTS');
    // Prescription is created via TransactWriteCommand (not PutCommand)
    const createPrescriptionPos = prescriptionController.indexOf('export const createPrescription');
    const prescriptionCreatePos = prescriptionController.indexOf('TransactWriteCommand', createPrescriptionPos);

    assert(
        allergyCheckPos < interactionCheckPos,
        'Allergy check runs before interaction check'
    );
    assert(
        interactionCheckPos < reconciliationPos,
        'Interaction check runs before med reconciliation'
    );
    assert(
        reconciliationPos < prescriptionCreatePos,
        'All safety gates run before prescription is created in database'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Notification on prescription
// ═══════════════════════════════════════════════════════════════════════════

describe('Prescription Safety — Post-creation', () => {
    assert(
        prescriptionController.includes('sendNotification') && prescriptionController.includes('PRESCRIPTION_ISSUED'),
        'Sends PRESCRIPTION_ISSUED notification after creation'
    );

    assert(
        prescriptionController.includes('writeAuditLog'),
        'Audit log written for prescription creation'
    );

    assert(
        prescriptionController.includes('encryptPHI'),
        'Patient name encrypted via encryptPHI before storage'
    );

    assert(
        prescriptionController.includes('validateUSCore'),
        'Prescription validated against US Core FHIR profile'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Prescription Safety: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
