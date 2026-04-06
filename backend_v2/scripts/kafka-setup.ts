/**
 * Kafka Topic Setup Script
 *
 * Creates all 7 Kafka topics with correct partitions and retention.
 * Idempotent: safe to run multiple times (skips existing topics).
 *
 * Usage:
 *   npx tsx scripts/kafka-setup.ts                # Local Docker
 *   KAFKA_BROKER=msk-endpoint npx tsx scripts/kafka-setup.ts  # MSK
 */

import { Kafka } from 'kafkajs';
import { KAFKA_TOPICS } from '../shared/kafka';

const broker = process.env.KAFKA_BROKER || 'localhost:9092';

const TOPIC_CONFIGS: Array<{
    topic: string;
    numPartitions: number;
    retentionMs: number;
    retentionLabel: string;
}> = [
    {
        topic: KAFKA_TOPICS.APPOINTMENTS,
        numPartitions: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,  // 7 days
        retentionLabel: '7 days',
    },
    {
        topic: KAFKA_TOPICS.CLINICAL,
        numPartitions: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        retentionLabel: '7 days',
    },
    {
        topic: KAFKA_TOPICS.VITALS,
        numPartitions: 6,  // Higher: high volume IoT stream
        retentionMs: 3 * 24 * 60 * 60 * 1000,  // 3 days
        retentionLabel: '3 days',
    },
    {
        topic: KAFKA_TOPICS.PAYMENTS,
        numPartitions: 3,
        retentionMs: 30 * 24 * 60 * 60 * 1000,  // 30 days (financial data)
        retentionLabel: '30 days',
    },
    {
        topic: KAFKA_TOPICS.PATIENTS,
        numPartitions: 3,
        retentionMs: 7 * 24 * 60 * 60 * 1000,
        retentionLabel: '7 days',
    },
    {
        topic: KAFKA_TOPICS.AUDIT,
        numPartitions: 3,
        retentionMs: 365 * 24 * 60 * 60 * 1000,  // 365 days (HIPAA compliance)
        retentionLabel: '365 days (HIPAA)',
    },
    {
        topic: KAFKA_TOPICS.SUBSCRIPTIONS,
        numPartitions: 2,
        retentionMs: 30 * 24 * 60 * 60 * 1000,
        retentionLabel: '30 days',
    },
];

async function main() {
    console.log(`\nKafka Topic Setup — ${broker}\n`);

    const kafka = new Kafka({
        clientId: 'mediconnect-setup',
        brokers: [broker],
    });

    const admin = kafka.admin();
    await admin.connect();

    const existingTopics = await admin.listTopics();
    console.log(`Existing topics: ${existingTopics.length}`);

    const toCreate = TOPIC_CONFIGS.filter(c => !existingTopics.includes(c.topic));

    if (toCreate.length === 0) {
        console.log('\nAll topics already exist. Nothing to do.');
        await admin.disconnect();
        return;
    }

    console.log(`\nCreating ${toCreate.length} topics:\n`);

    await admin.createTopics({
        waitForLeaders: true,
        topics: toCreate.map(c => ({
            topic: c.topic,
            numPartitions: c.numPartitions,
            replicationFactor: 1,  // 1 for local dev, MSK handles replication automatically
            configEntries: [
                { name: 'retention.ms', value: String(c.retentionMs) },
                { name: 'cleanup.policy', value: 'delete' },
            ],
        })),
    });

    for (const c of toCreate) {
        console.log(`  Created: ${c.topic} (${c.numPartitions} partitions, ${c.retentionLabel})`);
    }

    // Verify all topics exist
    const finalTopics = await admin.listTopics();
    const missing = TOPIC_CONFIGS.filter(c => !finalTopics.includes(c.topic));

    if (missing.length > 0) {
        console.error(`\nERROR: ${missing.length} topics failed to create:`);
        for (const m of missing) console.error(`  - ${m.topic}`);
        process.exit(1);
    }

    console.log(`\nAll ${TOPIC_CONFIGS.length} topics verified.`);
    await admin.disconnect();
}

main().catch(err => {
    console.error('Kafka setup failed:', err.message);
    process.exit(1);
});
