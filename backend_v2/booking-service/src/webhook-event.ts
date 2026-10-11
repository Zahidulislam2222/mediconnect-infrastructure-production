import { randomUUID } from 'crypto';
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../shared/aws-config';
import { getWebhookSettings, requiredResourceName } from '../../shared/settings';

type Client = ReturnType<typeof getRegionalClient>;
export type EventClaim = { state: 'acquired'; token: string } | { state: 'completed' } | { state: 'busy' };
const isConditional = (error: unknown) => (error as { name?: string })?.name === 'ConditionalCheckFailedException';

/** Fence a business transaction against an expired or superseded event worker. */
export function eventClaimCondition(eventId: string, token: string) {
    return {
        TableName: requiredResourceName('TABLE_WEBHOOK_EVENTS'), Key: { eventId },
        ConditionExpression: '#status = :processing AND claimToken = :token AND leaseUntil >= :leaseNow',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':processing': 'PROCESSING', ':token': token, ':leaseNow': Math.floor(Date.now() / 1000) },
    };
}

/** Completed receipts deduplicate; active leases ask Stripe to retry; expired leases recover crashed work. */
export async function claimEvent(db: Client, eventId: string, eventType: string, region: string): Promise<EventClaim> {
    const table = requiredResourceName('TABLE_WEBHOOK_EVENTS');
    const config = getWebhookSettings();
    const now = Math.floor(Date.now() / 1000);
    const token = randomUUID();
    const leaseUntil = now + config.claimTtlSeconds;
    const expiresAt = now + config.retentionSeconds;
    try {
        await db.send(new PutCommand({
            TableName: table,
            Item: { eventId, eventType, region, status: 'PROCESSING', claimToken: token, leaseUntil, expiresAt },
            ConditionExpression: 'attribute_not_exists(eventId)',
        }));
        return { state: 'acquired', token };
    } catch (error) {
        if (!isConditional(error)) throw error;
    }
    const existing = (await db.send(new GetCommand({ TableName: table, Key: { eventId }, ConsistentRead: true }))).Item;
    // Legacy processedAt was written before business work. It is ambiguous and needs reconciliation,
    // so only an explicit completed receipt can acknowledge a duplicate without checking the business state.
    if (existing?.status === 'COMPLETED') {
        return { state: 'completed' };
    }
    if (existing?.status !== 'PROCESSING' || typeof existing.leaseUntil !== 'number' ||
        existing.leaseUntil >= now || typeof existing.claimToken !== 'string') return { state: 'busy' };
    try {
        await db.send(new UpdateCommand({
            TableName: table, Key: { eventId },
            UpdateExpression: 'SET claimToken = :next, leaseUntil = :lease, expiresAt = :ttl',
            ConditionExpression: '#status = :processing AND claimToken = :token AND leaseUntil < :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':processing': 'PROCESSING', ':token': existing.claimToken, ':now': now,
                ':next': token, ':lease': leaseUntil, ':ttl': expiresAt },
        }));
        return { state: 'acquired', token };
    } catch (error) {
        if (!isConditional(error)) throw error;
        return { state: 'busy' };
    }
}

export async function completeEvent(db: Client, eventId: string, token: string): Promise<void> {
    await db.send(new UpdateCommand({
        TableName: requiredResourceName('TABLE_WEBHOOK_EVENTS'), Key: { eventId },
        UpdateExpression: 'SET #status = :completed, processedAt = :now',
        ConditionExpression: '#status = :processing AND claimToken = :token',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':processing': 'PROCESSING', ':completed': 'COMPLETED', ':token': token,
            ':now': new Date().toISOString() },
    }));
}

export async function releaseEvent(db: Client, eventId: string, token: string): Promise<void> {
    try {
        await db.send(new DeleteCommand({
            TableName: requiredResourceName('TABLE_WEBHOOK_EVENTS'), Key: { eventId },
            ConditionExpression: '#status = :processing AND claimToken = :token',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':processing': 'PROCESSING', ':token': token },
        }));
    } catch (error) {
        if (!isConditional(error)) throw error;
    }
}
