/**
 * SQS Event Bus — INTEGRATED
 * Cross-service event publishing via SQS with DLQ support.
 * Imported by: audit.ts, breach-detection.ts, booking-service, doctor-service,
 * patient-service, communication-service (20 integration points).
 * Graceful degradation: logs locally if SQS queue unavailable.
 */

/**
 * SQS Event Pipeline — Async cross-service event bus
 * Replaces direct SNS calls with a queued, dead-letter-aware pipeline.
 *
 * Usage:
 *   import { publishEvent, EventType } from '../../shared/event-bus';
 *   await publishEvent(EventType.AUDIT_LOG, { actorId, patientId, action }, region);
 */

import { SQSClient, SendMessageCommand, GetQueueUrlCommand } from "@aws-sdk/client-sqs";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { safeLog, safeError } from './logger';
import { KAFKA_ENABLED, KAFKA_DUAL_WRITE, publishToKafka, KAFKA_TOPICS } from './kafka';

// --- SQS Client Factory (follows same pattern as aws-config.ts) ---

const requestHandler = new NodeHttpHandler({
    connectionTimeout: 5000,
    socketTimeout: 5000,
});

const awsConfigBase = {
    requestHandler,
    maxAttempts: 3,
};

const normalizeRegion = (region: string = "us-east-1"): string => {
    const r = region?.toUpperCase();
    return (r === 'EU' || r === 'EU-CENTRAL-1') ? 'eu-central-1' : 'us-east-1';
};

const sqsClients: Record<string, SQSClient> = {};

export const getRegionalSQSClient = (region: string = "us-east-1"): SQSClient => {
    const target = normalizeRegion(region);
    if (sqsClients[target]) return sqsClients[target];
    sqsClients[target] = new SQSClient({ ...awsConfigBase, region: target });
    return sqsClients[target];
};

// --- Event Types ---

export enum EventType {
    // Audit & Compliance
    AUDIT_LOG = "audit.log",
    BREACH_ALERT = "security.breach_alert",
    PHI_ACCESS = "security.phi_access",

    // Clinical Events
    PRESCRIPTION_ISSUED = "clinical.prescription_issued",
    PRESCRIPTION_DISPENSED = "clinical.prescription_dispensed",
    PRESCRIPTION_CANCELLED = "clinical.prescription_cancelled",
    DRUG_INTERACTION_DETECTED = "clinical.drug_interaction",
    LAB_RESULT_READY = "clinical.lab_result",
    VITAL_ALERT = "clinical.vital_alert",

    // Appointment Events
    APPOINTMENT_BOOKED = "appointment.booked",
    APPOINTMENT_CANCELLED = "appointment.cancelled",
    APPOINTMENT_COMPLETED = "appointment.completed",
    APPOINTMENT_REMINDER = "appointment.reminder",

    // Patient Events
    PATIENT_REGISTERED = "patient.registered",
    PATIENT_UPDATED = "patient.updated",
    PATIENT_DELETED = "patient.deleted",
    CONSENT_UPDATED = "consent.updated",

    // HL7 Integration
    HL7_MESSAGE_RECEIVED = "hl7.message_received",
    HL7_MESSAGE_PROCESSED = "hl7.message_processed",

    // Doctor Events
    DOCTOR_REGISTERED = "patient.doctor_registered",
    DOCTOR_DELETED = "patient.doctor_deleted",

    // System Events
    SERVICE_HEALTH_CHANGE = "system.health_change",
    FAILOVER_TRIGGERED = "system.failover",

    // Communication Events
    VIDEO_CALL_STARTED = "communication.video_started",
    VIDEO_CALL_ENDED = "communication.video_ended",

    // Extended Clinical Events
    DOCTOR_RATE_CHANGED = "clinical.doctor_rate_changed",
    DICOM_STUDY_UPLOADED = "clinical.dicom_uploaded",

    // Extended Appointment Events
    ELIGIBILITY_CHECKED = "appointment.eligibility_checked",

    // Chatbot Events
    CHATBOT_MESSAGE_PROCESSED = "system.chatbot_message",
    CHATBOT_RATE_LIMITED = "system.chatbot_rate_limited",
    CHATBOT_ABUSE_DETECTED = "security.chatbot_abuse",

    // Extended System Events
    STAFF_SHIFT_CHANGED = "system.staff_shift_changed",

    // Subscription Events
    SUBSCRIPTION_CREATED = "subscription.created",
    SUBSCRIPTION_CANCELLED = "subscription.cancelled",
    SUBSCRIPTION_RENEWED = "subscription.renewed",
    SUBSCRIPTION_PAYMENT_FAILED = "subscription.payment_failed",
    SUBSCRIPTION_DISPUTE = "subscription.dispute",
    PAYOUT_EXECUTED = "payout.executed",
}

// --- Queue Configuration ---

interface QueueConfig {
    queueName: string;
    envVar: string;
    dlqName: string;
}

const QUEUE_MAP: Record<string, QueueConfig> = {
    audit: {
        queueName: "mediconnect-audit-events",
        envVar: "SQS_AUDIT_QUEUE_URL",
        dlqName: "mediconnect-audit-events-dlq"
    },
    clinical: {
        queueName: "mediconnect-clinical-events",
        envVar: "SQS_CLINICAL_QUEUE_URL",
        dlqName: "mediconnect-clinical-events-dlq"
    },
    appointment: {
        queueName: "mediconnect-appointment-events",
        envVar: "SQS_APPOINTMENT_QUEUE_URL",
        dlqName: "mediconnect-appointment-events-dlq"
    },
    patient: {
        queueName: "mediconnect-patient-events",
        envVar: "SQS_PATIENT_QUEUE_URL",
        dlqName: "mediconnect-patient-events-dlq"
    },
    security: {
        queueName: "mediconnect-security-events",
        envVar: "SQS_SECURITY_QUEUE_URL",
        dlqName: "mediconnect-security-events-dlq"
    },
    system: {
        queueName: "mediconnect-system-events",
        envVar: "SQS_SYSTEM_QUEUE_URL",
        dlqName: "mediconnect-system-events-dlq"
    }
};

function getQueueCategory(eventType: EventType): string {
    if (eventType.startsWith("audit.")) return "audit";
    if (eventType.startsWith("security.")) return "security";
    if (eventType.startsWith("clinical.")) return "clinical";
    if (eventType.startsWith("appointment.")) return "appointment";
    if (eventType.startsWith("patient.") || eventType.startsWith("consent.")) return "patient";
    if (eventType.startsWith("hl7.")) return "clinical";
    if (eventType.startsWith("subscription.")) return "system";
    if (eventType.startsWith("payout.")) return "system";
    if (eventType.startsWith("communication.")) return "system";
    return "system";
}

// ─── Kafka Topic Mapping ────────────────────────────────────────────────

function getKafkaTopic(eventType: EventType): string {
    if (eventType.startsWith("audit.") || eventType.startsWith("security.")) return KAFKA_TOPICS.AUDIT;
    if (eventType.startsWith("clinical.") || eventType.startsWith("hl7.")) return KAFKA_TOPICS.CLINICAL;
    if (eventType === EventType.VITAL_ALERT) return KAFKA_TOPICS.VITALS;
    if (eventType.startsWith("appointment.")) return KAFKA_TOPICS.APPOINTMENTS;
    if (eventType.startsWith("patient.") || eventType.startsWith("consent.")) return KAFKA_TOPICS.PATIENTS;
    if (eventType.startsWith("subscription.")) return KAFKA_TOPICS.SUBSCRIPTIONS;
    if (eventType.startsWith("payout.") || eventType === EventType.SUBSCRIPTION_PAYMENT_FAILED || eventType === EventType.SUBSCRIPTION_DISPUTE) return KAFKA_TOPICS.PAYMENTS;
    return KAFKA_TOPICS.AUDIT; // default: audit trail captures everything
}

// --- Queue URL Resolution (cached) ---

const queueUrlCache: Record<string, string> = {};

async function resolveQueueUrl(category: string, region: string): Promise<string | null> {
    const config = QUEUE_MAP[category];
    if (!config) return null;

    // Check env var first
    const envUrl = process.env[config.envVar];
    if (envUrl) return envUrl;

    // Check cache
    const cacheKey = `${region}:${category}`;
    if (queueUrlCache[cacheKey]) return queueUrlCache[cacheKey];

    // Resolve from SQS
    try {
        const sqs = getRegionalSQSClient(region);
        const result = await sqs.send(new GetQueueUrlCommand({ QueueName: config.queueName }));
        if (result.QueueUrl) {
            queueUrlCache[cacheKey] = result.QueueUrl;
            return result.QueueUrl;
        }
    } catch {
        // Queue may not exist yet — graceful degradation
    }

    return null;
}

// --- Core Event Publisher ---

interface EventPayload {
    [key: string]: any;
}

interface EventMeta {
    source?: string;         // Service that published the event
    correlationId?: string;  // For tracing across services
    ipAddress?: string;
    userId?: string;
}

interface PublishResult {
    published: boolean;
    messageId?: string;
    queueCategory: string;
    fallback?: string;
}

/**
 * Publish an event to Kafka (if enabled) and/or SQS.
 *
 * Modes:
 *   KAFKA_ENABLED=false  → SQS only (default, current behavior)
 *   KAFKA_ENABLED=true   → Kafka primary, SQS fallback on Kafka failure
 *   KAFKA_DUAL_WRITE=true → Both Kafka AND SQS (migration safety)
 */
export async function publishEvent(
    eventType: EventType,
    payload: EventPayload,
    region: string = "us-east-1",
    meta?: EventMeta
): Promise<PublishResult> {
    const category = getQueueCategory(eventType);
    const normalizedRegion = normalizeRegion(region);

    // ─── Kafka Path (feature-flagged) ───────────────────────────────
    if (KAFKA_ENABLED) {
        try {
            const topic = getKafkaTopic(eventType);
            const key = payload.patientId || payload.doctorId || payload.appointmentId || eventType;
            await publishToKafka(topic, key, { eventType, category, payload, meta }, normalizedRegion);

            // If dual-write is OFF, Kafka success means we're done
            if (!KAFKA_DUAL_WRITE) {
                return { published: true, queueCategory: category };
            }
            // If dual-write is ON, continue to SQS below
        } catch (kafkaErr: any) {
            safeError(`[EVENT_BUS] Kafka publish failed for ${eventType}: ${kafkaErr.message}. Falling back to SQS.`);
            // Fall through to SQS
        }
    }

    const message = {
        eventType,
        category,
        timestamp: new Date().toISOString(),
        region: normalizedRegion,
        source: meta?.source || process.env.SERVICE_NAME || "unknown",
        correlationId: meta?.correlationId || generateCorrelationId(),
        payload,
        meta: {
            ipAddress: meta?.ipAddress,
            userId: meta?.userId
        }
    };

    try {
        const queueUrl = await resolveQueueUrl(category, normalizedRegion);
        if (!queueUrl) {
            // Graceful degradation: log locally
            safeLog(`[EVENT_BUS] No queue for ${category}. Event logged locally: ${eventType}`);
            return { published: false, queueCategory: category, fallback: "local_log" };
        }

        const sqs = getRegionalSQSClient(normalizedRegion);
        const result = await sqs.send(new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(message),
            MessageAttributes: {
                eventType: { DataType: "String", StringValue: eventType },
                category: { DataType: "String", StringValue: category },
                region: { DataType: "String", StringValue: normalizedRegion },
                source: { DataType: "String", StringValue: message.source }
            },
            // Group by category for FIFO queues (if configured)
            ...(queueUrl.endsWith(".fifo") ? {
                MessageGroupId: category,
                MessageDeduplicationId: `${message.correlationId}-${Date.now()}`
            } : {})
        }));

        return {
            published: true,
            messageId: result.MessageId,
            queueCategory: category
        };
    } catch (error: any) {
        safeError(`[EVENT_BUS] Publish failed for ${eventType}:`, error.message);
        return { published: false, queueCategory: category, fallback: "error" };
    }
}

/**
 * Publish multiple events in batch (convenience wrapper)
 */
export async function publishEvents(
    events: Array<{ type: EventType; payload: EventPayload }>,
    region: string = "us-east-1",
    meta?: EventMeta
): Promise<PublishResult[]> {
    return Promise.all(
        events.map(e => publishEvent(e.type, e.payload, region, meta))
    );
}

// --- Helpers ---

function generateCorrelationId(): string {
    return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get queue configuration for infrastructure provisioning
 */
export function getQueueConfigs(): Record<string, QueueConfig> {
    return { ...QUEUE_MAP };
}
