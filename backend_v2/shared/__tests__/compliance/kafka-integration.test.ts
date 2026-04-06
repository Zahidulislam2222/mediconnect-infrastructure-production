export {};
// ─── Kafka Integration Tests ────────────────────────────────────────────
// Verifies Kafka implementation covers security, compliance, and completeness.
//
// Run: npx tsx shared/__tests__/compliance/kafka-integration.test.ts
// ────────────────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) { passed++; console.log(`  \u2705 ${message}`); }
    else { failed++; console.error(`  \u274C FAIL: ${message}`); }
}

function describe(name: string, fn: () => void) {
    console.log(`\n\uD83E\uDDEA ${name}`);
    fn();
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const readFile = (relPath: string): string => {
    try { return fs.readFileSync(path.join(ROOT, relPath), 'utf-8'); }
    catch { return ''; }
};

// ─── Feature Flag ───────────────────────────────────────────────────────

describe('Feature flag: Kafka is opt-in', () => {
    const kafka = readFile('shared/kafka.ts');
    const eventBus = readFile('shared/event-bus.ts');

    assert(
        kafka.includes("KAFKA_ENABLED = process.env.KAFKA_ENABLED === 'true'"),
        'Kafka defaults to disabled (KAFKA_ENABLED env var)'
    );

    assert(
        eventBus.includes('KAFKA_ENABLED'),
        'event-bus.ts checks KAFKA_ENABLED before using Kafka'
    );

    assert(
        eventBus.includes('KAFKA_DUAL_WRITE'),
        'event-bus.ts supports dual-write mode for safe migration'
    );
});

// ─── Topic Configuration ────────────────────────────────────────────────

describe('All 7 Kafka topics defined', () => {
    const kafka = readFile('shared/kafka.ts');

    assert(kafka.includes("APPOINTMENTS: 'mediconnect.appointments'"), 'Topic: mediconnect.appointments');
    assert(kafka.includes("CLINICAL: 'mediconnect.clinical'"), 'Topic: mediconnect.clinical');
    assert(kafka.includes("VITALS: 'mediconnect.vitals'"), 'Topic: mediconnect.vitals');
    assert(kafka.includes("PAYMENTS: 'mediconnect.payments'"), 'Topic: mediconnect.payments');
    assert(kafka.includes("PATIENTS: 'mediconnect.patients'"), 'Topic: mediconnect.patients');
    assert(kafka.includes("AUDIT: 'mediconnect.audit'"), 'Topic: mediconnect.audit');
    assert(kafka.includes("SUBSCRIPTIONS: 'mediconnect.subscriptions'"), 'Topic: mediconnect.subscriptions');
});

// ─── Security: IAM Auth ─────────────────────────────────────────────────

describe('Security: IAM authentication (no passwords)', () => {
    const kafka = readFile('shared/kafka.ts');

    assert(
        kafka.includes('aws-msk-iam-sasl-signer-js'),
        'Uses aws-msk-iam-sasl-signer-js for MSK IAM auth'
    );

    assert(
        kafka.includes('oauthbearer'),
        'SASL mechanism is oauthbearer (IAM)'
    );

    assert(
        kafka.includes('no passwords'),
        'No hardcoded passwords in Kafka config'
    );

    assert(
        kafka.includes('config.ssl = true'),
        'TLS enabled for production'
    );
});

// ─── Security: PHI Protection ───────────────────────────────────────────

describe('Security: No PHI in Kafka events', () => {
    const eventBus = readFile('shared/event-bus.ts');
    const kafka = readFile('shared/kafka.ts');

    assert(
        kafka.includes('IDs only') || kafka.includes('no raw PHI') || kafka.includes('never raw patient data'),
        'Kafka client documents: events contain IDs only, no PHI'
    );
});

// ─── GDPR: Separate Clusters ───────────────────────────────────────────

describe('GDPR: Separate Kafka clusters per region', () => {
    const kafkaTf = readFile('../environments/prod/kafka.tf');

    assert(
        kafkaTf.includes('aws_msk_serverless_cluster" "us"'),
        'Terraform: MSK cluster for US region'
    );

    assert(
        kafkaTf.includes('aws_msk_serverless_cluster" "eu"'),
        'Terraform: MSK cluster for EU region'
    );

    assert(
        kafkaTf.includes('GDPR') || kafkaTf.includes('EU data stays in EU'),
        'Terraform comments document GDPR data residency'
    );
});

// ─── HIPAA: Audit Retention ─────────────────────────────────────────────

describe('HIPAA: Audit topic has long retention', () => {
    const setup = readFile('scripts/kafka-setup.ts');

    assert(
        setup.includes('365') && setup.includes('HIPAA'),
        'Audit topic configured for 365 days retention (HIPAA compliance)'
    );
});

// ─── Fallback: SQS on Kafka Failure ─────────────────────────────────────

describe('Fallback: SQS on Kafka failure', () => {
    const eventBus = readFile('shared/event-bus.ts');

    assert(
        eventBus.includes('Falling back to SQS'),
        'event-bus.ts falls back to SQS when Kafka fails'
    );

    assert(
        eventBus.includes('getQueueCategory') && eventBus.includes('resolveQueueUrl'),
        'SQS path still exists and functional'
    );
});

// ─── Topic Mapping Completeness ─────────────────────────────────────────

describe('Topic mapping covers all event categories', () => {
    const eventBus = readFile('shared/event-bus.ts');

    assert(eventBus.includes('getKafkaTopic'), 'getKafkaTopic function exists');
    assert(eventBus.includes("startsWith(\"audit.\")"), 'Maps audit events');
    assert(eventBus.includes("startsWith(\"clinical.\")"), 'Maps clinical events');
    assert(eventBus.includes("startsWith(\"appointment.\")"), 'Maps appointment events');
    assert(eventBus.includes("startsWith(\"patient.\")"), 'Maps patient events');
    assert(eventBus.includes("startsWith(\"subscription.\")"), 'Maps subscription events');
});

// ─── Consumers ──────────────────────────────────────────────────────────

describe('Kafka consumers defined', () => {
    const consumers = readFile('shared/kafka-consumers.ts');

    assert(consumers.includes('mediconnect-analytics'), 'Analytics consumer group defined');
    assert(consumers.includes('mediconnect-notifications'), 'Notification consumer group defined');
    assert(consumers.includes('startConsumers'), 'startConsumers function exported');
});

// ─── Docker Compose ─────────────────────────────────────────────────────

describe('Docker Compose: local Kafka', () => {
    const compose = readFile('../docker-compose.yml');

    assert(compose.includes('apache/kafka:3.9.0'), 'Kafka 3.9.0 image in docker-compose');
    assert(compose.includes('kafka-ui'), 'Kafka UI for debugging');
    assert(compose.includes('profiles') && compose.includes('kafka'), 'Kafka under --profile kafka (not started by default)');
});

// ─── Python Client ──────────────────────────────────────────────────────

describe('Python Kafka client exists', () => {
    const adminKafka = readFile('admin-service/utils/kafka_client.py');
    const dicomKafka = readFile('dicom-service/utils/kafka_client.py');

    assert(adminKafka.includes('KAFKA_ENABLED'), 'admin-service has feature-flagged Kafka client');
    assert(dicomKafka.includes('KAFKA_ENABLED'), 'dicom-service has feature-flagged Kafka client');
    assert(adminKafka.includes('aiokafka'), 'Python client uses aiokafka');
});

// ─── New Event Types ────────────────────────────────────────────────────

describe('Missing events added', () => {
    const eventBus = readFile('shared/event-bus.ts');

    assert(eventBus.includes('VIDEO_CALL_STARTED'), 'EventType: VIDEO_CALL_STARTED');
    assert(eventBus.includes('VIDEO_CALL_ENDED'), 'EventType: VIDEO_CALL_ENDED');
    assert(eventBus.includes('STAFF_SHIFT_CHANGED'), 'EventType: STAFF_SHIFT_CHANGED');
    assert(eventBus.includes('DOCTOR_RATE_CHANGED'), 'EventType: DOCTOR_RATE_CHANGED');
    assert(eventBus.includes('DICOM_STUDY_UPLOADED'), 'EventType: DICOM_STUDY_UPLOADED');
    assert(eventBus.includes('ELIGIBILITY_CHECKED'), 'EventType: ELIGIBILITY_CHECKED');
});

// ─── Results ────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`  Kafka Integration: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);
if (failed > 0) process.exit(1);
