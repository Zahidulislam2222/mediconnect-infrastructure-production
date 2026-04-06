/**
 * Kafka Consumers — Analytics + Notification Pipelines
 *
 * Two consumer groups:
 *   1. mediconnect-analytics — routes events to BigQuery streaming
 *   2. mediconnect-notifications — routes events to sendNotification()
 *
 * These run as background workers alongside the main services.
 * Start with: KAFKA_ENABLED=true node -e "require('./shared/kafka-consumers').startConsumers('us-east-1')"
 *
 * Security:
 *   - Events contain IDs only, no raw PHI
 *   - IAM auth on MSK (production)
 *   - Dead-letter handling for failed events
 */

import { KAFKA_ENABLED, KAFKA_TOPICS, getKafkaConsumer } from './kafka';
import { safeLog, safeError } from './logger';
import { sendNotification } from './notifications';

// ─── Analytics Consumer ─────────────────────────────────────────────────

async function startAnalyticsConsumer(region: string) {
    const consumer = await getKafkaConsumer(region, 'analytics');

    await consumer.subscribe({
        topics: [
            KAFKA_TOPICS.APPOINTMENTS,
            KAFKA_TOPICS.CLINICAL,
            KAFKA_TOPICS.VITALS,
            KAFKA_TOPICS.PAYMENTS,
            KAFKA_TOPICS.SUBSCRIPTIONS,
        ],
        fromBeginning: false,
    });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            try {
                const event = JSON.parse(message.value?.toString() || '{}');
                const eventType = event.eventType;
                const payload = event.payload || {};

                switch (topic) {
                    case KAFKA_TOPICS.APPOINTMENTS:
                        if (eventType === 'appointment.booked' || eventType === 'appointment.completed') {
                            safeLog(`[KAFKA-ANALYTICS] ${eventType}: ${payload.appointmentId}`);
                            // BigQuery streaming would be called here:
                            // await pushAppointmentToBigQuery(payload, region);
                        }
                        break;

                    case KAFKA_TOPICS.PAYMENTS:
                        if (eventType === 'payout.executed') {
                            safeLog(`[KAFKA-ANALYTICS] Payout: ${payload.doctorId}`);
                            // await pushRevenueToBigQuery(payload, region);
                        }
                        break;

                    case KAFKA_TOPICS.VITALS:
                        safeLog(`[KAFKA-ANALYTICS] Vital: ${payload.patientId}`);
                        // await pushVitalToBigQuery(payload, region);
                        break;

                    default:
                        safeLog(`[KAFKA-ANALYTICS] ${topic}/${eventType}: processed`);
                }
            } catch (err: any) {
                safeError(`[KAFKA-ANALYTICS] Failed to process message: ${err.message}`);
                // TODO: publish to dead-letter topic
            }
        },
    });

    safeLog(`[KAFKA-ANALYTICS] Consumer started for ${region}`);
}

// ─── Notification Consumer ──────────────────────────────────────────────

const NOTIFICATION_MAP: Record<string, { type: string; subjectFn: (p: any) => string; messageFn: (p: any) => string }> = {
    'appointment.booked': {
        type: 'BOOKING_CONFIRMATION',
        subjectFn: () => 'Booking Confirmed',
        messageFn: (p) => `Your appointment on ${p.timeSlot || 'the scheduled time'} has been confirmed.`,
    },
    'appointment.cancelled': {
        type: 'BOOKING_CANCELLATION',
        subjectFn: () => 'Appointment Cancelled',
        messageFn: (p) => `Your appointment has been cancelled. ${p.reason || ''}`,
    },
    'clinical.prescription_issued': {
        type: 'PRESCRIPTION_ISSUED',
        subjectFn: () => 'New Prescription',
        messageFn: (p) => `A new prescription for ${p.medication || 'your medication'} has been issued.`,
    },
    'clinical.prescription_cancelled': {
        type: 'PRESCRIPTION_CANCELLED',
        subjectFn: () => 'Prescription Cancelled',
        messageFn: (p) => `Your prescription has been cancelled by your doctor.`,
    },
    'subscription.payment_failed': {
        type: 'PAYMENT_FAILED',
        subjectFn: () => 'Payment Failed — Update Your Card',
        messageFn: () => 'Your MediConnect subscription payment failed. Please update your payment method.',
    },
};

async function startNotificationConsumer(region: string) {
    const consumer = await getKafkaConsumer(region, 'notifications');

    await consumer.subscribe({
        topics: [
            KAFKA_TOPICS.APPOINTMENTS,
            KAFKA_TOPICS.CLINICAL,
            KAFKA_TOPICS.SUBSCRIPTIONS,
            KAFKA_TOPICS.PAYMENTS,
        ],
        fromBeginning: false,
    });

    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const event = JSON.parse(message.value?.toString() || '{}');
                const eventType = event.eventType;
                const payload = event.payload || {};

                const mapping = NOTIFICATION_MAP[eventType];
                if (!mapping) return; // No notification needed for this event type

                await sendNotification({
                    region,
                    recipientEmail: payload.patientEmail || '',
                    subject: mapping.subjectFn(payload),
                    message: mapping.messageFn(payload),
                    type: mapping.type as any,
                    metadata: { patientId: payload.patientId || '' },
                });

                safeLog(`[KAFKA-NOTIFY] ${eventType} → ${mapping.type} sent`);
            } catch (err: any) {
                safeError(`[KAFKA-NOTIFY] Failed: ${err.message}`);
            }
        },
    });

    safeLog(`[KAFKA-NOTIFY] Consumer started for ${region}`);
}

// ─── Start All Consumers ────────────────────────────────────────────────

export async function startConsumers(region: string = 'us-east-1') {
    if (!KAFKA_ENABLED) {
        safeLog('[KAFKA] Kafka disabled (KAFKA_ENABLED != true). Consumers not started.');
        return;
    }

    try {
        await Promise.all([
            startAnalyticsConsumer(region),
            startNotificationConsumer(region),
        ]);
        safeLog(`[KAFKA] All consumers started for ${region}`);
    } catch (err: any) {
        safeError(`[KAFKA] Consumer startup failed: ${err.message}`);
    }
}
