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
    return "system";
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
 * Publish an event to the SQS event pipeline.
 * Gracefully degrades: if SQS is unavailable, logs locally.
 */
export async function publishEvent(
    eventType: EventType,
    payload: EventPayload,
    region: string = "us-east-1",
    meta?: EventMeta
): Promise<PublishResult> {
    const category = getQueueCategory(eventType);
    const normalizedRegion = normalizeRegion(region);

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
