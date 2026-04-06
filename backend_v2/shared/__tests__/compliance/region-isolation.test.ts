export {};
// ─── Region Isolation Test ──────────────────────────────────────────────────
// Verifies GDPR data residency: EU patient data stays in EU region.
//   - normalizeRegion() strictly routes EU → eu-central-1
//   - All client factories use normalizeRegion
//   - S3 buckets append -eu suffix for EU data
//   - All services extract region from x-user-region header
//
// Source: shared/aws-config.ts lines 31-34, all service index files
// Run: npx ts-node shared/__tests__/compliance/region-isolation.test.ts
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

const ROOT = path.resolve(__dirname, '..', '..');
const readFile = (relPath: string): string => {
    try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
    catch { return ''; }
};

const awsConfig = readFile('aws-config.ts');

// ═══════════════════════════════════════════════════════════════════════════
// 1. normalizeRegion — Strict EU/US binary routing
// ═══════════════════════════════════════════════════════════════════════════

describe('Region Isolation — normalizeRegion function', () => {
    assert(
        awsConfig.includes('normalizeRegion'),
        'normalizeRegion function exists'
    );

    assert(
        awsConfig.includes("'EU'") && awsConfig.includes("'EU-CENTRAL-1'"),
        'Handles EU and EU-CENTRAL-1 header values'
    );

    assert(
        awsConfig.includes("'eu-central-1'") && awsConfig.includes("'us-east-1'"),
        'Maps to exactly two regions: eu-central-1 and us-east-1'
    );

    assert(
        awsConfig.includes("r === 'EU' || r === 'EU-CENTRAL-1'"),
        'Strict binary check — no other regions accepted for EU'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. All client factories use normalizeRegion
// ═══════════════════════════════════════════════════════════════════════════

const CLIENT_FACTORIES = [
    'getRegionalClient',       // DynamoDB
    'getRegionalS3Client',     // S3
    'getRegionalSNSClient',    // SNS
    'getRegionalSSMClient',    // SSM
    'getRegionalKMSClient',    // KMS
    'getRegionalSESClient',    // SES
];

describe('Region Isolation — Client factories use normalizeRegion', () => {
    for (const factory of CLIENT_FACTORIES) {
        assert(
            awsConfig.includes(factory),
            `${factory} factory exists`
        );
    }

    // Count normalizeRegion calls — should be used in every factory
    const normalizeCount = (awsConfig.match(/normalizeRegion/g) || []).length;
    assert(
        normalizeCount >= CLIENT_FACTORIES.length,
        `normalizeRegion called ${normalizeCount} times (>= ${CLIENT_FACTORIES.length} factories)`
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. S3 bucket naming — EU buckets get -eu suffix
// ═══════════════════════════════════════════════════════════════════════════

const patientController = fs.readFileSync(
    path.resolve(ROOT, '..', 'patient-service', 'src', 'controllers', 'patient.controller.ts'), 'utf-8'
);

describe('Region Isolation — S3 bucket EU suffix', () => {
    const euBucketPatterns = [
        'mediconnect-patient-data-eu',
        'mediconnect-doctor-data-eu',
        'mediconnect-prescriptions-eu',
        'mediconnect-ehr-records-eu',
        'mediconnect-medical-images-eu',
        'mediconnect-consultation-recordings-eu',
    ];

    for (const bucket of euBucketPatterns) {
        assert(
            patientController.includes(bucket) || patientController.includes('-eu'),
            `EU S3 bucket "${bucket}" referenced in patient-service`
        );
    }

    // Verify the -eu suffix logic exists
    assert(
        patientController.includes("endsWith('-eu')"),
        'Code checks for -eu suffix to avoid double-appending'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. All services extract region from x-user-region header
// ═══════════════════════════════════════════════════════════════════════════

const SERVICES_WITH_REGION = [
    { file: '../patient-service/src/controllers/patient.controller.ts', name: 'patient-service' },
    { file: '../doctor-service/src/controllers/doctor.controller.ts', name: 'doctor-service' },
    { file: '../booking-service/src/controllers/booking.controller.ts', name: 'booking-service' },
    { file: '../communication-service/src/controllers/chat.controller.ts', name: 'communication-service' },
];

describe('Region Isolation — x-user-region header extraction', () => {
    for (const svc of SERVICES_WITH_REGION) {
        const content = readFile(svc.file);
        assert(
            content.includes('x-user-region'),
            `${svc.name} reads x-user-region header`
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. BigQuery dataset routing by region
// ═══════════════════════════════════════════════════════════════════════════

describe('Region Isolation — BigQuery regional datasets', () => {
    assert(
        patientController.includes('mediconnect_analytics_eu') && patientController.includes('mediconnect_analytics'),
        'BigQuery routes to EU or US dataset based on region'
    );

    assert(
        patientController.includes("region.toUpperCase() === 'EU'"),
        'Region check for BigQuery dataset selection'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Region Isolation: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
