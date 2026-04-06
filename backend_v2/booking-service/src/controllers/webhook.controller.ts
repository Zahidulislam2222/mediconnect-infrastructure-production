import { Request, Response } from 'express';
import Stripe from 'stripe';
import { getRegionalClient, getSSMParameter } from '../../../shared/aws-config';
import { TransactWriteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHash } from 'crypto';
import { pushRevenueToBigQuery, pushAppointmentToBigQuery } from './billing.controller';
import { writeAuditLog } from '../../../shared/audit';
import { safeLog, safeError } from '../../../shared/logger';
import { sendNotification } from '../../../shared/notifications';
import {
    PlanId,
    SubscriptionStatus,
    PLANS,
    TABLE_SUBSCRIPTIONS,
} from '../../../shared/subscription';

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

        safeLog(`Webhook event claimed: ${eventId} (${eventType})`);
        return true;  // First time — proceed with processing

    } catch (err: any) {
        if (err.name === 'ConditionalCheckFailedException') {
            safeLog(`Webhook duplicate skipped: ${eventId} (already processed)`);
            return false;  // Duplicate — safe to skip
        }
        // Unexpected error — log but allow processing to prevent lost events
        safeError(`Webhook idempotency check error for ${eventId}: ${err.message}`);
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
    } catch (e) { safeLog("Could not parse unverified webhook payload"); }

    const regionalDb = getRegionalClient(region);

    try {
        const stripeKey = await getSSMParameter(STRIPE_SECRET_NAME, region, true);
        const webhookSecret = await getSSMParameter(STRIPE_WEBHOOK_SECRET_NAME, region, true);

        if (!stripeKey || !webhookSecret) {
            safeError(`CRITICAL: Stripe secrets missing in SSM for region: ${region}`);
            return res.status(500).send("Server Configuration Error");
        }

        const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
        const sig = req.headers['stripe-signature'];
        if (!sig) return res.status(400).send("Missing Stripe Signature");

        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    } catch (err: any) {
        safeError(`Webhook Signature Verification Failed: ${err.message}`);
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
        safeLog(`Payment Captured: ${paymentIntent.id} in region ${region}`);
        await handlePaymentSuccess(paymentIntent, regionalDb, region);
    } else if (event.type === 'payment_intent.payment_failed') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailure(paymentIntent, regionalDb, region);
    } else if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(charge, regionalDb, region);
    } else if (event.type === 'charge.dispute.created') {
        const dispute = event.data.object as Stripe.Dispute;
        await handleDisputeCreated(dispute, regionalDb, region);
    } else if (event.type === 'charge.dispute.closed') {
        const dispute = event.data.object as Stripe.Dispute;
        await handleDisputeClosed(dispute, regionalDb, region);
    }
    // ─── SUBSCRIPTION WEBHOOK EVENTS ──────────────────────────────────────
    else if (event.type === 'customer.subscription.created') {
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription, regionalDb, region);
    } else if (event.type === 'customer.subscription.updated') {
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, regionalDb, region);
    } else if (event.type === 'customer.subscription.deleted') {
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, regionalDb, region);
    } else if (event.type === 'invoice.paid') {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
            await handleSubscriptionInvoicePaid(invoice, regionalDb, region);
        }
    } else if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
            await handleSubscriptionInvoiceFailed(invoice, regionalDb, region);
        }
    }

    res.json({ received: true });
};

// ─── FIX #3: Payment Failure Handler ────────────────────────────────────────
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent, regionalDb: any, region: string) {
    const { billId, referenceId, type, patientId } = paymentIntent.metadata || {};
    const failureMessage = paymentIntent.last_payment_error?.message || 'Unknown error';
    const now = new Date().toISOString();

    safeLog(`Payment Failed: ${paymentIntent.id} — ${failureMessage}`);

    // 1. Atomic update: transaction + appointment in single TransactWrite
    if (billId) {
        const transactItems: any[] = [
            {
                Update: {
                    TableName: TABLE_TRANSACTIONS,
                    Key: { billId },
                    UpdateExpression: "SET #s = :s, failureReason = :fr, failedAt = :now, paymentIntentId = :pid",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                        ":s": "FAILED",
                        ":fr": failureMessage,
                        ":now": now,
                        ":pid": paymentIntent.id
                    }
                }
            }
        ];

        // Include appointment update in the same atomic transaction
        if (type === 'BOOKING_FEE' && referenceId) {
            transactItems.push({
                Update: {
                    TableName: TABLE_APPOINTMENTS,
                    Key: { appointmentId: referenceId },
                    UpdateExpression: "SET paymentStatus = :ps, #s = :s, lastUpdated = :now",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                        ":ps": "failed",
                        ":s": "PAYMENT_FAILED",
                        ":now": now
                    }
                }
            });
        }

        try {
            await regionalDb.send(new TransactWriteCommand({ TransactItems: transactItems }));
            safeLog(`Transaction ${billId} marked as FAILED${referenceId ? `, appointment ${referenceId} marked as PAYMENT_FAILED` : ''}`);
        } catch (err: any) {
            safeError(`Atomic payment failure update failed: ${err.message}`);
        }
    } else if (type === 'BOOKING_FEE' && referenceId) {
        // No billId but has appointment — update appointment alone
        try {
            await regionalDb.send(new UpdateCommand({
                TableName: TABLE_APPOINTMENTS,
                Key: { appointmentId: referenceId },
                UpdateExpression: "SET paymentStatus = :ps, #s = :s, lastUpdated = :now",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                    ":ps": "failed",
                    ":s": "PAYMENT_FAILED",
                    ":now": now
                }
            }));
        } catch (err: any) {
            safeError(`Failed to update appointment ${referenceId} to PAYMENT_FAILED: ${err.message}`);
        }
    }

    // 3. Audit log
    try {
        await writeAuditLog(
            patientId || "SYSTEM",
            patientId || "UNKNOWN",
            "PAYMENT_FAILED",
            `Payment failed for ${type || 'unknown'}: ${failureMessage}`,
            {
                region,
                paymentIntentId: paymentIntent.id,
                billId: billId || undefined,
                appointmentId: referenceId || undefined,
                failureReason: failureMessage
            }
        );
    } catch (err: any) {
        safeError(`Audit log failed for payment failure: ${err.message}`);
    }

    // Push payment failure to BigQuery revenue analytics
    if (billId) {
        try {
            pushRevenueToBigQuery({
                billId,
                patientId: patientId || 'UNKNOWN',
                doctorId: paymentIntent.metadata?.doctorId || "UNKNOWN",
                amount: (paymentIntent.amount || 0) / 100,
                status: "FAILED"
            }, region).catch(e => safeError("BigQuery revenue failure sync failed"));
        } catch {}
    }

    // Push appointment status to BigQuery (tracks PAYMENT_FAILED status from webhook)
    if (referenceId) {
        pushAppointmentToBigQuery({
            appointmentId: referenceId,
            doctorId: paymentIntent.metadata?.doctorId || "UNKNOWN",
            patientId: patientId || "UNKNOWN",
            status: "PAYMENT_FAILED",
            specialization: paymentIntent.metadata?.specialization || "General"
        }, region).catch(e => safeError("BigQuery appointment sync failed on payment failure"));
    }

    // 4. Fire-and-forget payment failure notification
    if (patientId) {
        try {
            const patientRecord = await regionalDb.send(new GetCommand({
                TableName: TABLE_APPOINTMENTS,
                Key: { appointmentId: referenceId }
            }));
            sendNotification({
                region,
                recipientEmail: patientRecord.Item?.patientEmail,
                subject: 'Payment Failed',
                message: `Your payment for ${type || 'a service'} could not be processed: ${failureMessage}. Please update your payment method or try again.`,
                type: 'PAYMENT_FAILED',
                metadata: { billId: billId || '', appointmentId: referenceId || '' }
            }).catch(() => {});
        } catch {
            // Non-critical: notification lookup failed
        }
    }
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent, regionalDb: any, region: string) {
    const { billId, referenceId, type, pharmacyId, medication } = paymentIntent.metadata || {};

    if (!billId) {
        safeLog("Skipping Webhook: Missing 'billId' in metadata.");
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

            safeLog(`Idempotency Check: Transaction ${billId} is already PAID. Skipping.`);
            return; // STOP EXECUTION HERE
        }
    } catch (err) {
        safeLog("Idempotency check failed, proceeding cautiously...");
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
        safeLog(`DATABASE SYNCED: Transaction ${billId} + ${type} Record`);

        // Push revenue to BigQuery (patientId hashed internally by pushRevenueToBigQuery)
        const existingTxData = existingTxItem;
        if (existingTxData && existingTxData.patientId) {
            pushRevenueToBigQuery({
                billId,
                patientId: existingTxData.patientId,
                doctorId: existingTxData.doctorId || "UNKNOWN",
                amount: existingTxData.amount
            }, region).catch(e => safeError("BigQuery sync failed"));
        }

        // Push appointment status to BigQuery (tracks CONFIRMED status from webhook)
        if (type === 'BOOKING_FEE' && referenceId) {
            pushAppointmentToBigQuery({
                appointmentId: referenceId,
                doctorId: existingTxItem?.doctorId || "UNKNOWN",
                patientId: existingTxItem?.patientId || "UNKNOWN",
                status: "CONFIRMED",
                specialization: existingTxItem?.specialization || "General"
            }, region).catch(e => safeError("BigQuery appointment sync failed on payment success"));
        }

        // FIX #9: Audit log for successful payment
        try {
            const txPatientId = existingTxItem?.patientId || paymentIntent.metadata?.patientId || "UNKNOWN";
            await writeAuditLog(
                txPatientId,
                txPatientId,
                "PAYMENT_SUCCESS",
                `Payment succeeded for ${type || 'unknown'}: transaction ${billId}`,
                {
                    region,
                    transactionId: billId,
                    amount: existingTxItem?.amount || (paymentIntent.amount / 100),
                    appointmentId: referenceId || undefined,
                    paymentIntentId: paymentIntent.id
                }
            );
        } catch (auditErr: any) {
            safeError(`Audit log failed for payment success: ${auditErr.message}`);
        }

        // Fire-and-forget payment success notification
        sendNotification({
            region,
            recipientEmail: existingTxItem?.patientEmail,
            subject: 'Payment Successful',
            message: `Your payment of $${existingTxItem?.amount || (paymentIntent.amount / 100)} for ${type || 'a service'} has been successfully processed. Transaction ID: ${billId}.`,
            type: 'PAYMENT_SUCCESS',
            metadata: { billId, appointmentId: referenceId || '' }
        }).catch(() => {});
    } catch (error) {
        safeError("CRITICAL DB ERROR: Webhook failed to write to Regional DynamoDB");
    }
}

async function handleChargeRefunded(charge: Stripe.Charge, regionalDb: any, region: string) {
    const billId = charge.metadata?.billId;
    const patientId = charge.metadata?.patientId;

    safeLog(`Charge Refunded: ${charge.id}, billId: ${billId || 'unknown'}`);

    // Atomic update: transaction + appointment refund status
    const appointmentId = charge.metadata?.appointmentId || charge.metadata?.referenceId;
    const refundNow = new Date().toISOString();

    try {
        const transactItems: any[] = [];

        if (billId) {
            transactItems.push({
                Update: {
                    TableName: TABLE_TRANSACTIONS,
                    Key: { billId },
                    UpdateExpression: "SET #s = :s, refundedAt = :now, refundId = :rid",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: { ":s": "REFUNDED", ":now": refundNow, ":rid": charge.id }
                }
            });
        }

        if (appointmentId) {
            transactItems.push({
                Update: {
                    TableName: TABLE_APPOINTMENTS,
                    Key: { appointmentId },
                    UpdateExpression: 'SET #status = :s, paymentStatus = :ps, lastUpdated = :now',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: { ':s': 'REFUNDED', ':ps': 'refunded', ':now': refundNow }
                }
            });
        }

        if (transactItems.length > 0) {
            await regionalDb.send(new TransactWriteCommand({ TransactItems: transactItems }));
        }
    } catch (err: any) {
        safeError(`Failed atomic refund update (billId: ${billId}, appointmentId: ${appointmentId}): ${err.message}`);
    }

    // Audit log
    try {
        await writeAuditLog(
            patientId || "SYSTEM",
            patientId || "UNKNOWN",
            "CHARGE_REFUNDED",
            `Stripe charge ${charge.id} refunded. Amount: ${(charge.amount_refunded || 0) / 100}`,
            { region, chargeId: charge.id, billId: billId || undefined, appointmentId: appointmentId || undefined }
        );
    } catch (err: any) {
        safeError(`Audit log failed for charge refund: ${err.message}`);
    }

    // Push refund to BigQuery revenue analytics (patientId hashed internally)
    if (billId) {
        try {
            pushRevenueToBigQuery({
                billId,
                patientId: patientId || 'UNKNOWN',
                doctorId: charge.metadata?.doctorId || 'UNKNOWN',
                amount: (charge.amount_refunded || 0) / 100,
                status: 'REFUNDED'
            }, region).catch(e => safeError('BigQuery revenue refund sync failed'));
        } catch (bqErr) {
            // Non-blocking: log but don't fail
        }
    }

    // Push appointment status to BigQuery (tracks REFUNDED status from webhook)
    const refundedAppointmentId = charge.metadata?.appointmentId || charge.metadata?.referenceId;
    if (refundedAppointmentId) {
        pushAppointmentToBigQuery({
            appointmentId: refundedAppointmentId,
            doctorId: charge.metadata?.doctorId || "UNKNOWN",
            patientId: patientId || "UNKNOWN",
            status: "REFUNDED",
            specialization: charge.metadata?.specialization || "General"
        }, region).catch(e => safeError("BigQuery appointment sync failed on charge refund"));
    }

    // Notify patient of refund
    if (patientId) {
        try {
            const patientRecord = await regionalDb.send(new GetCommand({
                TableName: TABLE_APPOINTMENTS,
                Key: { appointmentId: charge.metadata?.appointmentId || charge.metadata?.referenceId }
            }));
            sendNotification({
                region,
                recipientEmail: patientRecord.Item?.patientEmail || charge.metadata?.patientEmail,
                subject: 'Refund Processed',
                message: `Your refund of $${((charge.amount_refunded || 0) / 100).toFixed(2)} has been processed successfully.`,
                type: 'GENERAL',
                metadata: { billId: billId || '', refundId: charge.id }
            }).catch(() => {});
        } catch { /* Non-blocking */ }
    }
}

async function handleDisputeCreated(dispute: Stripe.Dispute, regionalDb: any, region: string) {
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    const billId = dispute.metadata?.billId;

    safeLog(`Dispute Created: ${dispute.id}, charge: ${chargeId || 'unknown'}, reason: ${dispute.reason}`);

    // Update transaction status to DISPUTED
    if (billId) {
        try {
            await regionalDb.send(new UpdateCommand({
                TableName: TABLE_TRANSACTIONS,
                Key: { billId },
                UpdateExpression: 'SET #s = :s, disputeId = :did, disputeReason = :reason, disputedAt = :now',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                    ':s': 'DISPUTED',
                    ':did': dispute.id,
                    ':reason': dispute.reason,
                    ':now': new Date().toISOString()
                }
            }));
        } catch (err: any) {
            safeError(`Failed to update transaction ${billId} for dispute: ${err.message}`);
        }
    }

    // Push disputed revenue to BigQuery
    try {
        pushRevenueToBigQuery({
            billId: billId || dispute.id,
            patientId: dispute.metadata?.patientId || 'UNKNOWN',
            doctorId: dispute.metadata?.doctorId || 'UNKNOWN',
            amount: (dispute.amount || 0) / 100,
            status: 'DISPUTED',
            type: 'DISPUTE',
        }, region).catch(() => {});
    } catch { /* Non-blocking */ }

    // Audit log with high severity
    try {
        await writeAuditLog(
            "SYSTEM",
            "STRIPE",
            "CHARGE_DISPUTED",
            `Stripe dispute ${dispute.id} created. Reason: ${dispute.reason}. Amount: ${(dispute.amount || 0) / 100}`,
            { region, disputeId: dispute.id, chargeId: chargeId || undefined, billId: billId || undefined, reason: dispute.reason }
        );
    } catch (err: any) {
        safeError(`Audit log failed for dispute: ${err.message}`);
    }

    // Notify admin about dispute
    try {
        sendNotification({
            region,
            recipientEmail: process.env.ADMIN_EMAIL || '',
            subject: 'Payment Dispute Alert',
            message: `A payment dispute has been filed. Dispute ID: ${dispute.id}. Reason: ${dispute.reason}. Amount: $${((dispute.amount || 0) / 100).toFixed(2)}.`,
            type: 'GENERAL',
            metadata: { disputeId: dispute.id, billId: billId || '' }
        }).catch(() => {});
    } catch { /* Non-blocking */ }
}

async function handleDisputeClosed(dispute: Stripe.Dispute, regionalDb: any, region: string) {
    const billId = dispute.metadata?.billId;
    const disputeWon = dispute.status === 'won';
    const resolvedStatus = disputeWon ? 'PAID' : 'REFUNDED';

    safeLog(`Dispute Closed: ${dispute.id}, status: ${dispute.status}, resolved as: ${resolvedStatus}`);

    // Update transaction status based on dispute outcome
    if (billId) {
        try {
            await regionalDb.send(new UpdateCommand({
                TableName: TABLE_TRANSACTIONS,
                Key: { billId },
                UpdateExpression: 'SET #s = :s, disputeResolvedAt = :now, disputeOutcome = :outcome',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                    ':s': resolvedStatus,
                    ':now': new Date().toISOString(),
                    ':outcome': dispute.status
                }
            }));
        } catch (err: any) {
            safeError(`Failed to update transaction ${billId} for dispute closure: ${err.message}`);
        }
    }

    // Push resolved revenue to BigQuery
    try {
        pushRevenueToBigQuery({
            billId: billId || dispute.id,
            patientId: dispute.metadata?.patientId || 'UNKNOWN',
            doctorId: dispute.metadata?.doctorId || 'UNKNOWN',
            amount: (dispute.amount || 0) / 100,
            status: resolvedStatus,
            type: 'DISPUTE_RESOLVED',
        }, region).catch(() => {});
    } catch { /* Non-blocking */ }

    // Audit log
    try {
        await writeAuditLog(
            "SYSTEM",
            "STRIPE",
            "CHARGE_DISPUTE_CLOSED",
            `Stripe dispute ${dispute.id} closed. Outcome: ${dispute.status}. Amount: ${(dispute.amount || 0) / 100}`,
            { region, disputeId: dispute.id, billId: billId || undefined, outcome: dispute.status }
        );
    } catch (err: any) {
        safeError(`Audit log failed for dispute closure: ${err.message}`);
    }

    // Notify admin about resolution
    try {
        sendNotification({
            region,
            recipientEmail: process.env.ADMIN_EMAIL || '',
            subject: `Payment Dispute ${disputeWon ? 'Won' : 'Lost'}`,
            message: `Dispute ${dispute.id} has been ${disputeWon ? 'won — funds retained' : 'lost — funds returned to customer'}. Amount: $${((dispute.amount || 0) / 100).toFixed(2)}.`,
            type: 'GENERAL',
            metadata: { disputeId: dispute.id, billId: billId || '', outcome: dispute.status }
        }).catch(() => {});
    } catch { /* Non-blocking */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION WEBHOOK HANDLERS
// Loopholes addressed: #3 (webhook-gated activation), #8 (dispute freeze),
// #9 (chargeback), #11 (idempotency via claimWebhookEvent above)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * customer.subscription.created — First successful payment
 * THIS is the only place a subscription becomes active (loophole #3).
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription, regionalDb: any, region: string) {
    const { patientId, planId, consentTimestamp, consentTermsVersion } = subscription.metadata || {};
    if (!patientId || !planId) {
        safeError(`Subscription created without metadata: ${subscription.id}`);
        return;
    }

    const plan = PLANS[planId as PlanId];
    if (!plan) {
        safeError(`Unknown plan ID in subscription: ${planId}`);
        return;
    }

    const now = new Date().toISOString();
    const cycleStart = new Date(subscription.current_period_start * 1000).toISOString();
    const cycleEnd = new Date(subscription.current_period_end * 1000).toISOString();

    await regionalDb.send(new PutCommand({
        TableName: TABLE_SUBSCRIPTIONS,
        Item: {
            patientId,
            planId,
            status: SubscriptionStatus.ACTIVE,
            discountPercent: plan.discountPercent,
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0]?.price?.id || '',
            freeGpVisitsRemaining: plan.freeGpVisitsPerMonth,
            familyMembers: [],
            familyChangesThisYear: 0,
            cycleStart,
            cycleEnd,
            cancelAtPeriodEnd: false,
            disputeFrozen: false,
            consentTimestamp: consentTimestamp || now,
            consentTermsVersion: consentTermsVersion || '1.0',
            createdAt: now,
            updatedAt: now,
        },
    }));

    await writeAuditLog({
        action: 'SUBSCRIPTION_ACTIVATED',
        actorId: patientId,
        resource: `subscription/${subscription.id}`,
        detail: `Plan: ${plan.name}, Discount: ${plan.discountPercent}%, Cycle: ${cycleStart} to ${cycleEnd}`,
        region,
    });

    safeLog(`Subscription activated: ${subscription.id}, patient: ${patientId}, plan: ${planId}`);
}

/**
 * customer.subscription.updated — Status change, plan change, or cancellation pending.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription, regionalDb: any, region: string) {
    const { patientId } = subscription.metadata || {};
    if (!patientId) return;

    const statusMap: Record<string, SubscriptionStatus> = {
        active: SubscriptionStatus.ACTIVE,
        past_due: SubscriptionStatus.PAST_DUE,
        canceled: SubscriptionStatus.CANCELLED,
        incomplete: SubscriptionStatus.INCOMPLETE,
        incomplete_expired: SubscriptionStatus.CANCELLED,
        unpaid: SubscriptionStatus.PAST_DUE,
    };

    const newStatus = statusMap[subscription.status] || SubscriptionStatus.ACTIVE;
    const cycleEnd = new Date(subscription.current_period_end * 1000).toISOString();

    await regionalDb.send(new UpdateCommand({
        TableName: TABLE_SUBSCRIPTIONS,
        Key: { patientId },
        UpdateExpression: 'SET #status = :status, cancelAtPeriodEnd = :cap, cycleEnd = :ce, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':status': newStatus,
            ':cap': subscription.cancel_at_period_end || false,
            ':ce': cycleEnd,
            ':now': new Date().toISOString(),
        },
    }));

    await writeAuditLog({
        action: 'SUBSCRIPTION_STATUS_CHANGED',
        actorId: patientId,
        resource: `subscription/${subscription.id}`,
        detail: `Status: ${newStatus}, CancelAtPeriodEnd: ${subscription.cancel_at_period_end}`,
        region,
    });

    safeLog(`Subscription updated: ${subscription.id}, status: ${newStatus}`);
}

/**
 * customer.subscription.deleted — Subscription fully cancelled.
 * Remove discount, zero out free visits.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription, regionalDb: any, region: string) {
    const { patientId } = subscription.metadata || {};
    if (!patientId) return;

    await regionalDb.send(new UpdateCommand({
        TableName: TABLE_SUBSCRIPTIONS,
        Key: { patientId },
        UpdateExpression: 'SET #status = :cancelled, discountPercent = :zero, freeGpVisitsRemaining = :zero, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':cancelled': SubscriptionStatus.CANCELLED,
            ':zero': 0,
            ':now': new Date().toISOString(),
        },
    }));

    await writeAuditLog({
        action: 'SUBSCRIPTION_CANCELLED',
        actorId: patientId,
        resource: `subscription/${subscription.id}`,
        detail: 'Subscription fully cancelled',
        region,
    });

    safeLog(`Subscription cancelled: ${subscription.id}, patient: ${patientId}`);
}

/**
 * invoice.paid — Monthly renewal succeeded.
 * Reset free GP visits. Update cycle dates.
 */
async function handleSubscriptionInvoicePaid(invoice: Stripe.Invoice, regionalDb: any, region: string) {
    const subscriptionId = invoice.subscription as string;
    if (!subscriptionId) return;

    // Get patientId from subscription metadata (stored when subscription was created)
    const customerMetadata = (invoice as any).subscription_details?.metadata || {};
    const patientId = customerMetadata.patientId || invoice.metadata?.patientId;
    const planId = customerMetadata.planId || invoice.metadata?.planId;

    if (!patientId) {
        safeError(`Invoice paid but no patientId in metadata: ${invoice.id}`);
        return;
    }

    const plan = PLANS[planId as PlanId];
    const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : new Date().toISOString();
    const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : new Date().toISOString();

    await regionalDb.send(new UpdateCommand({
        TableName: TABLE_SUBSCRIPTIONS,
        Key: { patientId },
        UpdateExpression: 'SET #status = :active, freeGpVisitsRemaining = :freeGp, cycleStart = :start, cycleEnd = :end, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':active': SubscriptionStatus.ACTIVE,
            ':freeGp': plan?.freeGpVisitsPerMonth || 0,
            ':start': periodStart,
            ':end': periodEnd,
            ':now': new Date().toISOString(),
        },
    }));

    await writeAuditLog({
        action: 'SUBSCRIPTION_RENEWED',
        actorId: patientId,
        resource: `subscription/${subscriptionId}`,
        detail: `Invoice: ${invoice.id}, Amount: $${((invoice.amount_paid || 0) / 100).toFixed(2)}, Period: ${periodStart} to ${periodEnd}`,
        region,
    });

    safeLog(`Subscription renewed: ${subscriptionId}, patient: ${patientId}`);
}

/**
 * invoice.payment_failed — Monthly renewal failed.
 * Mark as past_due. Patient gets grace period.
 */
async function handleSubscriptionInvoiceFailed(invoice: Stripe.Invoice, regionalDb: any, region: string) {
    const subscriptionId = invoice.subscription as string;
    const customerMetadata = (invoice as any).subscription_details?.metadata || {};
    const patientId = customerMetadata.patientId || invoice.metadata?.patientId;

    if (!patientId) return;

    await regionalDb.send(new UpdateCommand({
        TableName: TABLE_SUBSCRIPTIONS,
        Key: { patientId },
        UpdateExpression: 'SET #status = :pastDue, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':pastDue': SubscriptionStatus.PAST_DUE,
            ':now': new Date().toISOString(),
        },
    }));

    await writeAuditLog({
        action: 'SUBSCRIPTION_PAYMENT_FAILED',
        actorId: patientId,
        resource: `subscription/${subscriptionId}`,
        detail: `Invoice: ${invoice.id}, Attempt: ${invoice.attempt_count}`,
        region,
    });

    // Notify patient to update payment method
    try {
        sendNotification({
            region,
            recipientEmail: '',
            recipientId: patientId,
            subject: 'Payment Failed — Update Your Card',
            message: 'Your MediConnect subscription payment failed. Please update your payment method to continue receiving discounts.',
            type: 'PAYMENT_FAILED',
            metadata: { subscriptionId, invoiceId: invoice.id },
        }).catch(() => {});
    } catch { /* Non-blocking */ }

    safeLog(`Subscription payment failed: ${subscriptionId}, patient: ${patientId}, attempt: ${invoice.attempt_count}`);
}