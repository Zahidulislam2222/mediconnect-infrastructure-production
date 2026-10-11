import { createStripeClient } from '../providers/stripe';
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
import { TABLE_NAMES, requiredResourceName, setting, getWebhookSettings } from '../../../shared/settings';
import { REFUND_NOTICES, REFUND_WEBHOOK_COPY, type RefundStatus } from '../content/cancellation';
import { MANUAL_REFUND_LEDGER_STATUS, refundBillId } from '../cancellation-policy';
import { notifyPatient, patientContactEmail } from '../patient-contact';
import { PAYABLE_BILL_STATUSES } from '../../../shared/billing-status';
import { DISPENSED_STATUSES, DISPENSE_EVIDENCE, lastHandover, observedPrescriptionCondition } from '../../../shared/prescription-handover';
import { findPrescriptionBills } from '../../../shared/prescription-ledger';

import { claimEvent, completeEvent, releaseEvent, eventClaimCondition, type EventClaim } from '../webhook-event';
import { resolveAuthRegion } from '../../../shared/region-context';

const TABLE_PRESCRIPTIONS = setting("TABLE_PRESCRIPTIONS");
const TABLE_APPOINTMENTS = setting("TABLE_APPOINTMENTS");
const TABLE_INVENTORY = TABLE_NAMES.inventory;

export const handleStripeWebhook = async (req: Request, res: Response) => {
    let event: Stripe.Event;

    let region: string;
    try {
        const unverifiedPayload = JSON.parse(req.body.toString());
        region = unverifiedPayload.data?.object?.metadata?.region ?? setting('AWS_REGION');
        resolveAuthRegion(region);
    } catch {
        return res.status(400).json({ received: false });
    }
    const regionalDb = getRegionalClient(region);
    let stripe: Stripe;
    let webhookSecret: string;
    try {
        const config = getWebhookSettings();
        const stripeKey = await getSSMParameter(config.parameterPath, region, true);
        const secret = await getSSMParameter(config.webhookParameterPath, region, true);
        if (!stripeKey || !secret) throw new Error('Webhook provider configuration unavailable');
        stripe = createStripeClient(stripeKey);
        webhookSecret = secret;
    } catch {
        safeError('[WEBHOOK] Provider configuration unavailable; delivery must retry');
        return res.status(503).json({ received: false });
    }
    try {
        const sig = req.headers['stripe-signature'];
        if (!sig) return res.status(400).send('Missing Stripe Signature');
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch {
        return res.status(400).send('Invalid Stripe Signature');
    }
    let claim: EventClaim;
    try {
        claim = await claimEvent(regionalDb, event.id, event.type, region);
    } catch {
        safeError('[WEBHOOK] Claim store unavailable; delivery must retry');
        return res.status(503).json({ received: false });
    }
    if (claim.state === 'completed') return res.json({ received: true, deduplicated: true });
    if (claim.state === 'busy') return res.status(503).json({ received: false });
    try {
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            safeLog(`Payment Captured: ${paymentIntent.id} in region ${region}`);
            await handlePaymentSuccess(paymentIntent, regionalDb, region);
        } else if (event.type === 'payment_intent.payment_failed') {
            await handlePaymentFailure(event.data.object as Stripe.PaymentIntent, regionalDb, region);
        } else if (event.type === 'charge.refunded') {
            const charge = event.data.object as Stripe.Charge;
            await handleChargeRefunded(charge, regionalDb, region);
        } else if (['refund.updated', 'charge.refund.updated'].includes(event.type as string)) {
            await handleRefundUpdated(event.data.object as Stripe.Refund, regionalDb, region);
        } else if ((event.type as string) === 'refund.failed') {
            // The pinned SDK types predate refund.failed (added to Event.type in API 2024-10-28.acacia).
            await handleRefundFailed((event as Stripe.Event).data.object as Stripe.Refund, regionalDb, region);
        } else if (event.type === 'charge.dispute.created') {
            const dispute = event.data.object as Stripe.Dispute;
            await handleDisputeCreated(dispute, regionalDb, region);
        } else if (event.type === 'charge.dispute.closed') {
            const dispute = event.data.object as Stripe.Dispute;
            await handleDisputeClosed(dispute, regionalDb, region);
        }
        // ─── SUBSCRIPTION WEBHOOK EVENTS ──────────────────────────────────────
        else if (event.type === 'customer.subscription.created') {
            await handleSubscriptionCreated(event.data.object as Stripe.Subscription, regionalDb, region, { eventId: event.id, token: claim.token, created: event.created });
        } else if (event.type === 'customer.subscription.updated') {
            await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, regionalDb, region, { eventId: event.id, token: claim.token, created: event.created });
        } else if (event.type === 'customer.subscription.deleted') {
            await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, regionalDb, region, { eventId: event.id, token: claim.token, created: event.created });
        } else if (event.type === 'invoice.paid') {
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.subscription) {
                await handleSubscriptionInvoicePaid(invoice, regionalDb, region, { eventId: event.id, token: claim.token, created: event.created });
            }
        } else if (event.type === 'invoice.payment_failed') {
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.subscription) {
                await handleSubscriptionInvoiceFailed(invoice, regionalDb, region, { eventId: event.id, token: claim.token, created: event.created });
            }
        }

        await completeEvent(regionalDb, event.id, claim.token);
        return res.json({ received: true });
    } catch {
        await releaseEvent(regionalDb, event.id, claim.token)
            .catch(() => safeError('[WEBHOOK] Claim release failed; lease recovery required'));
        safeError('[WEBHOOK] Durable processing failed; delivery must retry');
        return res.status(503).json({ received: false });
    }
};

// ─── FIX #3: Payment Failure Handler ────────────────────────────────────────
async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent, regionalDb: any, region: string) {
    const { billId, referenceId, type, patientId } = paymentIntent.metadata || {};
    const failureMessage = paymentIntent.last_payment_error?.message || 'Unknown error';
    const now = new Date().toISOString();

    safeLog(`Payment Failed: ${paymentIntent.id} — ${failureMessage}`);

    // 1. Atomic update: transaction + appointment in single TransactWrite
    if (billId) {
        // Only a bill /billing/pay may still charge can fail: a late or stale event never reopens a paid, refunded,
        // disputed or under-review bill, and never creates a ledger row for an unknown billId.
        const payable = Object.fromEntries(PAYABLE_BILL_STATUSES.map((status, i) => [`:payable${i}`, status]));
        const transactItems: any[] = [
            {
                Update: {
                    TableName: requiredResourceName("TABLE_TRANSACTIONS"),
                    Key: { billId },
                    UpdateExpression: "SET #s = :s, failureReason = :fr, failedAt = :now, paymentIntentId = :pid",
                    ConditionExpression: `#s IN (${Object.keys(payable).join(', ')}) AND attribute_not_exists(reviewReason)`,
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                        ":s": "FAILED",
                        ":fr": failureMessage,
                        ":now": now,
                        ":pid": paymentIntent.id,
                        ...payable
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
            if (err?.name === 'TransactionCanceledException' && err.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed') {
                safeLog(`[WEBHOOK] payment_failed ${paymentIntent.id} ignored: bill ${billId} is missing or no longer payable`);
                try {
                    await writeAuditLog(patientId || "SYSTEM", patientId || "UNKNOWN", "PAYMENT_FAILED",
                        `Payment failure for ${type || 'unknown'} ignored: bill is missing or no longer payable`,
                        { region, paymentIntentId: paymentIntent.id, billId, appointmentId: referenceId || undefined, failureReason: failureMessage });
                } catch (auditErr: unknown) {
                    safeError(`Audit log failed for ignored payment failure: ${auditErr instanceof Error ? auditErr.message : String(auditErr)}`);
                }
                return;
            }
            // Not recorded (throttled, or a conflict on either item): telling the patient or recording FAILED revenue now
            // would describe a ledger change that did not happen, so the caller asks Stripe to retry.
            const reasons = err?.CancellationReasons?.map((r: { Code?: string }) => r.Code ?? 'None').join(',');
            safeError(`Atomic payment failure update failed: ${err.message}${reasons ? ` (${reasons})` : ''}`);
            throw err;
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
        } catch { safeError("REVENUE_SYNC_FAILED"); }
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

    // 4. Payment failure notice to the patient's profile email; never throws.
    if (patientId) {
        await notifyPatient(regionalDb, patientId, region, `Payment failure notice for bill ${billId}`, {
            subject: 'Payment Failed',
            message: `Your payment for ${type || 'a service'} could not be processed: ${failureMessage}. Please update your payment method or try again.`,
            type: 'PAYMENT_FAILED',
            metadata: { billId: billId || '', appointmentId: referenceId || '' }
        });
    }
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent, regionalDb: any, region: string) {
    const { billId, referenceId, type, pharmacyId } = paymentIntent.metadata || {};

    if (!billId) {
        safeLog("Skipping Webhook: Missing 'billId' in metadata.");
        return;
    }

    // The ledger row decides what this payment is for, so an unreadable row fails the delivery and Stripe retries it.
    const existingTxItem: any = (await regionalDb.send(new GetCommand({
        TableName: requiredResourceName("TABLE_TRANSACTIONS"),
        Key: { billId },
        ConsistentRead: true
    }))).Item;

    if (existingTxItem && existingTxItem.status === 'PAID') {
        if (existingTxItem.pharmacyStockStatus === 'PENDING') {
            await decrementPharmacyStock(regionalDb, billId, paymentIntent.id, existingTxItem);
        }
        safeLog(`Idempotency Check: Transaction ${billId} is already PAID. Skipping.`);
        return; // STOP EXECUTION HERE
    }

    const timestamp = new Date().toISOString();
    const transactItems: any[] = [];

    // ACTION A: Update the Ledger
    transactItems.push({
        Update: {
            TableName: requiredResourceName("TABLE_TRANSACTIONS"),
            Key: { billId },
            UpdateExpression: "SET #s = :s, paymentIntentId = :pid, paidAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ConditionExpression: `${PAYABLE_BILL_CONDITION} AND attribute_not_exists(reviewReason)`,
            ExpressionAttributeValues: { ":s": "PAID", ":pid": paymentIntent.id, ":now": timestamp, ...PAYABLE_BILL_VALUES }
        }
    });

    // ACTION B: Sync Source
    // The ledger row is authoritative: /billing/pay intents carry only billId, patientId, type and region, and
    // refill bills written before typed refills have no type (/billing/pay then reports PHARMACY).
    const paymentType = existingTxItem?.type ?? type;
    const prescriptionId = paymentType === 'PHARMACY' ? (existingTxItem?.referenceId ?? referenceId) : undefined;
    if (paymentType === 'PHARMACY' && !existingTxItem) {
        // /billing/pay only charges existing bills, so the row was removed after charging (erasure anonymises ledger rows
        // but does not delete them). Record the captured money for reconciliation rather than failing until Stripe gives
        // up; nothing is released to pickup. The payment intent identifies the payer, so no patient identifier is copied
        // from metadata onto a row that erasure may already have processed.
        try {
            await regionalDb.send(new PutCommand({
                TableName: requiredResourceName("TABLE_TRANSACTIONS"),
                Item: {
                    billId, type: 'PHARMACY', status: 'PAID', reviewReason: 'LEDGER_ROW_MISSING', paymentIntentId: paymentIntent.id,
                    amountMinor: paymentIntent.amount, currency: paymentIntent.currency, paidAt: timestamp
                },
                ConditionExpression: "attribute_not_exists(billId)"
            }));
        } catch (recordErr) {
            if ((recordErr as { name?: string })?.name !== 'ConditionalCheckFailedException') throw recordErr;
            // Done only if the row that won records this same payment (a concurrent delivery of it); anything else
            // stays unacknowledged so Stripe retries and the mismatch is investigated.
            const recorded = await regionalDb.send(new GetCommand({ TableName: requiredResourceName("TABLE_TRANSACTIONS"), Key: { billId }, ConsistentRead: true }));
            if (recorded.Item?.paymentIntentId !== paymentIntent.id) throw recordErr;
        }
        safeError(`[WEBHOOK] Payment ${billId} has no ledger row; recorded for reconciliation`);
        return;
    }
    if (prescriptionId) {
        // Each bill is paid once, and only from a payable status: never over a PAID or REFUNDED row. CANCELLED is
        // payable because money captured during a cancellation must still be recorded. The fill must still await
        // collection: ISSUED (first fill) or PENDING (refill, which may still carry the previous fill's PAID flag).
        transactItems[0].Update.ConditionExpression = PAYABLE_BILL_CONDITION;
        Object.assign(transactItems[0].Update.ExpressionAttributeValues, PAYABLE_BILL_VALUES);
        const stockRx = (await regionalDb.send(new GetCommand({
            TableName: TABLE_PRESCRIPTIONS, Key: { prescriptionId }, ConsistentRead: true,
        }))).Item;
        const stockDrugId = typeof stockRx?.medication === 'string' ? stockRx.medication : '';
        const stockPharmacyId = stockRx?.pharmacyId || pharmacyId || setting('DEFAULT_PHARMACY_ID');
        Object.assign(transactItems[0].Update.ExpressionAttributeValues, {
            ':stockStatus': 'PENDING', ':stockDrug': stockDrugId, ':stockPharmacy': stockPharmacyId,
        });
        transactItems[0].Update.UpdateExpression += ', pharmacyStockStatus = :stockStatus, pharmacyStockDrugId = :stockDrug, pharmacyStockPharmacyId = :stockPharmacy';
        transactItems.push({
            Update: {
                TableName: TABLE_PRESCRIPTIONS,
                Key: { prescriptionId },
                UpdateExpression: "SET paymentStatus = :ps, #s = :rs, updatedAt = :now",
                ConditionExpression: "#s IN (:issued, :pending)",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: { ":ps": "PAID", ":rs": "READY_FOR_PICKUP", ":now": timestamp, ":issued": "ISSUED", ":pending": "PENDING" }
            }
        });
    } else if (paymentType === 'BOOKING_FEE' && (existingTxItem?.referenceId ?? referenceId)) {
        transactItems.push({
            Update: {
                TableName: TABLE_APPOINTMENTS,
                Key: { appointmentId: existingTxItem?.referenceId ?? referenceId },
                UpdateExpression: "SET paymentStatus = :ps, #s = :confirmed",
                ConditionExpression: "#s IN (:pending, :failed)",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: { ":ps": "paid", ":confirmed": "CONFIRMED", ":pending": "PENDING_PAYMENT", ":failed": "PAYMENT_FAILED" }
            }
        });
    }

    if (prescriptionId) {
        let settledDebt = false;
        try {
            await regionalDb.send(new TransactWriteCommand({ TransactItems: transactItems }));
        } catch (error) {
            const [ledger, prescription] = cancellationCodes(error);
            if (ledger === 'ConditionalCheckFailed') {
                safeLog(`Idempotency Check: Transaction ${billId} is no longer payable (paid or refunded). Skipping.`);
                return;
            }
            if (ledger !== 'None' || prescription !== 'ConditionalCheckFailed') throw error;
            settledDebt = await settleCollectedFillDebt(regionalDb, billId, existingTxItem, prescriptionId, paymentIntent.id, timestamp);
            if (!settledDebt) {
                // Money was captured for a fill that can no longer be collected: record it and flag it for refund review.
                const flagged = await regionalDb.send(new UpdateCommand({
                    TableName: requiredResourceName("TABLE_TRANSACTIONS"),
                    Key: { billId },
                    UpdateExpression: "SET #s = :s, paymentIntentId = :pid, paidAt = :now, reviewReason = :reason",
                    ConditionExpression: PAYABLE_BILL_CONDITION,
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: { ":s": "PAID", ":pid": paymentIntent.id, ":now": timestamp, ":reason": "PRESCRIPTION_NOT_PAYABLE", ...PAYABLE_BILL_VALUES }
                })).then(() => true, (ledgerError: unknown) => {
                    if ((ledgerError as { name?: string })?.name !== 'ConditionalCheckFailedException') throw ledgerError;
                    return false;
                });
                if (flagged) safeError(`[WEBHOOK] Payment ${billId} received for a prescription that is not awaiting payment; refund review required`);
                else safeLog(`Idempotency Check: Transaction ${billId} is no longer payable (paid or refunded). Skipping.`);
                return;
            }
            // A settled debt is a real payment, recorded below like any other; nothing is dispensed for it.
            safeLog(`[WEBHOOK] Payment ${billId} settled the unpaid bill of an already-collected fill`);
        }
        if (!settledDebt) {
            const recorded = (await regionalDb.send(new GetCommand({
                TableName: requiredResourceName('TABLE_TRANSACTIONS'), Key: { billId }, ConsistentRead: true,
            }))).Item;
            if (!recorded) throw new Error('Recorded pharmacy payment unavailable');
            await decrementPharmacyStock(regionalDb, billId, paymentIntent.id, recorded);
        }
    }

    try {
        // Record other payment types atomically; infrastructure failures request delivery retries.
        if (!prescriptionId) {
            try {
                await regionalDb.send(new TransactWriteCommand({ TransactItems: transactItems }));
            } catch (error) {
                const codes = cancellationCodes(error);
                if (codes[0] === 'None' && codes[1] === 'ConditionalCheckFailed' && paymentType === 'BOOKING_FEE') {
                    // Cancellation can win after capture. Keep the clinical lifecycle closed while recording the
                    // actual money and handing the refund decision to reconciliation. The payable condition fences
                    // a concurrent successful settlement or refund; database failures remain retryable.
                    try {
                        await regionalDb.send(new UpdateCommand({
                            TableName: requiredResourceName('TABLE_TRANSACTIONS'), Key: { billId },
                            UpdateExpression: 'SET #s = :s, paymentIntentId = :pid, paidAt = :now, reviewReason = :reason',
                            ConditionExpression: PAYABLE_BILL_CONDITION,
                            ExpressionAttributeNames: { '#s': 'status' },
                            ExpressionAttributeValues: { ':s': 'PAID', ':pid': paymentIntent.id, ':now': timestamp,
                                ':reason': 'APPOINTMENT_NOT_PAYABLE', ...PAYABLE_BILL_VALUES },
                        }));
                    } catch (reviewError: unknown) {
                        if ((reviewError as { name?: string })?.name !== 'ConditionalCheckFailedException') throw reviewError;
                    }
                    return;
                }
                if (codes[0] === 'ConditionalCheckFailed' && codes.every(code => ['None', 'ConditionalCheckFailed'].includes(code))) {
                    safeLog('[WEBHOOK] Settlement refused for a terminal or changed ledger');
                    return;
                }
                throw error;
            }
        }
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

        // Payment success notice to the patient's profile email; the bill's own patient comes first. Never throws.
        await notifyPatient(regionalDb, existingTxItem?.patientId || paymentIntent.metadata?.patientId, region,
            `Payment success notice for bill ${billId}`, {
                subject: 'Payment Successful',
                message: `Your payment of $${existingTxItem?.amount || (paymentIntent.amount / 100)} for ${type || 'a service'} has been successfully processed. Transaction ID: ${billId}.`,
                type: 'PAYMENT_SUCCESS',
                metadata: { billId, appointmentId: referenceId || '' }
            });
    } catch (error) {
        safeError("CRITICAL DB ERROR: Webhook failed to write to Regional DynamoDB");
        throw error;
    }
}

// Ledger statuses a pharmacy payment may settle: every status /billing/pay charges, plus CANCELLED (see above).
const SETTLEABLE_BILL_STATUSES: readonly string[] = [...PAYABLE_BILL_STATUSES, 'CANCELLED'];
const PAYABLE_BILL_VALUES = Object.fromEntries(SETTLEABLE_BILL_STATUSES.map((status, i) => [`:payable${i}`, status]));
const PAYABLE_BILL_CONDITION = `#s IN (${Object.keys(PAYABLE_BILL_VALUES).join(', ')})`;

/**
 * The retired pharmacy service issued pickup codes without checking payment, so a collected fill can still carry its
 * unpaid bill. That debt is the prescription's ONLY bill created at or before its last hand-over that is payable or
 * already under refund review; paying it marks the bill PAID and leaves the prescription alone. Two such bills cannot
 * be told apart from a double bill, so they, like any other payment or a bill or prescription that changed after it
 * was read, return false and the caller keeps flagging the payment for refund review.
 */
async function settleCollectedFillDebt(regionalDb: ReturnType<typeof getRegionalClient>, billId: string,
    bill: Record<string, unknown> | undefined, prescriptionId: string, paymentIntentId: string, timestamp: string): Promise<boolean> {
    const createdAt = bill?.createdAt;
    if (typeof createdAt !== 'string') return false;
    const rx = (await regionalDb.send(new GetCommand({ TableName: TABLE_PRESCRIPTIONS, Key: { prescriptionId }, ConsistentRead: true }))).Item;
    const handover = rx && lastHandover(rx);
    if (!rx || !DISPENSED_STATUSES.includes(rx.status) || handover === undefined || createdAt > handover) return false;
    // Both records were read consistently; the patient index is not, and may still list a bill that has since changed.
    if (typeof rx.patientId !== 'string' || bill?.patientId !== rx.patientId) return false;
    // A bill already flagged for review is PAID but still one of the bills this payment could be doubling.
    const debts = (await findPrescriptionBills(regionalDb, requiredResourceName("TABLE_TRANSACTIONS"), rx.patientId, prescriptionId))
        .filter(row => (SETTLEABLE_BILL_STATUSES.includes(row.status) || row.reviewReason !== undefined)
            && !(typeof row.createdAt === 'string' && row.createdAt > handover));
    if (debts.length !== 1 || debts[0].billId !== billId) return false;
    const pinned = observedPrescriptionCondition(rx, ['status', ...DISPENSE_EVIDENCE]);
    try {
        await regionalDb.send(new TransactWriteCommand({ TransactItems: [
            { Update: {
                TableName: requiredResourceName("TABLE_TRANSACTIONS"), Key: { billId },
                UpdateExpression: "SET #s = :s, paymentIntentId = :pid, paidAt = :now",
                // A bill already under refund review stays a refund case even if a later event made it look payable again.
                ConditionExpression: `${PAYABLE_BILL_CONDITION} AND attribute_not_exists(reviewReason)`,
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: { ":s": "PAID", ":pid": paymentIntentId, ":now": timestamp, ...PAYABLE_BILL_VALUES },
            } },
            { ConditionCheck: {
                TableName: TABLE_PRESCRIPTIONS, Key: { prescriptionId },
                ConditionExpression: pinned.expression,
                ExpressionAttributeNames: pinned.names,
                ExpressionAttributeValues: pinned.values,
            } },
        ] }));
        return true;
    } catch (error) {
        if (cancellationCodes(error).includes('ConditionalCheckFailed')) return false;
        throw error;
    }
}

/** DynamoDB lists one cancellation reason per transaction item, in request order. */
function cancellationCodes(error: unknown): string[] {
    const { name, CancellationReasons } = (error ?? {}) as { name?: string; CancellationReasons?: { Code?: string }[] };
    return name === 'TransactionCanceledException' && Array.isArray(CancellationReasons)
        ? CancellationReasons.map(reason => reason?.Code ?? 'None')
        : [];
}

/** A bill's durable stock marker makes both a lost settlement reply and a lost stock reply recoverable. */
async function decrementPharmacyStock(regionalDb: ReturnType<typeof getRegionalClient>, billId: string,
    paymentIntentId: string, bill: Record<string, unknown>) {
    if (bill.pharmacyStockStatus !== 'PENDING') return;
    const marker = (state: string) => ({
        TableName: requiredResourceName('TABLE_TRANSACTIONS'), Key: { billId },
        UpdateExpression: 'SET pharmacyStockStatus = :stock',
        ConditionExpression: '#s = :paid AND paymentIntentId = :pid AND pharmacyStockStatus = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':paid': 'PAID', ':pid': paymentIntentId, ':pending': 'PENDING', ':stock': state },
    });
    let needsReview = !bill.pharmacyStockDrugId || !bill.pharmacyStockPharmacyId;
    if (!needsReview) {
        try {
            await regionalDb.send(new TransactWriteCommand({ TransactItems: [
                { Update: marker('APPLIED') },
                { Update: {
                    TableName: TABLE_INVENTORY,
                    Key: { pharmacyId: String(bill.pharmacyStockPharmacyId), drugId: String(bill.pharmacyStockDrugId) },
                    UpdateExpression: 'SET stock = stock - :one', ConditionExpression: 'stock > :zero',
                    ExpressionAttributeValues: { ':one': 1, ':zero': 0 },
                } },
            ] }));
            return;
        } catch (error) {
            const codes = cancellationCodes(error);
            if (codes[0] === 'ConditionalCheckFailed') return;
            if (codes[0] !== 'None' || codes[1] !== 'ConditionalCheckFailed') throw error;
            needsReview = true;
        }
    }
    if (needsReview) {
        try { await regionalDb.send(new UpdateCommand(marker('REVIEW'))); }
        catch (error) {
            if ((error as { name?: string })?.name !== 'ConditionalCheckFailedException') throw error;
        }
        safeError('[WEBHOOK] Captured pharmacy payment requires inventory reconciliation');
    }
}

async function handleChargeRefunded(charge: Stripe.Charge, regionalDb: any, region: string) {
    const billId = charge.metadata?.billId;
    const patientId = charge.metadata?.patientId;

    safeLog(`Charge Refunded: ${charge.id}, billId: ${billId || 'unknown'}`);

    // Atomic update: transaction + appointment refund status
    const ledger = billId ? (await regionalDb.send(new GetCommand({
        TableName: requiredResourceName('TABLE_TRANSACTIONS'), Key: { billId }, ConsistentRead: true,
    }))).Item : undefined;
    if (billId && !ledger) throw new Error('Refund ledger row unavailable; reconciliation required');
    // A prescription reference is not an appointment. Use the authoritative bill classification when present.
    const appointmentId = ledger ? (ledger.type === 'BOOKING_FEE' ? ledger.referenceId : undefined)
        : charge.metadata?.appointmentId;
    const refundNow = new Date().toISOString();
    const partial = charge.refunded === false || (typeof charge.amount === 'number' && charge.amount_refunded < charge.amount);
    const previousLedgerAmount = ledger?.refundedAmountMinor;
    if ((typeof previousLedgerAmount === 'number' && previousLedgerAmount >= charge.amount_refunded) ||
        (partial && ledger?.status === 'REFUNDED')) return;

    const observed = appointmentId ? (await regionalDb.send(new GetCommand({
        TableName: TABLE_APPOINTMENTS, Key: { appointmentId }, ConsistentRead: true,
    }))).Item : undefined;
    const previousAmount = observed?.refundedAmountMinor;
    if (typeof previousAmount === 'number' && previousAmount >= charge.amount_refunded) return;
    try {
        const transactItems: any[] = [];

        if (billId) {
            transactItems.push({
                Update: {
                    TableName: requiredResourceName("TABLE_TRANSACTIONS"),
                    Key: { billId },
                    UpdateExpression: "SET #s = :s, refundedAt = :now, refundId = :rid, refundedAmountMinor = :amount",
                    ExpressionAttributeNames: { "#s": "status" },
                    ConditionExpression: 'billId = :billKey AND ' + (previousLedgerAmount === undefined
                        ? 'attribute_not_exists(refundedAmountMinor)' : 'refundedAmountMinor = :previousLedger'),
                    ExpressionAttributeValues: { ":s": partial ? "PARTIALLY_REFUNDED" : "REFUNDED", ":now": refundNow,
                        ":rid": charge.id, ":amount": charge.amount_refunded, ':billKey': billId,
                        ...(previousLedgerAmount === undefined ? {} : { ':previousLedger': previousLedgerAmount }) }
                }
            });
        }

        if (appointmentId) {
            transactItems.push({
                Update: {
                    TableName: TABLE_APPOINTMENTS,
                    Key: { appointmentId },
                    UpdateExpression: 'SET paymentStatus = :ps, lastUpdated = :now, refundedAmountMinor = :amount',
                    ConditionExpression: previousAmount === undefined ? 'attribute_not_exists(refundedAmountMinor)' : 'refundedAmountMinor = :previous',
                    ExpressionAttributeValues: { ':ps': partial ? 'partially_refunded' : 'refunded', ':now': refundNow, ':amount': charge.amount_refunded,
                        ...(previousAmount === undefined ? {} : { ':previous': previousAmount }) }
                }
            });
        }

        if (transactItems.length > 0) {
            await regionalDb.send(new TransactWriteCommand({ TransactItems: transactItems }));
        }
    } catch (err: any) {
        safeError(`Failed atomic refund update (billId: ${billId}, appointmentId: ${appointmentId})`);
        throw err;
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
            const recipientEmail = await patientContactEmail(regionalDb, patientId, region);
            if (!recipientEmail) {
                safeError(`Refund notice for charge ${charge.id} not sent: patient not notified (no email on profile)`);
                return;
            }
            sendNotification({
                region,
                recipientEmail,
                subject: REFUND_WEBHOOK_COPY.requestedSubject,
                message: REFUND_WEBHOOK_COPY.requested(((charge.amount_refunded || 0) / 100).toFixed(2)),
                type: 'GENERAL',
                metadata: { billId: billId || '', refundId: charge.id }
            }).catch(() => {});
        } catch (err: unknown) {
            // Non-blocking: the refund is already recorded.
            safeError(`Refund notice for charge ${charge.id} failed: patient not notified (${err instanceof Error ? err.message : String(err)})`);
        }
    }
}

/**
 * A failed refund's money goes back to the Stripe balance and must be returned another way (docs.stripe.com/refunds).
 * Only the refund our cancellation recorded is changed, on the appointment and its refund row together; anything else
 * is logged for a person. Infrastructure failures propagate so the event is retried.
 */
/** A provider reply can beat cancellation finalization. Missing local refund IDs are retryable, never receipts. */
async function requireRefundRecords(regionalDb: ReturnType<typeof getRegionalClient>, appointmentId: string): Promise<void> {
    const appointment = (await regionalDb.send(new GetCommand({
        TableName: TABLE_APPOINTMENTS, Key: { appointmentId }, ConsistentRead: true,
    }))).Item;
    const bill = (await regionalDb.send(new GetCommand({
        TableName: requiredResourceName('TABLE_TRANSACTIONS'), Key: { billId: refundBillId(appointmentId) }, ConsistentRead: true,
    }))).Item;
    if (!appointment?.refundId || !bill?.refundId) throw new Error('Cancellation refund records not finalized');
}

/** Only a matching pending cancellation refund can advance; late pending events never regress it. */
async function handleRefundUpdated(refund: Stripe.Refund, regionalDb: ReturnType<typeof getRegionalClient>, region: string) {
    if (refund.status === 'failed' || refund.status === 'canceled') {
        return handleRefundFailed(refund, regionalDb, region);
    }
    if (refund.status !== 'succeeded' || !refund.metadata?.appointmentRefund) return;
    const appointmentId = refund.metadata.appointmentRefund;
    const now = new Date().toISOString();
    const values = { ':id': refund.id, ':pending': 'PENDING', ':issued': 'ISSUED', ':now': now };
    try {
        await regionalDb.send(new TransactWriteCommand({ TransactItems: [
            { Update: {
                TableName: TABLE_APPOINTMENTS, Key: { appointmentId },
                UpdateExpression: 'SET refundStatus = :issued, lastUpdated = :now',
                ConditionExpression: 'refundId = :id AND refundStatus = :pending', ExpressionAttributeValues: values,
            } },
            { Update: {
                TableName: requiredResourceName('TABLE_TRANSACTIONS'), Key: { billId: refundBillId(appointmentId) },
                UpdateExpression: 'SET refundStatus = :issued, refundCompletedAt = :now',
                ConditionExpression: 'refundId = :id AND refundStatus = :pending', ExpressionAttributeValues: values,
            } },
        ] }));
    } catch (error) {
        const codes = cancellationCodes(error);
        if (!codes.length || codes.some(code => !['None', 'ConditionalCheckFailed'].includes(code))) throw error;
        await requireRefundRecords(regionalDb, appointmentId);
        safeLog('[WEBHOOK] Refund completion ignored for changed or unmatched records');
    }
}

async function handleRefundFailed(refund: Stripe.Refund, regionalDb: ReturnType<typeof getRegionalClient>, region: string) {
    const appointmentId = refund.metadata?.appointmentRefund;
    if (!appointmentId) {
        safeError(`Refund ${refund.id} failed and is not an appointment refund; manual refund follow-up required`);
        return;
    }
    const now = new Date().toISOString();
    const manual: RefundStatus = "REQUIRES_MANUAL_REFUND";
    try {
        await regionalDb.send(new TransactWriteCommand({
            TransactItems: [{
                Update: {
                    TableName: TABLE_APPOINTMENTS, Key: { appointmentId },
                    UpdateExpression: 'SET refundStatus = :manual, lastUpdated = :now',
                    ConditionExpression: 'refundId = :rid',
                    ExpressionAttributeValues: { ':manual': manual, ':now': now, ':rid': refund.id }
                }
            }, {
                Update: {
                    TableName: requiredResourceName("TABLE_TRANSACTIONS"), Key: { billId: refundBillId(appointmentId) },
                    UpdateExpression: 'SET #s = :failed, refundStatus = :manual, refundFailedAt = :now',
                    ConditionExpression: 'refundId = :rid',
                    ExpressionAttributeNames: { '#s': 'status' },
                    ExpressionAttributeValues: { ':failed': MANUAL_REFUND_LEDGER_STATUS, ':manual': manual, ':now': now, ':rid': refund.id }
                }
            }]
        }));
    } catch (err: unknown) {
        const reasons = (err as { CancellationReasons?: { Code?: string }[] })?.CancellationReasons?.map(r => r.Code ?? 'None').join(',');
        safeError(`Refund ${refund.id} failed but was not recorded for appointment ${appointmentId} (${err instanceof Error ? err.name : 'unknown error'}${reasons ? `: ${reasons}` : ''}); manual refund follow-up required`);
        const codes = cancellationCodes(err);
        if (!codes.length || codes.some(code => !['None', 'ConditionalCheckFailed'].includes(code))) throw err;
        await requireRefundRecords(regionalDb, appointmentId);
        return;
    }
    safeError(`Refund ${refund.id} failed (${refund.failure_reason ?? 'unknown'}); appointment ${appointmentId} marked for manual refund`);
    try {
        const appointment = (await regionalDb.send(new GetCommand({ TableName: TABLE_APPOINTMENTS, Key: { appointmentId } }))).Item;
        await writeAuditLog(appointment?.patientId || "SYSTEM", appointment?.patientId || "UNKNOWN", "REFUND_FAILED",
            `Stripe refund ${refund.id} failed; manual refund required`, { region, refundId: refund.id, appointmentId });
        const recipientEmail = await patientContactEmail(regionalDb, appointment?.patientId, region);
        if (!recipientEmail) {
            safeError(`Refund ${refund.id} failure for appointment ${appointmentId}: patient not notified (no email on profile)`);
            return;
        }
        sendNotification({
            region,
            recipientEmail,
            subject: REFUND_WEBHOOK_COPY.manualSubject,
            message: REFUND_NOTICES.REQUIRES_MANUAL_REFUND,
            type: 'GENERAL',
            metadata: { appointmentId, refundId: refund.id }
        }).catch(() => {});
    } catch (err: unknown) {
        safeError(`Refund failure follow-up (audit/notice) failed for appointment ${appointmentId}: ${err instanceof Error ? err.message : String(err)}`);
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
                TableName: requiredResourceName("TABLE_TRANSACTIONS"),
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
            recipientEmail: setting("ADMIN_EMAIL"),
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
                TableName: requiredResourceName("TABLE_TRANSACTIONS"),
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
            recipientEmail: setting("ADMIN_EMAIL"),
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
 * Creation can precede payment. Initialize without benefits; invoice.paid activates them.
 * Replayed creation must preserve an existing allowance and family state.
 */
type SubscriptionFence = { eventId: string; token: string; created: number };

function subscriptionSnapshot(current: any) {
    const names: Record<string, string> = {}, values: Record<string, unknown> = {}, conditions: string[] = [];
    for (const field of ['stripeSubscriptionId', 'planId', 'status', 'cycleStart', 'cycleEnd', 'benefitsPendingInvoice', 'lastRenewalInvoiceId', 'lastRenewalPeriodStart', 'lastPaidEventCreated', 'lastLifecycleEventCreated', 'lastLifecycleEventId', 'lastLifecyclePeriodStart']) {
        const name = `#snapshot${conditions.length}`, value = `:snapshot${conditions.length}`;
        names[name] = field;
        if (current[field] === undefined) conditions.push(`attribute_not_exists(${name})`);
        else { conditions.push(`${name} = ${value}`); values[value] = current[field]; }
    }
    return { names, values, conditions };
}

/** Status delivery must not overwrite a different subscription, newer payment, or newer worker. */
async function applySubscriptionLifecycle(current: any, changes: Record<string, unknown>, regionalDb: any, fence: SubscriptionFence): Promise<boolean> {
    if (!Number.isSafeInteger(fence.created) || fence.created <= 0) throw new Error('Invalid subscription event timestamp');
    if (current.lastLifecycleEventId === fence.eventId) return true;
    const terminal = changes.status === SubscriptionStatus.CANCELLED;
    if (!terminal && current.lastLifecycleEventCreated !== undefined) {
        if (!Number.isSafeInteger(current.lastLifecycleEventCreated)) throw new Error('Subscription lifecycle requires reconciliation');
        if (current.lastLifecycleEventCreated > fence.created) return false;
        // Stripe timestamps have second precision; equal-time conflicting deliveries need reconciliation.
        if (current.lastLifecycleEventCreated === fence.created) throw new Error('Ambiguous subscription lifecycle order');
    }
    const { names, values, conditions } = subscriptionSnapshot(current);
    const assignments: string[] = [];
    const update = { ...changes, lastLifecycleEventCreated: Math.max(fence.created, typeof current.lastLifecycleEventCreated === 'number' ? current.lastLifecycleEventCreated : fence.created), lastLifecycleEventId: fence.eventId, updatedAt: new Date().toISOString() };
    for (const [field, content] of Object.entries(update)) {
        const name = `#change${assignments.length}`, value = `:change${assignments.length}`;
        names[name] = field; values[value] = content; assignments.push(`${name} = ${value}`);
    }
    try {
        await regionalDb.send(new TransactWriteCommand({ TransactItems: [
            { ConditionCheck: eventClaimCondition(fence.eventId, fence.token) },
            { Update: { TableName: TABLE_SUBSCRIPTIONS, Key: { patientId: current.patientId },
                ConditionExpression: conditions.join(' AND '), UpdateExpression: 'SET ' + assignments.join(', '),
                ExpressionAttributeNames: names, ExpressionAttributeValues: values } },
        ] }));
    } catch (error) {
        const observed = (await regionalDb.send(new GetCommand({ TableName: TABLE_SUBSCRIPTIONS, Key: { patientId: current.patientId }, ConsistentRead: true }))).Item;
        if (observed?.stripeSubscriptionId !== current.stripeSubscriptionId || observed?.lastLifecycleEventId !== fence.eventId) throw error;
    }
    return true;
}
async function handleSubscriptionCreated(subscription: Stripe.Subscription, regionalDb: any, region: string, fence: SubscriptionFence) {
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
    const existing = (await regionalDb.send(new GetCommand({ TableName: TABLE_SUBSCRIPTIONS, Key: { patientId }, ConsistentRead: true }))).Item;
    if (existing?.stripeSubscriptionId === subscription.id) return;
    // A replacement must follow a cancelled cycle. Ambiguous legacy state requires reconciliation.
    if (existing && (existing.status !== SubscriptionStatus.CANCELLED || !Number.isFinite(Date.parse(existing.cycleEnd)) ||
        Date.parse(cycleStart) < Date.parse(existing.cycleEnd))) throw new Error('Subscription replacement requires reconciliation');

    try { await regionalDb.send(new TransactWriteCommand({ TransactItems: [
        { ConditionCheck: eventClaimCondition(fence.eventId, fence.token) },
        { Put: {
        TableName: TABLE_SUBSCRIPTIONS,
        ConditionExpression: existing ? 'stripeSubscriptionId = :previous AND #status = :cancelled AND cycleEnd = :previousEnd' : 'attribute_not_exists(patientId)',
        ...(existing ? { ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: {
            ':previous': existing.stripeSubscriptionId, ':cancelled': SubscriptionStatus.CANCELLED, ':previousEnd': existing.cycleEnd,
        } } : {}),
        Item: {
            patientId,
            planId,
            status: SubscriptionStatus.INCOMPLETE,
            benefitsPendingInvoice: true,
            discountPercent: 0,
            stripeCustomerId: subscription.customer as string,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0]?.price?.id || '',
            freeGpVisitsRemaining: 0,
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
    } } ] })); } catch (error) {
        // A committed response may have been lost, or another delivery initialized it first.
        const current = (await regionalDb.send(new GetCommand({ TableName: TABLE_SUBSCRIPTIONS, Key: { patientId }, ConsistentRead: true }))).Item;
        if (current?.stripeSubscriptionId !== subscription.id) throw error;
    }

    await writeAuditLog(
        patientId, patientId, 'SUBSCRIPTION_INITIALIZED',
        `Plan: ${plan.name}, payment confirmation pending, Cycle: ${cycleStart} to ${cycleEnd}`,
        { region }
    );

    safeLog(`Subscription initialized: ${subscription.id}, payment confirmation pending`);
}

/**
 * customer.subscription.updated — Status change, plan change, or cancellation pending.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription, regionalDb: any, region: string, fence: SubscriptionFence) {
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

    const mappedStatus = statusMap[subscription.status];
    if (!mappedStatus) throw new Error('Unsupported subscription status requires reconciliation');
    const current = (await regionalDb.send(new GetCommand({ TableName: TABLE_SUBSCRIPTIONS, Key: { patientId }, ConsistentRead: true }))).Item;
    if (!current) throw new Error('Subscription update awaits creation');
    if (current.stripeSubscriptionId !== subscription.id) return;
    if (current.status === SubscriptionStatus.CANCELLED && current.lastLifecycleEventId !== fence.eventId) return;
    if (mappedStatus !== SubscriptionStatus.CANCELLED && typeof current.lastPaidEventCreated === 'number' && current.lastPaidEventCreated > fence.created) return;
    if (mappedStatus !== SubscriptionStatus.CANCELLED && typeof current.lastPaidEventCreated === 'number' && current.lastPaidEventCreated === fence.created && mappedStatus !== current.status) throw new Error('Ambiguous paid subscription status order');
    if (!Number.isSafeInteger(subscription.current_period_start) || !Number.isSafeInteger(subscription.current_period_end)) throw new Error('Invalid subscription update period');
    const cycleEnd = new Date(subscription.current_period_end * 1000).toISOString();
    if (mappedStatus !== SubscriptionStatus.CANCELLED && (subscription.current_period_start * 1000 < Date.parse(current.cycleStart) || Date.parse(cycleEnd) < Date.parse(current.cycleEnd))) return;
    // An active provider snapshot alone does not prove the first invoice has been applied.
    const newStatus = mappedStatus === SubscriptionStatus.ACTIVE && current.benefitsPendingInvoice === true ? SubscriptionStatus.INCOMPLETE : mappedStatus;
    if (!await applySubscriptionLifecycle(current, { status: newStatus, cancelAtPeriodEnd: subscription.cancel_at_period_end || false, cycleEnd, lastLifecyclePeriodStart: subscription.current_period_start,
        ...(newStatus === SubscriptionStatus.CANCELLED ? { discountPercent: 0, freeGpVisitsRemaining: 0 } : {}),
    }, regionalDb, fence)) return;

    await writeAuditLog(
        patientId, patientId, 'SUBSCRIPTION_STATUS_CHANGED',
        `Status: ${newStatus}, CancelAtPeriodEnd: ${subscription.cancel_at_period_end}`,
        { region }
    );

    safeLog(`Subscription updated: ${subscription.id}, status: ${newStatus}`);
}

/**
 * customer.subscription.deleted — Subscription fully cancelled.
 * Remove discount, zero out free visits.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription, regionalDb: any, region: string, fence: SubscriptionFence) {
    const { patientId } = subscription.metadata || {};
    if (!patientId) return;

    const current = (await regionalDb.send(new GetCommand({ TableName: TABLE_SUBSCRIPTIONS, Key: { patientId }, ConsistentRead: true }))).Item;
    if (!current) throw new Error('Subscription deletion awaits creation');
    if (current.stripeSubscriptionId !== subscription.id) return;
    if (current.status === SubscriptionStatus.CANCELLED && current.lastLifecycleEventId !== fence.eventId) return;
    if (!await applySubscriptionLifecycle(current, { status: SubscriptionStatus.CANCELLED, discountPercent: 0, freeGpVisitsRemaining: 0 }, regionalDb, fence)) return;

    await writeAuditLog(
        patientId, patientId, 'SUBSCRIPTION_CANCELLED',
        'Subscription fully cancelled',
        { region }
    );

    safeLog(`Subscription cancelled: ${subscription.id}, patient: ${patientId}`);
}

/**
 * invoice.paid — Monthly renewal succeeded.
 * Reset free GP visits. Update cycle dates.
 */
async function handleSubscriptionInvoicePaid(invoice: Stripe.Invoice, regionalDb: any, region: string, fence: SubscriptionFence) {
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

    // Adjustments and prorations do not buy another monthly allowance.
    if (!['subscription_create', 'subscription_cycle'].includes(invoice.billing_reason || '')) return;
    if (!invoice.id || !Number.isSafeInteger(invoice.period_start) || !Number.isSafeInteger(invoice.period_end) ||
        invoice.period_start <= 0 || invoice.period_end < invoice.period_start) throw new Error('Invalid subscription invoice period');
    const current = (await regionalDb.send(new GetCommand({ TableName: TABLE_SUBSCRIPTIONS, Key: { patientId }, ConsistentRead: true }))).Item;
    if (!current || current.stripeSubscriptionId !== subscriptionId) throw new Error('Subscription invoice awaits matching subscription');
    if (current.status === SubscriptionStatus.CANCELLED) return;
    const plan = PLANS[current.planId as PlanId];
    if (!plan || (planId && planId !== current.planId)) throw new Error('Subscription invoice plan requires reconciliation');
    const periodStart = new Date(invoice.period_start * 1000).toISOString();
    const periodEnd = new Date(invoice.period_end * 1000).toISOString();
    const alreadyApplied = current.lastRenewalInvoiceId === invoice.id;
    const existingCycleStart = Date.parse(current.cycleStart);
    if (!Number.isFinite(existingCycleStart)) throw new Error('Subscription cycle requires reconciliation');
    if (!alreadyApplied && (invoice.period_start * 1000 < existingCycleStart ||
        (invoice.period_start * 1000 === existingCycleStart && current.benefitsPendingInvoice !== true))) return;
    if (!alreadyApplied && typeof current.lastRenewalPeriodStart === 'number' && current.lastRenewalPeriodStart >= invoice.period_start) return;
    if (!alreadyApplied && typeof current.lastLifecyclePeriodStart === 'number' && current.lastLifecyclePeriodStart > invoice.period_start) return;
    if (!Number.isSafeInteger(fence.created) || fence.created <= 0) throw new Error('Invalid paid subscription timestamp');
    if (!alreadyApplied && typeof current.lastLifecycleEventCreated === 'number' && current.lastLifecycleEventCreated >= fence.created &&
        current.status !== SubscriptionStatus.ACTIVE && !(current.status === SubscriptionStatus.INCOMPLETE && current.benefitsPendingInvoice === true)) throw new Error('Paid invoice requires lifecycle reconciliation');
    const snapshot = subscriptionSnapshot(current);

    if (!alreadyApplied) try { await regionalDb.send(new TransactWriteCommand({ TransactItems: [
        { ConditionCheck: eventClaimCondition(fence.eventId, fence.token) },
        { Update: {
        TableName: TABLE_SUBSCRIPTIONS,
        Key: { patientId },
        UpdateExpression: 'SET #status = :active, discountPercent = :discount, freeGpVisitsRemaining = :freeGp, cycleStart = :start, cycleEnd = :end, updatedAt = :now, lastRenewalInvoiceId = :invoice, lastRenewalPeriodStart = :period, benefitsPendingInvoice = :notPending, lastPaidEventCreated = :paidCreated',
        ConditionExpression: snapshot.conditions.join(' AND ') + ' AND stripeSubscriptionId = :subscription AND planId = :plan AND #status = :observedStatus AND cycleStart = :previousStart AND (attribute_not_exists(lastRenewalPeriodStart) OR lastRenewalPeriodStart < :period) AND (attribute_not_exists(lastRenewalInvoiceId) OR lastRenewalInvoiceId <> :invoice)',
        ExpressionAttributeNames: { ...snapshot.names, '#status': 'status' },
        ExpressionAttributeValues: {
            ...snapshot.values,
            ':active': SubscriptionStatus.ACTIVE,
            ':discount': plan.discountPercent,
            ':freeGp': plan.freeGpVisitsPerMonth,
            ':start': periodStart,
            ':end': periodEnd,
            ':now': new Date().toISOString(),
            ':invoice': invoice.id, ':period': invoice.period_start, ':subscription': subscriptionId,
            ':plan': current.planId, ':observedStatus': current.status, ':previousStart': current.cycleStart, ':notPending': false,
            ':paidCreated': fence.created,
        },
    } } ] })); } catch (error) {
        const observed = (await regionalDb.send(new GetCommand({ TableName: TABLE_SUBSCRIPTIONS, Key: { patientId }, ConsistentRead: true }))).Item;
        if (observed?.stripeSubscriptionId !== subscriptionId) throw error;
        if (observed.status === SubscriptionStatus.CANCELLED) return;
        if (observed.lastRenewalInvoiceId !== invoice.id) {
            if (typeof observed.lastRenewalPeriodStart === 'number' && observed.lastRenewalPeriodStart >= invoice.period_start) return;
            throw error;
        }
    }

    await writeAuditLog(
        patientId, patientId, 'SUBSCRIPTION_RENEWED',
        `Invoice: ${invoice.id}, Amount: $${((invoice.amount_paid || 0) / 100).toFixed(2)}, Period: ${periodStart} to ${periodEnd}`,
        { region }
    );

    safeLog(`Subscription renewed: ${subscriptionId}, patient: ${patientId}`);
}

/**
 * invoice.payment_failed — Monthly renewal failed.
 * Mark as past_due. Patient gets grace period.
 */
async function handleSubscriptionInvoiceFailed(invoice: Stripe.Invoice, regionalDb: any, region: string, fence: SubscriptionFence) {
    const subscriptionId = invoice.subscription as string;
    const customerMetadata = (invoice as any).subscription_details?.metadata || {};
    const patientId = customerMetadata.patientId || invoice.metadata?.patientId;

    if (!patientId) return;

    const current = (await regionalDb.send(new GetCommand({ TableName: TABLE_SUBSCRIPTIONS, Key: { patientId }, ConsistentRead: true }))).Item;
    if (!current) throw new Error('Failed invoice awaits subscription creation');
    if (current.stripeSubscriptionId !== subscriptionId) return;
    if (current.status === SubscriptionStatus.CANCELLED) return;
    if (!Number.isSafeInteger(invoice.period_start) || invoice.period_start <= 0) throw new Error('Invalid failed invoice period');
    if (current.lastRenewalInvoiceId === invoice.id || (typeof current.lastRenewalPeriodStart === 'number' && current.lastRenewalPeriodStart >= invoice.period_start)) return;
    const existingCycleStart = Date.parse(current.cycleStart);
    if (!Number.isFinite(existingCycleStart)) throw new Error('Subscription cycle requires reconciliation');
    if (invoice.period_start * 1000 < existingCycleStart) return;
    if (!await applySubscriptionLifecycle(current, { status: SubscriptionStatus.PAST_DUE }, regionalDb, fence)) return;

    await writeAuditLog(
        patientId, patientId, 'SUBSCRIPTION_PAYMENT_FAILED',
        `Invoice: ${invoice.id}, Attempt: ${invoice.attempt_count}`,
        { region }
    );

    // Ask the patient to update their payment method; never throws.
    await notifyPatient(regionalDb, patientId, region, `Subscription payment failure notice for invoice ${invoice.id}`, {
        subject: 'Payment Failed — Update Your Card',
        message: 'Your MediConnect subscription payment failed. Please update your payment method to continue receiving discounts.',
        type: 'PAYMENT_FAILED',
        metadata: { subscriptionId: subscriptionId || '', invoiceId: invoice.id },
    });

    safeLog(`Subscription payment failed: ${subscriptionId}, patient: ${patientId}, attempt: ${invoice.attempt_count}`);
}
