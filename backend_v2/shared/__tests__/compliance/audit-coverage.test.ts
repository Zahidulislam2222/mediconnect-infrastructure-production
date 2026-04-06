export {};
// ─── Audit Logging Coverage Test ────────────────────────────────────────────
// Verifies that every service handling PHI calls writeAuditLog.
// HIPAA requires: who accessed what, when, and what action was taken.
//
// Source: 67 files use writeAuditLog across all services
// Run: npx ts-node shared/__tests__/compliance/audit-coverage.test.ts
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

// ═══════════════════════════════════════════════════════════════════════════
// 1. Every service with PHI access imports writeAuditLog
// ═══════════════════════════════════════════════════════════════════════════

const PHI_SERVICES = [
    { file: 'patient-service/src/controllers/patient.controller.ts', name: 'patient-service' },
    { file: 'doctor-service/src/controllers/doctor.controller.ts', name: 'doctor-service' },
    { file: 'doctor-service/src/modules/clinical/prescription.controller.ts', name: 'prescription-controller' },
    { file: 'booking-service/src/controllers/booking.controller.ts', name: 'booking-service' },
    { file: 'booking-service/src/controllers/webhook.controller.ts', name: 'booking-webhook' },
    { file: 'communication-service/src/controllers/chat.controller.ts', name: 'chat-controller' },
    { file: 'communication-service/src/controllers/video.controller.ts', name: 'video-controller' },
    { file: 'communication-service/src/controllers/symptom.controller.ts', name: 'symptom-controller' },
    { file: 'staff-service/src/controllers/staff.controller.ts', name: 'staff-service' },
];

const PYTHON_PHI_SERVICES = [
    { file: 'admin-service/routers/users.py', name: 'admin-users' },
    { file: 'admin-service/routers/audit.py', name: 'admin-audit' },
    { file: 'admin-service/routers/closures.py', name: 'admin-closures' },
    { file: 'admin-service/routers/analytics.py', name: 'admin-analytics' },
    { file: 'admin-service/routers/system.py', name: 'admin-system' },
    { file: 'dicom-service/routers/dicomweb.py', name: 'dicom-web' },
    { file: 'dicom-service/routers/imaging.py', name: 'dicom-imaging' },
];

describe('Audit Coverage — Node.js services import writeAuditLog', () => {
    for (const svc of PHI_SERVICES) {
        const content = readFile(svc.file);
        assert(
            content.includes('writeAuditLog'),
            `${svc.name} calls writeAuditLog`
        );
    }
});

describe('Audit Coverage — Python services import write_audit_log', () => {
    for (const svc of PYTHON_PHI_SERVICES) {
        const content = readFile(svc.file);
        assert(
            content.includes('write_audit_log'),
            `${svc.name} calls write_audit_log`
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Audit log implementation — FHIR AuditEvent format
// ═══════════════════════════════════════════════════════════════════════════

const auditTs = readFile('shared/audit.ts');

describe('Audit Coverage — Implementation', () => {
    assert(
        auditTs.includes('AuditEvent'),
        'Audit logs follow FHIR AuditEvent format'
    );

    assert(
        auditTs.includes('ttl'),
        'Audit logs have TTL (7-year HIPAA retention)'
    );

    assert(
        auditTs.includes('checkForBreach'),
        'Audit triggers breach detection check'
    );

    assert(
        auditTs.includes('publishEvent') || auditTs.includes('EventType'),
        'Audit publishes to event bus'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Critical operations have specific audit action types
// ═══════════════════════════════════════════════════════════════════════════

const CRITICAL_AUDIT_ACTIONS = [
    { action: 'GDPR_CHAT_ERASURE', where: 'patient-service', desc: 'Chat history deletion' },
    { action: 'PRESCRIPTION_ALLERGY_BLOCK', where: 'prescription-controller', desc: 'Allergy-blocked prescription' },
    { action: 'PRESCRIPTION_CLASS_CONFLICT_BLOCK', where: 'prescription-controller', desc: 'Drug class conflict' },
    { action: 'EMERGENCY_ACCESS_GRANTED', where: 'emergency-access', desc: 'Break-glass override' },
    { action: 'EMERGENCY_ACCESS_DENIED', where: 'emergency-access', desc: 'Unauthorized break-glass attempt' },
    { action: 'EMERGENCY_ACCESS_REVOKED', where: 'emergency-access', desc: 'Override revocation' },
    { action: 'IDENTITY_VERIFIED', where: 'patient-service', desc: 'Biometric verification' },
    { action: 'READ_CONSENT', where: 'consent-controller', desc: 'Consent status viewed' },
    { action: 'GRANT_CONSENT', where: 'consent-controller', desc: 'Consent granted' },
    { action: 'WITHDRAW_CONSENT', where: 'consent-controller', desc: 'Consent withdrawn' },
];

describe('Audit Coverage — Critical action types exist', () => {
    const allCode = [
        readFile('patient-service/src/controllers/patient.controller.ts'),
        readFile('doctor-service/src/modules/clinical/prescription.controller.ts'),
        readFile('shared/emergency-access.ts'),
        readFile('patient-service/src/modules/gdpr/consent.controller.ts'),
    ].join('\n');

    for (const item of CRITICAL_AUDIT_ACTIONS) {
        assert(
            allCode.includes(item.action),
            `Action "${item.action}" logged (${item.desc})`
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Clinical modules in patient-service also audit
// ═══════════════════════════════════════════════════════════════════════════

const PATIENT_CLINICAL_MODULES = [
    'patient-service/src/modules/clinical/allergy.controller.ts',
    'patient-service/src/modules/clinical/immunization.controller.ts',
    'patient-service/src/modules/clinical/care-plan.controller.ts',
    'patient-service/src/modules/clinical/hl7.controller.ts',
    'patient-service/src/modules/clinical/bulk-export.controller.ts',
    'patient-service/src/modules/clinical/blue-button.controller.ts',
    'patient-service/src/modules/clinical/ecr.controller.ts',
    'patient-service/src/modules/clinical/sdoh.controller.ts',
    'patient-service/src/modules/clinical/mpi.controller.ts',
];

describe('Audit Coverage — Patient clinical modules', () => {
    for (const mod of PATIENT_CLINICAL_MODULES) {
        const content = readFile(mod);
        const modName = path.basename(mod, '.ts');
        assert(
            content.includes('writeAuditLog'),
            `${modName} calls writeAuditLog`
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Doctor clinical modules also audit
// ═══════════════════════════════════════════════════════════════════════════

const DOCTOR_CLINICAL_MODULES = [
    'doctor-service/src/modules/clinical/ehr.controller.ts',
    'doctor-service/src/modules/clinical/lab.controller.ts',
    'doctor-service/src/modules/clinical/referral.controller.ts',
    'doctor-service/src/modules/clinical/med-reconciliation.controller.ts',
    'doctor-service/src/modules/clinical/elr.controller.ts',
    'doctor-service/src/modules/clinical/imaging.controller.ts',
];

describe('Audit Coverage — Doctor clinical modules', () => {
    for (const mod of DOCTOR_CLINICAL_MODULES) {
        const content = readFile(mod);
        const modName = path.basename(mod, '.ts');
        assert(
            content.includes('writeAuditLog'),
            `${modName} calls writeAuditLog`
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Audit Coverage: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
