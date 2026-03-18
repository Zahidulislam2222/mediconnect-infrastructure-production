import { Request, Response } from 'express';
import Stripe from 'stripe';
import { getRegionalClient, getSSMParameter } from '../../../shared/aws-config';
import { TransactWriteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from 'crypto';
import { pushRevenueToBigQuery } from './billing.controller';

const STRIPE_SECRET_NAME = "/mediconnect/stripe/keys";
const STRIPE_WEBHOOK_SECRET_NAME = "/mediconnect/stripe/webhook_secret";

const TABLE_TRANSACTIONS = process.env.TABLE_TRANSACTIONS || "mediconnect-transactions";
const TABLE_PRESCRIPTIONS = process.env.TABLE_PRESCRIPTIONS || "mediconnect-prescriptions";
const TABLE_APPOINTMENTS = process.env.TABLE_APPOINTMENTS || "mediconnect-appointments";
const TABLE_INVENTORY = process.env.TABLE_INVENTORY || "mediconnect-pharmacy-inventory";

// ─── IDEMPOTENCY FIX ───────────────────────────────────────────────────────
// Stripe can retry webhooks up to 100x. The original code had a partial check
// (billId status === 'PAID') but this was vulnerable to race conditions when
// concurrent retries both see status !== 'PAID' simultaneously.
//
// FIX: Atomic event deduplication using DynamoDB conditional PutItem on
// the Stripe event ID. Only the first delivery succeeds; retries get a
// ConditionalCheckFailedException and are safely skipped.
//
// Table: mediconnect-webhook-events
//   PK: eventId (Stripe event ID, e.g. "evt_1abc...")
//   Attributes: type, processedAt, region
//   TTL: expiresAt (30 days — Stripe retries stop after ~3 days)
// ────────────────────────────────────────────────────────────────────────────
const TABLE_WEBHOOK_EVENTS = process.env.TABLE_WEBHOOK_EVENTS || "mediconnect-webhook-events";
const WEBHOOK_EVENT_TTL_DAYS = 30;

/**
 * Atomically mark a Stripe event as processed.
 * Returns true if this is the FIRST time we've seen this event.
 * Returns false if the event was already processed (duplicate/retry).
 *
 * Uses DynamoDB conditional PutItem:
 *   - attribute_not_exists(eventId) ensures only one writer wins
 *   - ConditionalCheckFailedException = duplicate = safe to skip
 */
async function claimWebhookEvent(
    eventId: string,
    eventType: string,
    region: string,
    regionalDb: any
): Promise<boolean> {
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (WEBHOOK_EVENT_TTL_DAYS * 24 * 60 * 60);

    try {
        await regionalDb.send(new PutCommand({
            TableName: TABLE_WEBHOOK_EVENTS,
            Item: {
                eventId,
                eventType,
                processedAt: now,
                region,
                expiresAt: ttl,  // DynamoDB TTL auto-cleanup
            },
            // ATOMIC GUARD: Fails if eventId already exists
            ConditionExpression: "attribute_not_exists(eventId)",
        }));

        console.log(`🔒 Webhook event claimed: ${eventId} (${eventType})`);
        return true;  // First time — proceed with processing

    } catch (err: any) {
        if (err.name === 'ConditionalCheckFailedException') {
            console.log(`⚠️ Webhook duplicate skipped: ${eventId} (already processed)`);
            return false;  // Duplicate — safe to skip
        }
        // Unexpected error — log but allow processing to prevent lost events
        console.error(`⚠️ Webhook idempotency check error for ${eventId}:`, err.message);
        return true;  // Fail-open: better to risk a duplicate than lose an event
    }
}

export const handleStripeWebhook = async (req: Request, res: Response) => {
    let event: Stripe.Event;

    let region = process.env.AWS_REGION || "us-east-1";
    try {
        const unverifiedPayload = JSON.parse(req.body.toString());
        if (unverifiedPayload.data?.object?.metadata?.region) {
            region = unverifiedPayload.data.object.metadata.region;
        }
    } catch (e) { console.warn("Could not parse unverified webhook payload"); }

    const regionalDb = getRegionalClient(region);

    try {
        const stripeKey = await getSSMParameter(STRIPE_SECRET_NAME, region, true);
        const webhookSecret = await getSSMParameter(STRIPE_WEBHOOK_SECRET_NAME, region, true);

        if (!stripeKey || !webhookSecret) {
            console.error(`CRITICAL: Stripe secrets missing in SSM for region: ${region}`);
            return res.status(500).send("Server Configuration Error");
        }

        const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
        const sig = req.headers['stripe-signature'];
        if (!sig) return res.status(400).send("Missing Stripe Signature");

        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    } catch (err: any) {
        console.error(`⚠️ Webhook Signature Verification Failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ─── IDEMPOTENCY GATE: Check if this Stripe event was already processed ───
    // ORIGINAL: No event-level deduplication. Stripe retries could cause
    // double-processing if concurrent deliveries raced past the billId check.
    const isNewEvent = await claimWebhookEvent(event.id, event.type, region, regionalDb);
    if (!isNewEvent) {
        // Already processed — acknowledge to Stripe so it stops retrying
        return res.json({ received: true, deduplicated: true });
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`💰 Payment Captured: ${paymentIntent.id} in region ${region}`);
        await handlePaymentSuccess(paymentIntent, regionalDb, region);
    } else if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`❌ Payment Failed: ${paymentIntent.last_payment_error?.message}`);
    }

    res.json({ received: true });
};

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent, regionalDb: any, region: string) {
    const { billId, referenceId, type, pharmacyId, medication } = paymentIntent.metadata || {};

    if (!billId) {
        console.warn("Skipping Webhook: Missing 'billId' in metadata.");
        return;
    }

    let existingTxItem: any = null; // 🟢 Declare OUTSIDE the try block

    try {
        const existingTx = await regionalDb.send(new GetCommand({
            TableName: TABLE_TRANSACTIONS,
            Key: { billId }
        }));
        
        existingTxItem = existingTx.Item;

        if (existingTxItem && existingTxItem.status === 'PAID') {

            console.log(`⚠️ Idempotency Check: Transaction ${billId} is already PAID. Skipping.`);
            return; // STOP EXECUTION HERE
        }
    } catch (err) {
        console.warn("Idempotency check failed, proceeding cautiously...", err);
    }

    const timestamp = new Date().toISOString();
    const transactItems: any[] = [];

    // ACTION A: Update the Ledger
    transactItems.push({
        Update: {
            TableName: TABLE_TRANSACTIONS,
            Key: { billId },
            UpdateExpression: "SET #s = :s, paymentIntentId = :pid, paidAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":s": "PAID", ":pid": paymentIntent.id, ":now": timestamp }
        }
    });

    // ACTION B: Sync Source
    if (type === 'PHARMACY' && referenceId) {
        transactItems.push({
            Update: {
                TableName: TABLE_PRESCRIPTIONS,
                Key: { prescriptionId: referenceId },
                UpdateExpression: "SET paymentStatus = :ps, #s = :rs, updatedAt = :now",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: { ":ps": "PAID", ":rs": "READY_FOR_PICKUP", ":now": timestamp }
            }
        });

        transactItems.push({
            Update: {
                TableName: TABLE_INVENTORY,
                Key: { pharmacyId: pharmacyId || "CVS-001", drugId: medication },
                UpdateExpression: "SET stock = stock - :one",
                ExpressionAttributeValues: { ":one": 1 }
            }
        });
    } else if (type === 'BOOKING_FEE' && referenceId) {
        transactItems.push({
            Update: {
                TableName: TABLE_APPOINTMENTS,
                Key: { appointmentId: referenceId },
                UpdateExpression: "SET paymentStatus = :ps, #s = :confirmed",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: { ":ps": "paid", ":confirmed": "CONFIRMED" }
            }
        });
    }

    try {
        await regionalDb.send(new TransactWriteCommand({ TransactItems: transactItems }));
        console.log(`✅ DATABASE SYNCED: Transaction ${billId} + ${type} Record`);

        // 🟢 HIPAA FIX: Pseudonymize Patient ID before sending to Analytics
        const existingTxData = existingTxItem;
        if (existingTxData && existingTxData.patientId) {
            const hashedPatientId = createHash('sha256').update(existingTxData.patientId + process.env.HIPAA_SALT).digest('hex');

            pushRevenueToBigQuery({
                billId,
                patientId: hashedPatientId, // 🛡️ SECURE
                doctorId: existingTxData.doctorId || "UNKNOWN",
                amount: existingTxData.amount
            }, region).catch(e => console.error("BigQuery sync failed", e));
        }
    } catch (error) {
        console.error("CRITICAL DB ERROR: Webhook failed to write to Regional DynamoDB", error);
    }
}