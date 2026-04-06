/**
 * Kafka Client — Shared producer/consumer factory
 *
 * Production: AWS MSK Serverless with IAM auth + TLS 1.2
 * Local dev:  Plain Kafka on localhost:9092 (Docker)
 *
 * Feature flag: KAFKA_ENABLED (default: false → SQS only)
 *
 * Security:
 *   - IAM auth: aws-msk-iam-sasl-signer-js (no passwords)
 *   - TLS enforced in production (cannot disable on MSK Serverless)
 *   - PHI: Events contain IDs only, never raw patient data
 */

import { Kafka, Producer, Consumer, logLevel, SASLOptions } from 'kafkajs';
import { safeLog, safeError } from './logger';

// ─── Configuration ──────────────────────────────────────────────────────

export const KAFKA_ENABLED = process.env.KAFKA_ENABLED === 'true';
export const KAFKA_DUAL_WRITE = process.env.KAFKA_DUAL_WRITE === 'true';

const isProduction = process.env.NODE_ENV === 'production';
const LOCAL_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';

const normalizeRegion = (region: string = 'us-east-1'): string => {
    const r = region?.toUpperCase();
    return (r === 'EU' || r === 'EU-CENTRAL-1') ? 'eu-central-1' : 'us-east-1';
};

// ─── MSK IAM Auth (Production Only) ────────────────────────────────────

async function getMskSaslConfig(region: string): Promise<SASLOptions> {
    // Dynamic import to avoid loading in local dev
    const { generateAuthToken } = await import('aws-msk-iam-sasl-signer-js');

    return {
        mechanism: 'oauthbearer' as any,
        oauthBearerProvider: async () => {
            const token = await generateAuthToken({ region });
            return {
                value: token.token,
            };
        },
    };
}

// ─── Client Factory ─────────────────────────────────────────────────────

const kafkaClients: Record<string, Kafka> = {};
const kafkaProducers: Record<string, Producer> = {};

async function getKafkaClient(region: string): Promise<Kafka> {
    const target = normalizeRegion(region);

    if (kafkaClients[target]) return kafkaClients[target];

    let config: any = {
        clientId: 'mediconnect',
        logLevel: logLevel.WARN,
    };

    if (isProduction) {
        // MSK Serverless — IAM auth + TLS
        const mskEndpoint = target === 'eu-central-1'
            ? process.env.MSK_BOOTSTRAP_EU
            : process.env.MSK_BOOTSTRAP_US;

        if (!mskEndpoint) {
            throw new Error(`MSK bootstrap endpoint not configured for ${target}`);
        }

        config.brokers = [mskEndpoint];
        config.ssl = true; // TLS 1.2 enforced on MSK Serverless
        config.sasl = await getMskSaslConfig(target);
    } else {
        // Local Docker Kafka — no auth, no TLS
        config.brokers = [LOCAL_BROKER];
    }

    const client = new Kafka(config);
    kafkaClients[target] = client;
    return client;
}

// ─── Producer ───────────────────────────────────────────────────────────

export async function getKafkaProducer(region: string = 'us-east-1'): Promise<Producer> {
    const target = normalizeRegion(region);

    if (kafkaProducers[target]) return kafkaProducers[target];

    const kafka = await getKafkaClient(target);
    const producer = kafka.producer({
        allowAutoTopicCreation: false, // Topics created by setup script
        idempotent: true,              // Exactly-once semantics
    });

    await producer.connect();
    kafkaProducers[target] = producer;

    safeLog(`Kafka producer connected: ${target}`);
    return producer;
}

// ─── Consumer ───────────────────────────────────────────────────────────

export async function getKafkaConsumer(
    region: string,
    groupId: string,
): Promise<Consumer> {
    const kafka = await getKafkaClient(normalizeRegion(region));

    const consumer = kafka.consumer({
        groupId: `mediconnect-${groupId}`,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
    });

    await consumer.connect();
    safeLog(`Kafka consumer connected: ${groupId} in ${normalizeRegion(region)}`);
    return consumer;
}

// ─── Health Check ───────────────────────────────────────────────────────

export async function isKafkaConnected(region: string = 'us-east-1'): Promise<boolean> {
    if (!KAFKA_ENABLED) return false;

    try {
        const kafka = await getKafkaClient(normalizeRegion(region));
        const admin = kafka.admin();
        await admin.connect();
        await admin.listTopics();
        await admin.disconnect();
        return true;
    } catch {
        return false;
    }
}

// ─── Publish to Kafka ───────────────────────────────────────────────────

/**
 * Publish an event to a Kafka topic.
 * Used by the event-bus adapter (shared/event-bus.ts).
 *
 * @param topic - Kafka topic name (e.g., 'mediconnect.appointments')
 * @param key - Partition key (e.g., patientId for ordering)
 * @param value - Event payload (JSON object — IDs only, no raw PHI)
 * @param region - AWS region for MSK cluster selection
 */
export async function publishToKafka(
    topic: string,
    key: string,
    value: Record<string, any>,
    region: string = 'us-east-1',
): Promise<void> {
    const producer = await getKafkaProducer(region);

    await producer.send({
        topic,
        messages: [{
            key,
            value: JSON.stringify({
                ...value,
                _metadata: {
                    timestamp: new Date().toISOString(),
                    region: normalizeRegion(region),
                    source: 'mediconnect',
                },
            }),
        }],
    });
}

// ─── Graceful Shutdown ──────────────────────────────────────────────────

async function disconnectAll() {
    for (const [region, producer] of Object.entries(kafkaProducers)) {
        try {
            await producer.disconnect();
            safeLog(`Kafka producer disconnected: ${region}`);
        } catch (err: any) {
            safeError(`Kafka producer disconnect error: ${err.message}`);
        }
    }
}

process.on('SIGTERM', disconnectAll);
process.on('SIGINT', disconnectAll);

// ─── Topic Names (Single Source of Truth) ───────────────────────────────

export const KAFKA_TOPICS = {
    APPOINTMENTS: 'mediconnect.appointments',
    CLINICAL: 'mediconnect.clinical',
    VITALS: 'mediconnect.vitals',
    PAYMENTS: 'mediconnect.payments',
    PATIENTS: 'mediconnect.patients',
    AUDIT: 'mediconnect.audit',
    SUBSCRIPTIONS: 'mediconnect.subscriptions',
} as const;
