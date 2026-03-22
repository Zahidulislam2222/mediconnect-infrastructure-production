import { getRegionalClient } from './aws-config';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { publishEvent, EventType } from './event-bus';
import { safeError } from './logger';

// In-memory rate tracking for breach detection
const accessCounts: Map<string, { count: number; firstSeen: number }> = new Map();
const BREACH_THRESHOLD = 50; // More than 50 PHI accesses in 5 minutes is suspicious
const WINDOW_MS = 5 * 60 * 1000;

const BREACH_ACTIONS = [
    'HIPAA_VIOLATION_ATTEMPT',
    'HIJACK_ATTEMPT',
    'FRAUD_ATTEMPT',
    'SPOOF_ATTEMPT',
    'UNAUTHORIZED_BILLING_ACCESS',
    'ILLEGAL_ANALYTICS_ACCESS',
    'ILLEGAL_ACCESS_ATTEMPT',
    'AUTH_FAILURE',
    'EMERGENCY_ACCESS_GRANTED', // Gap #1 FIX: Notify compliance on break-glass
];

export async function checkForBreach(
    actorId: string,
    action: string,
    details: string,
    region?: string
): Promise<void> {
    // 1. Check if action is a known security event
    if (BREACH_ACTIONS.includes(action)) {
        await sendBreachAlert(actorId, action, details, 'SECURITY_EVENT', region);
        publishEvent(EventType.BREACH_ALERT, { actorId, action, details, alertType: 'SECURITY_EVENT' }, region).catch(() => {});
        return;
    }

    // 2. Rate-based anomaly detection
    const now = Date.now();
    const key = `${actorId}`;
    const entry = accessCounts.get(key);

    if (entry) {
        if (now - entry.firstSeen > WINDOW_MS) {
            // Reset window
            accessCounts.set(key, { count: 1, firstSeen: now });
        } else {
            entry.count++;
            if (entry.count >= BREACH_THRESHOLD) {
                await sendBreachAlert(actorId, action, `Excessive PHI access: ${entry.count} operations in ${Math.round((now - entry.firstSeen) / 1000)}s`, 'RATE_ANOMALY', region);
                publishEvent(EventType.PHI_ACCESS, { actorId, action, accessCount: entry.count, alertType: 'RATE_ANOMALY' }, region).catch(() => {});
                accessCounts.delete(key);
            }
        }
    } else {
        accessCounts.set(key, { count: 1, firstSeen: now });
    }
}

async function sendBreachAlert(
    actorId: string,
    action: string,
    details: string,
    alertType: string,
    region?: string
): Promise<void> {
    const snsTopicArn = process.env.BREACH_NOTIFICATION_SNS_ARN;
    if (!snsTopicArn) {
        safeError('[BREACH ALERT] SNS not configured. Alert:', { actorId: actorId.substring(0, 8), action, alertType, details });
        return;
    }

    try {
        const snsClient = new SNSClient({ region: region || process.env.AWS_REGION || 'us-east-1' });
        await snsClient.send(new PublishCommand({
            TopicArn: snsTopicArn,
            Subject: `[MediConnect BREACH ALERT] ${alertType}: ${action}`,
            Message: JSON.stringify({
                timestamp: new Date().toISOString(),
                alertType,
                actorId: actorId.substring(0, 8) + '...',
                action,
                details,
                region: region || 'unknown',
                severity: BREACH_ACTIONS.includes(action) ? 'CRITICAL' : 'HIGH',
            }, null, 2),
        }));
    } catch (err) {
        safeError('[BREACH ALERT] Failed to send SNS notification:', err);
    }
}
