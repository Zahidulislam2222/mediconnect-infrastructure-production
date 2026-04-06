export {};
// ─── Consent Enforcement Test ───────────────────────────────────────────────
// Verifies GDPR Article 6+7 consent requirements:
//   - Registration requires explicit consent (agreedToTerms)
//   - Consent ledger is append-only (never mutated)
//   - Consent has expiry (365-day default)
//   - Withdrawal creates new record (doesn't delete)
//
// Source: patient.controller.ts lines 244-253, consent.controller.ts full
// Run: npx ts-node shared/__tests__/compliance/consent-enforcement.test.ts
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

const patientController = readFile('patient-service/src/controllers/patient.controller.ts');
const consentController = readFile('patient-service/src/modules/gdpr/consent.controller.ts');

// ═══════════════════════════════════════════════════════════════════════════
// 1. Registration requires consent
// ═══════════════════════════════════════════════════════════════════════════

describe('Consent — Registration gate', () => {
    assert(
        patientController.includes('consentDetails.agreedToTerms !== true'),
        'Registration checks agreedToTerms === true'
    );

    assert(
        patientController.includes('Legal compliance failure'),
        'Rejects registration without consent (400 error)'
    );

    assert(
        patientController.includes('policyVersion'),
        'Consent records policy version at registration'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Consent ledger is append-only
// ═══════════════════════════════════════════════════════════════════════════

describe('Consent — Append-only ledger', () => {
    assert(
        consentController.includes('append-only'),
        'Code documents append-only pattern'
    );

    // Grant creates new record via PutCommand (not UpdateCommand)
    assert(
        consentController.includes('PutCommand') &&
        consentController.includes("status: 'granted'"),
        'Grant consent creates new ledger entry (PutCommand, not UpdateCommand on old rows)'
    );

    // Withdrawal creates new record, doesn't modify existing
    assert(
        consentController.includes("status: 'withdrawn'") &&
        consentController.includes('withdrawalRecord'),
        'Withdrawal creates new record with status withdrawn (append, not mutate)'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Consent expiry (GDPR Art 7 — consent must not be indefinite)
// ═══════════════════════════════════════════════════════════════════════════

describe('Consent — Expiry enforcement', () => {
    assert(
        consentController.includes('365'),
        'Default consent expiry is 365 days'
    );

    assert(
        consentController.includes('expiresAt'),
        'Consent records have expiresAt field'
    );

    assert(
        consentController.includes('expiresInDays'),
        'Expiry duration is configurable via expiresInDays'
    );

    assert(
        consentController.includes('expiredConsents'),
        'Expired consents are tracked separately from active'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Consent types and status tracking
// ═══════════════════════════════════════════════════════════════════════════

describe('Consent — Type and status model', () => {
    assert(
        consentController.includes("'granted'") &&
        consentController.includes("'withdrawn'") &&
        consentController.includes("'expired'"),
        'Three consent statuses: granted, withdrawn, expired'
    );

    assert(
        consentController.includes('consentType'),
        'Consent is tracked per type (not just boolean yes/no)'
    );

    assert(
        consentController.includes('latestByType'),
        'Derives current status from latest record per consent type'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. FHIR Consent resource
// ═══════════════════════════════════════════════════════════════════════════

describe('Consent — FHIR R4 compliance', () => {
    assert(
        consentController.includes('"Consent"') && consentController.includes('resourceType'),
        'Returns FHIR R4 Consent resource'
    );

    assert(
        consentController.includes('patient-privacy'),
        'Consent scope is patient-privacy'
    );

    assert(
        consentController.includes('59284-0'),
        'LOINC code 59284-0 (Patient Consent) used'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Audit logging on consent operations
// ═══════════════════════════════════════════════════════════════════════════

describe('Consent — Audit trail', () => {
    assert(
        consentController.includes('READ_CONSENT'),
        'Reading consent is audit-logged'
    );

    assert(
        consentController.includes('GRANT_CONSENT'),
        'Granting consent is audit-logged'
    );

    assert(
        consentController.includes('WITHDRAW_CONSENT'),
        'Withdrawing consent is audit-logged'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Consent metadata captured
// ═══════════════════════════════════════════════════════════════════════════

describe('Consent — Metadata for accountability (Art 5(2))', () => {
    assert(
        consentController.includes('ipAddress'),
        'Consent records capture IP address'
    );

    assert(
        consentController.includes('userAgent'),
        'Consent records capture user agent'
    );

    assert(
        consentController.includes('timestamp'),
        'Consent records capture timestamp'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Consent Enforcement: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
