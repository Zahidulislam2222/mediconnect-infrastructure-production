import { requestJurisdiction } from '../../../shared/region-context';
import { Request, Response, NextFunction } from 'express';
import { getRegionalClient, getSecret, getSSMParameter } from '../../../shared/aws-config';
import { PutCommand, QueryCommand, GetCommand, DeleteCommand, TransactWriteCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import { logger } from '../../../shared/logger';
import { writeAuditLog } from '../../../shared/audit';
import { decryptToken, encryptPHI, decryptPHI } from '../../../shared/kms-crypto';
import { BookingPDFGenerator } from "../utils/pdf-generator";
import { google } from 'googleapis';
import { pushAppointmentToBigQuery, pushRevenueToBigQuery } from './billing.controller';
import { sendNotification } from '../../../shared/notifications';
import { publishEvent, EventType } from '../../../shared/event-bus';

import { getCancellationRefundSettings, getCancellationSettings, requiredResourceName, setting } from '../../../shared/settings';
import { ERASED_MARKER } from '../../../shared/erasure';
import { CANCELLATION_COPY, RECEIPT_STATUS, REFUND_NOTICES, type RefundStatus } from '../content/cancellation';
import {
    CLEANUP_CANCELLABLE, DOCTOR_CANCELLABLE, FHIR_CANCELLED, MANUAL_REFUND_LEDGER_STATUS, PATIENT_CANCELLABLE, REFUNDED_STATUS, refundBillId
} from '../cancellation-policy';
import { patientContactEmail } from '../patient-contact';
import {
    PlanId,
    SubscriptionStatus,
    TABLE_SUBSCRIPTIONS,
    calculateDiscountedPrice,
    isGpSpecialty,
    SubscriptionRecord,
} from '../../../shared/subscription';

// 🛡️ ARCHITECTURAL PURGE: 'pg' and 'db.ts' have been completely removed.
// All data (including pricing and tokens) now securely flows through Regional DynamoDB.

interface AuthRequest extends Request {
    user?: {
        sub?: string;
        id?: string;
        email_verified?: boolean;
    };
}

const TABLE_APPOINTMENTS = setting("TABLE_APPOINTMENTS");
const TABLE_LOCKS = setting("TABLE_LOCKS");
const TABLE_DOCTORS = setting("TABLE_DOCTORS"); // 🟢 Replaced Postgres
const TABLE_GRAPH = setting("TABLE_GRAPH");
const STRIPE_SECRET_NAME = "/mediconnect/stripe/keys";
const CLEANUP_SECRET_PARAM = "/mediconnect/prod/cleanup/secret";

const normalizeTimeSlot = (isoString: string) => {
    if (!isoString) return new Date().toISOString();
    return isoString.split('Z')[0].split('.')[0] + "Z";
};

// Helper to handle async errors safely
const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// 🟢 GDPR FIX: Strictly route DB calls to the user's legal jurisdiction
export const extractRegion = (req: Request): string => requestJurisdiction(req);

// --- CONTROLLER METHODS ---

export const createBooking = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    
    let stripeInstance: Stripe | null = null;
    let paymentIntentId: string | null = null;

    const { patientName, doctorId, doctorName, timeSlot, paymentToken, priority = "Low", reason = "General Checkup" } = req.body;

    const authReq = req as AuthRequest;
    const patientId = authReq.user?.sub || authReq.user?.id;
    
    if (!patientId) return res.status(401).json({ message: "Identity Spoofing Detected. Missing verified token." });
    if (!timeSlot || !doctorId || !paymentToken) {
        return res.status(400).json({ message: "Missing required booking fields or payment method." });
    }

    const normalizedTime = normalizeTimeSlot(timeSlot);

    if (new Date(normalizedTime).getTime() <= Date.now()) {
        return res.status(400).json({ message: "Security Block: Cannot book appointments in the past." });
    }
    
    const lockKey = `${doctorId}#${normalizedTime}`;
    const transactionId = randomUUID();
    const appointmentId = randomUUID();
    const timestamp = new Date().toISOString();

    let patientAge = "N/A";

    const [patientRes, doctorRes] = await Promise.all([
        docClient.send(new GetCommand({ TableName: requiredResourceName("TABLE_PATIENTS"), Key: { patientId } })),
        docClient.send(new GetCommand({ TableName: TABLE_DOCTORS, Key: { doctorId } }))
    ]);

    if (!patientRes.Item || patientRes.Item.status === 'DELETED' || patientRes.Item.isIdentityVerified !== true) {
        return res.status(403).json({ message: "HIPAA Block: Patient identity not verified." });
    }

    if (!doctorRes.Item || doctorRes.Item.verificationStatus !== 'APPROVED') {
        return res.status(404).json({ message: "Doctor is currently unavailable or unverified." });
    }

    // Encryption availability is checked before reserving a slot or contacting the payment provider.
    let encryptedPatientName: string;
    let encryptedDoctorName: string;
    try {
        const names = await encryptPHI({ patientName: patientRes.Item.name, doctorName: doctorRes.Item.name }, region);
        encryptedPatientName = names.patientName;
        encryptedDoctorName = names.doctorName;
    } catch {
        return res.status(503).json({ code: 'PHI_ENCRYPTION_UNAVAILABLE', error: 'Protected booking data could not be saved.' });
    }

    // Safely extract data
    const actualPatientName = patientRes.Item.name || patientName || "Unknown Patient";
    const actualDoctorName = doctorRes.Item.name || doctorName || "Medical Provider";
    const patientAvatar = patientRes.Item.avatar || null;
    if (patientRes.Item.dob) {
        const dob = new Date(patientRes.Item.dob);
        patientAge = Math.abs(new Date(Date.now() - dob.getTime()).getUTCFullYear() - 1970).toString();
    }
    let fee = Number(doctorRes.Item.consultationFee);
    if (isNaN(fee) || fee < 0) fee = 50; // Fallback to safe default

    // ─── SUBSCRIPTION DISCOUNT CHECK (Loophole #2: server-side only) ────────
    // Read subscription from DB, NEVER from JWT or client request (loophole #10)
    let discountApplied = 0;
    const originalPrice = fee;
    let isFreeGpVisit = false;
    let subscriptionId: string | undefined;

    try {
        // Check if patient (or their family primary) has an active subscription
        const subResult = await docClient.send(new GetCommand({
            TableName: TABLE_SUBSCRIPTIONS,
            Key: { patientId },
        }));
        const sub = subResult.Item as SubscriptionRecord | undefined;

        // If no direct subscription, check if patient is a family member on someone else's plan
        if (!sub || sub.status !== SubscriptionStatus.ACTIVE) {
            // Query for family membership would go here (scan by familyMembers contains patientId)
            // For now, only direct subscriptions are checked
        }

        if (sub && sub.status === SubscriptionStatus.ACTIVE && !sub.disputeFrozen) {
            subscriptionId = sub.stripeSubscriptionId;
            const doctorSpecialty = (doctorRes.Item.specialty || '').toLowerCase();

            // Premium: check if free GP visit available
            if (sub.planId === PlanId.PREMIUM &&
                sub.freeGpVisitsRemaining > 0 &&
                isGpSpecialty(doctorSpecialty)) {
                isFreeGpVisit = true;
                discountApplied = 100;
                fee = 0;

                // Deduct free GP visit
                await docClient.send(new UpdateCommand({
                    TableName: TABLE_SUBSCRIPTIONS,
                    Key: { patientId },
                    UpdateExpression: 'SET freeGpVisitsRemaining = freeGpVisitsRemaining - :one, updatedAt = :now',
                    ConditionExpression: 'freeGpVisitsRemaining > :zero',
                    ExpressionAttributeValues: { ':one': 1, ':zero': 0, ':now': new Date().toISOString() },
                }));
            } else {
                // Apply percentage discount (server-calculated, loophole #2)
                const pricing = calculateDiscountedPrice(fee, sub.planId);
                fee = pricing.discountedPrice;
                discountApplied = pricing.discountPercent;
            }
        }
    } catch (subErr: any) {
        // Subscription check failure should NOT block booking — fall back to full price
        logger.warn(`Subscription check failed for ${patientId}: ${subErr.message}`);
    }

    const amountToCharge = Math.round(fee * 100);

    // 2. Atomic Locking (Condition: attribute_not_exists)
    // ─── LOCK TTL FIX ──────────────────────────────────────────────────────
    // ORIGINAL: expiresAt was set to now + 15 minutes for ALL locks.
    // BUG: DynamoDB TTL would delete the lock 15 min after creation, even
    // for appointments days away. After TTL deletion, the slot could be
    // double-booked by another patient.
    //
    // FIX: Initial LOCKED state uses 15-min TTL (reservation window while
    // payment processes). The BOOKED promotion (in TransactWrite below)
    // extends expiresAt to appointment end time + 1 hour buffer.
    // ─────────────────────────────────────────────────────────────────────────
    const LOCK_RESERVATION_TTL_SECONDS = 15 * 60; // 15 min for payment processing
    const LOCK_BOOKED_BUFFER_SECONDS = 60 * 60;   // 1 hour after appointment ends
    const appointmentEndTimeMs = new Date(normalizedTime).getTime() + (30 * 60 * 1000); // 30-min consultation
    const bookedLockExpiresAt = Math.floor(appointmentEndTimeMs / 1000) + LOCK_BOOKED_BUFFER_SECONDS;

    try {
        await docClient.send(new PutCommand({
            TableName: TABLE_LOCKS,
            Item: {
                lockId: lockKey,
                reservedBy: patientId,
                status: "LOCKED",
                createdAt: new Date().toISOString(),
                expiresAt: Math.floor(Date.now() / 1000) + LOCK_RESERVATION_TTL_SECONDS
            },
            ConditionExpression: "attribute_not_exists(lockId)"
        }));
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            return res.status(409).json({ message: "This time slot is already taken." });
        }
        throw e;
    }

    // Skip Stripe payment for free GP visits (Premium subscription benefit)
    if (!isFreeGpVisit) {
        const stripeKey = await getSSMParameter(STRIPE_SECRET_NAME, region, true);
        if (!stripeKey) throw new Error("Stripe secret not found");

        stripeInstance = new Stripe(stripeKey);
        try {
            const paymentIntent = await stripeInstance.paymentIntents.create({
                amount: amountToCharge,
                currency: "usd",
                payment_method: paymentToken,
                confirm: true,
                capture_method: 'manual', // CRITICAL: Do not take money yet
                metadata: {
                appointmentId, doctorId, patientId,
                billId: transactionId, type: 'BOOKING_FEE',
                region,
                ...(discountApplied > 0 ? { discountApplied: String(discountApplied), originalPrice: String(originalPrice) } : {}),
                },
                automatic_payment_methods: { enabled: true, allow_redirects: 'never' }
            });
            paymentIntentId = paymentIntent.id;
        } catch (paymentError: any) {
            logger.error("[BOOKING] Payment authorization failed", { error: paymentError.message });
            await docClient.send(new DeleteCommand({ TableName: TABLE_LOCKS, Key: { lockId: lockKey } }));
            return res.status(402).json({ error: "Payment Failed", details: paymentError.message });
        }
    }

    // 🟢 FHIR R4 TRANSFORMATION: Appointment Resource
    const appointmentEnd = new Date(new Date(normalizedTime).getTime() + 30 * 60000).toISOString();
    const fhirResource = {
        resourceType: "Appointment",
        id: appointmentId,
        status: "booked",
        description: reason,
        start: normalizedTime,
        end: appointmentEnd,
        created: timestamp,
        participant: [
            { actor: { reference: `Patient/${patientId}`, display: actualPatientName }, status: "accepted" },
            { actor: { reference: `Practitioner/${doctorId}`, display: actualDoctorName }, status: "accepted" }
        ],
        serviceType: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/service-type", code: "general", display: "General Practice" }] }],
        minutesDuration: 30,
        priority: priority === "High" ? 1 : priority === "Medium" ? 5 : 10,
        meta: { lastUpdated: timestamp, versionId: "1" }
    };

    // ─── PAYMENT CAPTURE ORDERING FIX ─────────────────────────────────────
    // ORIGINAL FLOW (broken):
    //   1. TransactWrite → DB says "PAID" and "CONFIRMED"
    //   2. stripe.capture() → actually take money
    //   3. If capture fails: DB committed but money never taken ❌
    //
    // FIXED FLOW:
    //   1. stripe.capture() → actually take money FIRST
    //   2. TransactWrite → DB says "PAID" and "CONFIRMED"
    //   3. If DB fails: refund the captured payment (safe rollback)
    //
    // This ensures money is never marked as "PAID" unless Stripe confirms it.
    // ─────────────────────────────────────────────────────────────────────────

    // Step 1: Capture payment BEFORE committing to database
    if (stripeInstance && paymentIntentId) {
        try {
            await stripeInstance.paymentIntents.capture(paymentIntentId);
            logger.info(`Payment captured for ${appointmentId}`);
        } catch (captureError: any) {
            // Capture failed — release lock, do NOT write to DB
            logger.error("Payment capture failed. Releasing lock.", { appointmentId, paymentIntentId, error: captureError.message });
            try { await stripeInstance.paymentIntents.cancel(paymentIntentId); } catch { logger.warn('BOOKING_COMPENSATION_FAILED'); }
            if (lockKey) {
                try { await docClient.send(new DeleteCommand({ TableName: TABLE_LOCKS, Key: { lockId: lockKey } })); } catch { logger.warn('BOOKING_COMPENSATION_FAILED'); }
            }
            return res.status(402).json({ error: "Payment capture failed. Your card was not charged.", details: captureError.message });
        }
    }

    fhirResource.participant[0].actor.display = encryptedPatientName;
    fhirResource.participant[1].actor.display = encryptedDoctorName;

    try {
        await docClient.send(new TransactWriteCommand({
        TransactItems: [
            {
                Put: {
                    TableName: TABLE_APPOINTMENTS,
                    Item: {
                        appointmentId, patientId, patientName: encryptedPatientName, doctorId, doctorName: encryptedDoctorName,
                        timeSlot: normalizedTime, status: "CONFIRMED",
                        paymentStatus: isFreeGpVisit ? "subscription_free" : "paid",
                        paymentId: isFreeGpVisit ? undefined : paymentIntentId,
                        createdAt: timestamp, amountPaid: amountToCharge / 100,
                        originalPrice, discountApplied, subscriptionId,
                        isFreeGpVisit,
                        coverageType: "NONE", priority, reason, patientAvatar, patientAge,
                        triageStatus: "WAITING", resource: fhirResource
                    }
                }
            },
            {
                Put: {
                    TableName: requiredResourceName("TABLE_TRANSACTIONS"),
                    Item: {
                        billId: transactionId, referenceId: appointmentId,
                        patientId, doctorId, type: "BOOKING_FEE",
                        amount: amountToCharge / 100, currency: "USD",
                        status: "PAID", createdAt: timestamp,
                        description: `Consultation with ${doctorName}`, paymentIntentId
                    }
                }
            },
            {
                // ─── LOCK TTL FIX: Extend expiry when promoting to BOOKED ───
                // ORIGINAL: Only updated status and appointmentId, leaving
                // expiresAt at the initial 15-min TTL. DynamoDB would delete
                // the lock before the appointment even started.
                // FIX: Set expiresAt to appointment end + 1 hour buffer.
                Update: {
                    TableName: TABLE_LOCKS,
                    Key: { lockId: lockKey },
                    UpdateExpression: "SET #s = :s, appointmentId = :aid, expiresAt = :exp",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: { ":s": "BOOKED", ":aid": appointmentId, ":exp": bookedLockExpiresAt }
                }
            },
            {
                Put: {
                    TableName: TABLE_GRAPH,
                    Item: {
                        PK: `PATIENT#${patientId}`, SK: `DOCTOR#${doctorId}`,
                        relationship: "isTreatedBy", doctorName: encryptedDoctorName,
                        lastVisit: normalizedTime, createdAt: timestamp
                    }
                }
            },
            {
                Put: {
                    TableName: TABLE_GRAPH,
                    Item: {
                        PK: `DOCTOR#${doctorId}`, SK: `PATIENT#${patientId}`,
                        relationship: "treats", patientName: encryptedPatientName,
                        lastVisit: normalizedTime, createdAt: timestamp
                    }
                }
            }
        ]
        }));

        // 🟢 HIPAA AUDIT: Log with Region and IP Tracking
        await writeAuditLog(patientId, patientId, "CREATE_BOOKING", `Appointment ${appointmentId} booked`, {
            doctorId, timeSlot: normalizedTime, region, ipAddress: req.ip
        });

        // Push initial PAID revenue to BigQuery analytics (symmetric with REFUND push on cancel)
        pushRevenueToBigQuery({
            billId: transactionId,
            patientId,
            doctorId,
            amount: amountToCharge / 100,
            status: "PAID",
            type: "BOOKING_FEE",
        }, region).catch(e => logger.error("[BOOKING] BigQuery initial revenue sync failed", { error: e.message }));

        await pushAppointmentToBigQuery({
            appointmentId,
            doctorId,
            patientId,
            status: "CONFIRMED",
            specialization: doctorRes.Item?.specialization
        }, region).catch(e => logger.error("[BOOKING] BigQuery appointment sync failed", { error: e.message }));

        // Event bus: appointment booked
        publishEvent(EventType.APPOINTMENT_BOOKED, { appointmentId, patientId, doctorId, timeSlot: normalizedTime, status: "CONFIRMED" }, region).catch(() => {});

        // Step 3: Post-commit side effects (PDF receipt, calendar sync)
        // These are non-critical — failures are logged but don't affect the booking
        try {
            const generator = new BookingPDFGenerator();
            await generator.generateReceipt({
                appointmentId,
                billId: transactionId,
                patientName: actualPatientName,
                doctorName: actualDoctorName,
                amount: amountToCharge / 100,
                date: normalizedTime,
                status: "PAID",
                type: "BOOKING"
            }, region).catch(e => logger.error("[BOOKING] Auto-PDF generation failed", { error: e.message }));

            // 🟢 FIX: Get the ID and update DynamoDB
            const googleEventId = await syncToGoogleCalendar(doctorId, normalizedTime, actualPatientName, reason, region);

            if (googleEventId) {
                await docClient.send(new UpdateCommand({
                    TableName: TABLE_APPOINTMENTS,
                    Key: { appointmentId },
                    UpdateExpression: "SET googleEventId = :gid",
                    ExpressionAttributeValues: { ":gid": googleEventId }
                }));
            }
        } catch (sideEffectError) {
            logger.error("Non-critical post-booking side effect failed", { appointmentId, error: sideEffectError });
        }

        // Fire-and-forget booking confirmation notification
        sendNotification({
            region,
            recipientEmail: patientRes.Item?.email,
            subject: 'Booking Confirmed',
            message: `Your appointment with Dr. ${actualDoctorName} on ${new Date(normalizedTime).toLocaleString()} has been confirmed.`,
            type: 'BOOKING_CONFIRMATION',
            metadata: { appointmentId, doctorId, timeSlot: normalizedTime }
        }).catch(() => {});

        res.status(200).json({
            message: "Appointment Secured", id: appointmentId,
            billId: transactionId, priority, queueStatus: "WAITING"
        });

    } catch (dbError: any) {
        // ─── DB FAIL AFTER CAPTURE: Issue refund (money was already taken) ───
        // ORIGINAL: Cancelled the payment hold (which hadn't been captured yet).
        // FIX: Now that capture happens first, we must REFUND (not cancel).
        logger.error("[BOOKING] CRITICAL: DB transaction failed after payment capture. Issuing refund.", { error: dbError.message });
        let compensationRefund: RefundStatus = "REQUIRES_MANUAL_REFUND";
        if (stripeInstance && paymentIntentId) {
            try {
                // A retried compensation must never refund twice; Stripe replays the first result for this key.
                const refund = await stripeInstance.refunds.create(
                    { payment_intent: paymentIntentId },
                    { idempotencyKey: `booking-compensation-refund:${paymentIntentId}` }
                );
                compensationRefund = PROVIDER_REFUND_STATUS[refund.status ?? ''] ?? "REQUIRES_MANUAL_REFUND";
                if (compensationRefund === "REQUIRES_MANUAL_REFUND") logger.error("CRITICAL ESCALATION: Booking compensation refund was not issued. Manual intervention required.", { appointmentId, paymentIntentId, refundStatus: refund.status });
                else logger.info(`Refund issued for failed booking: ${paymentIntentId}`);
            } catch (refundError) {
                // CRITICAL: Money taken but DB and refund both failed
                // This requires manual intervention
                logger.error("CRITICAL ESCALATION: Payment captured but both DB write and refund failed. Manual intervention required.", {
                    appointmentId, paymentIntentId, patientId, amount: amountToCharge
                });
            }
        }
        if (lockKey) {
            try { await docClient.send(new DeleteCommand({ TableName: TABLE_LOCKS, Key: { lockId: lockKey } })); } catch { logger.warn('BOOKING_COMPENSATION_FAILED'); }
        }
        const outcome = !paymentIntentId ? "Your booking was not completed."
            : compensationRefund === "ISSUED" ? "Your payment has been refunded."
            : compensationRefund === "PENDING" ? "A refund of your payment has been requested and is being processed."
            : "Your booking was not completed and the automatic refund did not go through. Support will refund your payment.";
        res.status(500).json({ error: `System Error. ${outcome}` });
    }
});

// FHIR R4 Status Mapping: Internal DB statuses → FHIR AppointmentStatus valueset
const FHIR_STATUS_MAP: Record<string, string> = {
    CONFIRMED: "booked",
    IN_PROGRESS: "arrived",
    COMPLETED: "fulfilled",
    CANCELLED: "cancelled",
    CANCELLED_NO_SHOW: "noshow",
    CANCELLED_DOCTOR_FAULT: "cancelled",
};

function syncFhirStatus(appointment: any): any {
    if (appointment.resource && appointment.status) {
        appointment.resource.status = FHIR_STATUS_MAP[appointment.status] || appointment.resource.status;
    }
    return appointment;
}

// FIX #7: Helper to decrypt PHI name fields on appointment records
async function decryptAppointmentNames(appointment: any, region: string): Promise<any> {
    try {
        if (appointment.patientName || appointment.doctorName) {
            const decrypted = await decryptPHI({
                patientName: appointment.patientName || "",
                doctorName: appointment.doctorName || ""
            }, region);
            appointment.patientName = decrypted.patientName || appointment.patientName;
            appointment.doctorName = decrypted.doctorName || appointment.doctorName;

            // Decrypt FHIR resource participant display names if present
            if (appointment.resource && Array.isArray(appointment.resource.participant)) {
                for (const p of appointment.resource.participant) {
                    if (p.actor?.display && typeof p.actor.display === 'string' && p.actor.display.startsWith('phi:kms:')) {
                        try {
                            const dec = await decryptPHI({ display: p.actor.display }, region);
                            p.actor.display = dec.display || p.actor.display;
                        } catch { /* fallback to encrypted */ }
                    }
                }
            }
        }
    } catch (err: any) {
        logger.error("[BOOKING] PHI decryption failed, returning as-is", { error: err.message });
    }
    return appointment;
}

async function decryptAppointmentList(items: any[], region: string): Promise<any[]> {
    return Promise.all(items.map(item => decryptAppointmentNames(item, region)));
}

export const getAppointments = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);

    // FHIR search aliases: patient → patientId, practitioner → doctorId
    const doctorId = req.query.doctorId || req.query.practitioner;
    const patientId = req.query.patientId || req.query.patient;
    const { startKey } = req.query;
    const authReq = req as AuthRequest;
    const requesterId = authReq.user?.sub || authReq.user?.id;
    const isDoctor = (req as any).user?.isDoctor;

    let exclusiveStartKey: any = undefined;
    if (startKey) {
        try { exclusiveStartKey = JSON.parse(decodeURIComponent(startKey as string)); } catch { logger.warn('BOOKING_COMPENSATION_FAILED'); }
    }

    if (patientId) {
        if (patientId !== requesterId) {
            if (!isDoctor) return res.status(403).json({ error: "Unauthorized" });

            const graphCommand = new GetCommand({
                TableName: TABLE_GRAPH,
                Key: { PK: `DOCTOR#${requesterId}`, SK: `PATIENT#${patientId}` }
            });
            const graphRes = await docClient.send(graphCommand);
            
            if (!graphRes.Item) {
                await writeAuditLog(requesterId as string, patientId as string, "HIPAA_VIOLATION_ATTEMPT", "Attempted to view ePHI of an unaffiliated patient", { region, ipAddress: req.ip });
                return res.status(403).json({ error: "HIPAA Block: No active treatment relationship with this patient." });
            }
        }

        const command = new QueryCommand({
            TableName: TABLE_APPOINTMENTS, IndexName: "PatientIndex",
            KeyConditionExpression: "patientId = :pid",
            ExpressionAttributeValues: { ":pid": patientId },
            ScanIndexForward: false, Limit: 50, ExclusiveStartKey: exclusiveStartKey 
        });
        const response = await docClient.send(command);

        await writeAuditLog(requesterId || "SYSTEM", String(patientId), "READ_APPOINTMENTS", "Viewed patient appointment history", { region, ipAddress: req.ip });

        const rawItems = (response.Items || []).map(syncFhirStatus);
        const items = await decryptAppointmentList(rawItems, region);
        return res.status(200).json({
            resourceType: "Bundle", type: "searchset", total: items.length,
            entry: items.map((a: any) => ({ resource: a.resource || a })),
            existingBookings: items, lastEvaluatedKey: response.LastEvaluatedKey
        });
    }

    if (doctorId) {
        const bookingCommand = new QueryCommand({
            TableName: TABLE_APPOINTMENTS, IndexName: "DoctorIndex",
            KeyConditionExpression: "doctorId = :did",
            ExpressionAttributeValues: { ":did": doctorId },
            ScanIndexForward: false, Limit: 50, ExclusiveStartKey: exclusiveStartKey 
        });
        const bookingRes = await docClient.send(bookingCommand);
        let bookings = bookingRes.Items ||[];

        if (!isDoctor || requesterId !== doctorId) {
            bookings = bookings.map(b => ({
                appointmentId: b.appointmentId,
                doctorId: b.doctorId,
                timeSlot: b.timeSlot,
                resource: { start: b.resource?.start },
                status: b.status 
            }));
        }

        await writeAuditLog(requesterId || "SYSTEM", String(doctorId), "READ_SCHEDULE", "Viewed doctor appointment schedule", { region, ipAddress: req.ip });

        const syncedBookings = await decryptAppointmentList(bookings.map(syncFhirStatus), region);
        return res.status(200).json({
            resourceType: "Bundle", type: "searchset", total: syncedBookings.length,
            entry: syncedBookings.map((a: any) => ({ resource: a.resource || a })),
            existingBookings: syncedBookings, lastEvaluatedKey: bookingRes.LastEvaluatedKey
        });
    }

    res.status(400).json({ error: "Missing doctorId or patientId" });
});

export const cleanupAppointments = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    
    const secretHeader = req.headers['x-internal-secret'];
    const validSecret = await getSSMParameter(CLEANUP_SECRET_PARAM, region, true);

    if (!validSecret || secretHeader !== validSecret) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const now = new Date();
    let processed = 0;
    let exclusiveStartKey: any = undefined;

    // 🟢 PAGINATION FIX
    do {
        const scanRes: any = await docClient.send(new QueryCommand({
            TableName: TABLE_APPOINTMENTS,
            IndexName: "StatusIndex", 
            KeyConditionExpression: "#s = :confirmed", 
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":confirmed": "CONFIRMED" },
            Limit: 100,
            ExclusiveStartKey: exclusiveStartKey
        }));

        const appointments = scanRes.Items ||[];
        exclusiveStartKey = scanRes.LastEvaluatedKey;

        for (const apt of appointments) {
            if (!apt.timeSlot) continue;
            const aptTime = new Date(apt.timeSlot);
            const diffMinutes = Math.floor((now.getTime() - aptTime.getTime()) / 60000);
            const isNoShow = diffMinutes >= 10 && !apt.patientArrived;
            const isDoctorFault = diffMinutes >= 30 && apt.patientArrived;
            if (!isNoShow && !isDoctorFault) continue;

            // Each appointment stands alone: one that fails is logged and retried by the next run.
            try {
                // The index may lag a check-in, so the claim pins the arrival fact this decision was made from.
                const arrival = apt.patientArrived === undefined
                    ? { expression: "attribute_not_exists(patientArrived)", values: {} }
                    : { expression: "patientArrived = :arrived", values: { ":arrived": apt.patientArrived } };
                const claim = await claimCancellation(docClient, apt.appointmentId, CLEANUP_CANCELLABLE, arrival);
                if (!claim) continue; // cancelled, checked in, or claimed by someone else meanwhile
                const status = isNoShow ? "CANCELLED_NO_SHOW" : "CANCELLED_DOCTOR_FAULT";
                await cancelAppointment(apt, status, await decideRefund(docClient, apt, region, isNoShow ? "NO_SHOW" : "REFUND"), region, claim);
                processed++;
            } catch (e: any) {
                logger.error("[BOOKING] Cleanup could not cancel appointment", { appointmentId: apt.appointmentId, error: e.message });
            }
        }
    } while (exclusiveStartKey);

    // Audit log for the overall cleanup operation
    await writeAuditLog(
        "SYSTEM",
        "SYSTEM",
        "SYSTEM_CLEANUP_NO_SHOWS",
        `Automated cleanup processed ${processed} stale appointments`,
        { region, processedCount: processed, ipAddress: req.ip }
    ).catch(() => {});

    res.status(200).json({ message: "Cleanup Complete", processed });
});

export const cancelBookingUser = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    
    const { appointmentId } = req.body;
    const authReq = req as AuthRequest;
    const patientId = authReq.user?.sub || authReq.user?.id;

    if (!patientId) return res.status(401).json({ message: "Unauthorized." });

    const getCmd = new GetCommand({ TableName: TABLE_APPOINTMENTS, Key: { appointmentId } });
    const aptRes = await docClient.send(getCmd);
    const apt = aptRes.Item;

    if (!apt) return res.status(404).json({ message: "Appointment not found" });
    if (apt.patientId !== patientId) return res.status(403).json({ message: "Identity mismatch." });

    // Decryption below works in place; the stored resource must keep its encrypted participant names.
    const storedResource = apt.resource ? structuredClone(apt.resource) : null;

    // FIX #7: Decrypt PHI names for downstream use (PDF receipt, etc.)
    await decryptAppointmentNames(apt, region);

    // 🟢 SECURITY FIX 1: Prevent Post-Consultation Refunds (Fraud Prevention)
    if (apt.status === 'COMPLETED' || apt.status === 'IN_PROGRESS') {
        await writeAuditLog(patientId, patientId, "FRAUD_ATTEMPT", "Tried to refund a completed session", { region, ipAddress: req.ip });
        return res.status(400).json({ message: "Cannot cancel an appointment that is already in progress or completed." });
    }

    // 🟢 SECURITY FIX 2: Prevent Time-Travel Refunds
    const aptTime = new Date(apt.timeSlot).getTime();
    const hoursUntilApt = (aptTime - Date.now()) / (1000 * 60 * 60);

    if (aptTime <= Date.now()) {
        return res.status(400).json({ message: "Cannot cancel past appointments." });
    }
    if (hoursUntilApt < 24) {
        await writeAuditLog(patientId, patientId, "LATE_CANCELLATION_ATTEMPT", "Tried to cancel within 24 hours", { region, ipAddress: req.ip });
        return res.status(400).json({ message: "Policy Block: Cancellations are not permitted less than 24 hours before the appointment time. Please contact support." });
    }

    // 1. Claim the cancellation so repeated or concurrent requests cannot refund twice.
    const claim = await claimCancellation(docClient, appointmentId, PATIENT_CANCELLABLE);
    if (!claim) return res.status(409).json({ message: CANCELLATION_COPY.conflict });

    // 2. Refund Logic
    const refund = await decideRefund(docClient, apt, region, "REFUND");

    // 3. Update Appointment Status
    const fhirResource = storedResource;
    if (fhirResource) {
        fhirResource.status = FHIR_CANCELLED;
        fhirResource.cancelationReason = { coding: [{ system: "http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason", code: "pat", display: "Patient" }], text: "Cancelled by patient" };
        if (Array.isArray(fhirResource.participant)) {
            fhirResource.participant.forEach((p: any) => p.status = "declined");
        }
    }

    // 3b. Atomic: Update appointment status + create refund transaction (only when a payment was taken)
    const transactionId = refundBillId(appointmentId);
    const ledgerDescription = refund.refundStatus === "REQUIRES_MANUAL_REFUND"
        ? CANCELLATION_COPY.ledgerPatient.manual : CANCELLATION_COPY.ledgerPatient.refunded;
    await finalizeCancellation(docClient, apt, { status: "CANCELLED", resource: fhirResource, refund, claim, ledgerDescription });

    if (apt.googleEventId && apt.doctorId) {
        deleteFromGoogleCalendar(apt.doctorId, apt.googleEventId, region).catch(e => logger.error("[BOOKING] Calendar delete failed on user cancel", { error: e.message }));
    }

    // 3b. Clean up graph-data relationship entries (only if no other active appointments with same doctor)
    if (apt.doctorId) {
        try {
            // Query for other active appointments between this patient and doctor
            const otherApts = await docClient.send(new QueryCommand({
                TableName: TABLE_APPOINTMENTS,
                IndexName: "PatientIndex",
                KeyConditionExpression: "patientId = :pid",
                FilterExpression: "doctorId = :did AND appointmentId <> :currentId AND #s IN (:confirmed, :inProgress, :completed)",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: {
                    ":pid": patientId,
                    ":did": apt.doctorId,
                    ":currentId": appointmentId,
                    ":confirmed": "CONFIRMED",
                    ":inProgress": "IN_PROGRESS",
                    ":completed": "COMPLETED"
                },
                Limit: 1
            }));

            // Only delete graph-data if no other active appointments exist
            if (!otherApts.Items || otherApts.Items.length === 0) {
                const graphTable = setting("TABLE_GRAPH");
                // Delete PATIENT→DOCTOR relationship
                await docClient.send(new DeleteCommand({
                    TableName: graphTable,
                    Key: { PK: `PATIENT#${patientId}`, SK: `DOCTOR#${apt.doctorId}` }
                }));
                // Delete DOCTOR→PATIENT relationship
                await docClient.send(new DeleteCommand({
                    TableName: graphTable,
                    Key: { PK: `DOCTOR#${apt.doctorId}`, SK: `PATIENT#${patientId}` }
                }));
            }
        } catch (graphErr: any) {
            logger.error("[BOOKING] Failed to clean graph-data on cancel", { error: graphErr.message });
        }
    }

    // 4. Audit Log
    try {
        await writeAuditLog(patientId, patientId, "CANCEL_BOOKING", `Appointment ${appointmentId} cancelled`, {
            reason: "User requested", region, ipAddress: req.ip
        });
        const generator = new BookingPDFGenerator();
        await generator.generateReceipt({
            appointmentId,
            billId: apt.paymentId || appointmentId,
            patientName: apt.patientName,
            doctorName: apt.doctorName,
            amount: apt.amountPaid ?? 0,
            date: new Date().toISOString(),
            ...receiptFor({ status: "CANCELLED", refundStatus: refund.refundStatus })
        }, region).catch(e => logger.error("[BOOKING] Auto-refund PDF generation failed", { error: e.message }));
    } catch (e) { logger.error("[BOOKING] Audit log failed for user cancellation"); }

    // Push cancellation to BigQuery analytics
    pushAppointmentToBigQuery({
        appointmentId,
        doctorId: apt.doctorId,
        patientId: apt.patientId,
        status: "CANCELLED",
        specialization: apt.specialization,
        reason: "Patient cancellation",
        amountPaid: apt.amountPaid
    }, region).catch(e => logger.error("[BOOKING] BigQuery cancellation sync failed", { error: e.message }));

    // Push refund revenue to BigQuery analytics
    if (refund.recordLedger) {
        pushRevenueToBigQuery({
            billId: transactionId,
            patientId: apt.patientId,
            doctorId: apt.doctorId || "UNKNOWN",
            amount: -(apt.amountPaid || 0),
            status: REVENUE_STATUS[refund.refundStatus],
            type: "REFUND",
        }, region).catch(e => logger.error("[BOOKING] BigQuery refund revenue sync failed", { error: e.message }));
    }

    // Fire-and-forget cancellation notification
    sendNotification({
        region,
        recipientEmail: (req as any).user?.email,
        subject: CANCELLATION_COPY.noticeSubjectPatient,
        message: cancellationNotice(appointmentId, "CANCELLED", refund.refundStatus),
        type: 'BOOKING_CANCELLATION',
        metadata: { appointmentId }
    }).catch(() => {});

    // Event bus: appointment cancelled
    publishEvent(EventType.APPOINTMENT_CANCELLED, { appointmentId, patientId: apt.patientId, doctorId: apt.doctorId, reason: "Patient cancellation" }, region).catch(() => {});

    res.status(200).json({ message: `${CANCELLATION_COPY.patientResponse} ${REFUND_NOTICES[refund.refundStatus]}`.trim(), refundStatus: refund.refundStatus });
});

export const updateAppointment = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    
    const { appointmentId, patientArrived, status } = req.body;
    const authReq = req as AuthRequest;
    const requesterId = authReq.user?.sub || authReq.user?.id;
    const isDoctor = (req as any).user?.isDoctor; 

    if (!appointmentId) return res.status(400).json({ message: "Missing appointmentId" });

    const existing = await docClient.send(new GetCommand({ TableName: TABLE_APPOINTMENTS, Key: { appointmentId } }));
    if (!existing.Item) return res.status(404).json({ message: "Not found" });

    if (existing.Item.patientId !== requesterId && existing.Item.doctorId !== requesterId) {
        await writeAuditLog(requesterId || "SYSTEM", existing.Item.patientId, "HIJACK_ATTEMPT", "User tried to modify another user's appointment", { region, ipAddress: req.ip });
        return res.status(403).json({ message: "Unauthorized to modify this appointment" });
    }

    if (!isDoctor && status) {
        await writeAuditLog(requesterId || "SYSTEM", existing.Item.patientId, "FRAUD_ATTEMPT", "Patient tried to alter appointment status directly", { region, ipAddress: req.ip });
        return res.status(403).json({ message: "Security Block: Patients cannot manually change appointment statuses." });
    }

    if (status === 'CANCELLED' || status === 'CANCELLED_NO_SHOW') {
        const claim = await claimCancellation(docClient, appointmentId, DOCTOR_CANCELLABLE);
        if (!claim) return res.status(409).json({ message: CANCELLATION_COPY.conflict });

        const refund = await decideRefund(docClient, existing.Item, region, "REFUND");
        await cancelAppointment(existing.Item, status, refund, region, claim);

        await writeAuditLog(requesterId || "SYSTEM", existing.Item.patientId, "CANCEL_APPOINTMENT_DOCTOR", `Doctor cancelled appointment ${appointmentId}`, { region, ipAddress: req.ip });

        return res.status(200).json({ message: `${CANCELLATION_COPY.doctorResponse} ${REFUND_NOTICES[refund.refundStatus]}`.trim(), refundStatus: refund.refundStatus });
    }

    let updateExpression = "set lastUpdated = :now";
    const expressionAttributeValues: any = { ":now": new Date().toISOString() };
    const expressionAttributeNames: any = {};

    if (patientArrived !== undefined) {
        updateExpression += ", patientArrived = :pa";
        expressionAttributeValues[":pa"] = patientArrived;
    }

    if (status) {
        updateExpression += ", #s = :s";
        expressionAttributeNames["#s"] = "status";
        expressionAttributeValues[":s"] = status;
    }

    // A live cancellation owns the appointment until it finishes; only an abandoned (expired) claim may be written over.
    expressionAttributeValues[":staleClaim"] = staleClaimCutoff();
    try {
        await docClient.send(new UpdateCommand({
            TableName: TABLE_APPOINTMENTS, Key: { appointmentId },
            UpdateExpression: updateExpression,
            ConditionExpression: CLAIM_FREE,
            ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
            ExpressionAttributeValues: expressionAttributeValues
        }));
    } catch (e) {
        if ((e as { name?: string })?.name === "ConditionalCheckFailedException") return res.status(409).json({ message: CANCELLATION_COPY.changeConflict });
        throw e;
    }
    if (existing.Item.cancellationClaim) {
        logger.error("[BOOKING] Appointment changed over an abandoned cancellation claim; check for an unrecorded refund", { appointmentId });
    }

    let actionType = "UPDATE_APPOINTMENT";
    let actionDesc = `Updated appointment ${appointmentId}`;
    if (patientArrived !== undefined) {
        actionType = "PATIENT_CHECK_IN";
        actionDesc = `Patient entered the virtual waiting room.`;
    } else if (status) {
        actionType = "APPOINTMENT_STATUS_CHANGE";
        actionDesc = `Appointment status changed to ${status}`;
    }

    await writeAuditLog(requesterId || "SYSTEM", existing.Item.patientId, actionType, actionDesc, { region, ipAddress: req.ip, appointmentId });
    if (status) {
        await pushAppointmentToBigQuery({
            appointmentId,
            doctorId: existing.Item.doctorId,
            patientId: existing.Item.patientId,
            status: status,
            specialization: existing.Item.specialization
        }, region).catch(e => logger.error("[BOOKING] BigQuery appointment update sync failed", { error: e.message }));
    }

    res.status(200).json({ message: "Appointment updated successfully" });
});
// ─── Cancellation and refund helpers ─────────────────────────────────────────
// Every cancellation path claims the appointment first, so only one live caller talks to the payment provider, and
// records at most one refund row under a deterministic id. A refund counts as issued only when Stripe reports it
// succeeded and as requested while it is pending; anything else is queued for a manual refund and never described as
// refunded. A claim whose request died expires after the configured TTL and may be taken over; the refund keeps its
// idempotency key and metadata, so the taker finds the refund already made instead of making another.
type RefundOutcome = { refundId: string; refundStatus: RefundStatus; recordLedger: boolean };
const PROVIDER_REFUND_STATUS: Record<string, RefundStatus> = { succeeded: "ISSUED", pending: "PENDING" };
const RECORDED_REFUND_STATUSES: readonly string[] = ["ISSUED", "PENDING", "REQUIRES_MANUAL_REFUND"];
const REVENUE_STATUS: Record<RefundStatus, string> = {
    ISSUED: "REFUNDED", PENDING: "REFUND_PENDING", REQUIRES_MANUAL_REFUND: "REFUND_FAILED", NOT_APPLICABLE: "NOT_APPLICABLE"
};
const ledgerStatusOf = (refundStatus: RefundStatus) =>
    refundStatus === "ISSUED" || refundStatus === "PENDING" ? "PROCESSED" : MANUAL_REFUND_LEDGER_STATUS;

type DocClient = ReturnType<typeof getRegionalClient>;
type PaymentRecord = { paymentId?: string; amountPaid?: number };
const errorMessage = (e: unknown) => e instanceof Error ? e.message : String(e);
const hasRealPayment = (apt: PaymentRecord) => !!apt.paymentId && apt.paymentId !== "TEST_MODE" && (apt.amountPaid ?? 0) > 0;

/** True for writes that may proceed: no cancellation claim, or only one abandoned past its TTL. */
const CLAIM_FREE = "(attribute_not_exists(cancellationClaim) OR cancellationClaimedAt < :staleClaim)";
const staleClaimCutoff = () => new Date(Date.now() - getCancellationSettings().claimTtlSeconds * 1000).toISOString();

/** What the patient is told. A no-show notice promises nothing about money that was not actually returned. */
function cancellationNotice(appointmentId: string, status: string, refundStatus: RefundStatus): string {
    const returned = refundStatus === "ISSUED" || refundStatus === "PENDING";
    const lead = status === "CANCELLED_NO_SHOW" ? CANCELLATION_COPY.noShowNotice(appointmentId) : CANCELLATION_COPY.notice(appointmentId);
    return status === "CANCELLED_NO_SHOW" && !returned ? lead : `${lead} ${REFUND_NOTICES[refundStatus]}`.trim();
}

/** What a receipt may say about an appointment: a credit note only for money actually returned or on its way back. */
function receiptFor(apt: { status?: string; refundStatus?: string }): { type: "BOOKING" | "REFUND" | "CANCELLATION"; status: string } {
    // A pending refund is never shown as refunded, even when charge.refunded has already marked the appointment.
    if (apt.refundStatus === "PENDING" && (apt.status === "REFUNDED" || String(apt.status ?? "").includes("CANCELLED"))) return { type: "REFUND", status: RECEIPT_STATUS.refundPending };
    // refund.failed keeps the REFUNDED status charge.refunded wrote, but the money never went back.
    if (apt.refundStatus === "REQUIRES_MANUAL_REFUND" && apt.status === "REFUNDED") return { type: "CANCELLATION", status: RECEIPT_STATUS.underReview };
    if (apt.status === "REFUNDED") return { type: "REFUND", status: RECEIPT_STATUS.refunded };
    if (!String(apt.status ?? "").includes("CANCELLED")) return { type: "BOOKING", status: RECEIPT_STATUS.paid };
    if (apt.refundStatus === "ISSUED") return { type: "REFUND", status: RECEIPT_STATUS.refunded };
    if (apt.refundStatus === "PENDING") return { type: "REFUND", status: RECEIPT_STATUS.refundPending };
    // Cancellations recorded before refundStatus existed cannot prove a refund, so they never get a credit note.
    if (apt.refundStatus === undefined) return { type: "CANCELLATION", status: RECEIPT_STATUS.cancelled };
    if (apt.status === "CANCELLED_NO_SHOW") return { type: "CANCELLATION", status: RECEIPT_STATUS.noShow };
    if (apt.refundStatus === "REQUIRES_MANUAL_REFUND") return { type: "CANCELLATION", status: RECEIPT_STATUS.underReview };
    return { type: "CANCELLATION", status: RECEIPT_STATUS.cancelled };
}

/** A condition the claim must also hold, pinning a fact the caller decided from. */
type ClaimFact = { expression: string; values: Record<string, unknown> };

async function claimCancellation(docClient: DocClient, appointmentId: string, allowedStatuses: readonly string[], fact?: ClaimFact): Promise<string | null> {
    const claim = randomUUID();
    const statusValues = Object.fromEntries(allowedStatuses.filter(s => s !== REFUNDED_STATUS).map((status, i) => [`:allowed${i}`, status]));
    const refundedClaimable = allowedStatuses.includes(REFUNDED_STATUS);
    const refundedCondition = "(#s = :refunded AND NOT (attribute_exists(cancellationId) OR attribute_exists(refundId) OR #res.#fhirStatus = :fhirCancelled))";
    // DynamoDB rejects an empty IN (), so a list without other statuses keeps only the REFUNDED branch.
    const statusConditions = [...(Object.keys(statusValues).length ? [`#s IN (${Object.keys(statusValues).join(", ")})`] : []), ...(refundedClaimable ? [refundedCondition] : [])];
    const conditions = [
        `(${statusConditions.join(" OR ")})`,
        CLAIM_FREE, ...(fact ? [`(${fact.expression})`] : [])];
    try {
        await docClient.send(new UpdateCommand({
            TableName: TABLE_APPOINTMENTS, Key: { appointmentId },
            UpdateExpression: "SET cancellationClaim = :claim, cancellationClaimedAt = :now",
            ConditionExpression: conditions.join(" AND "),
            ExpressionAttributeNames: { "#s": "status", ...(refundedClaimable ? { "#res": "resource", "#fhirStatus": "status" } : {}) },
            ExpressionAttributeValues: { ":claim": claim, ":now": new Date().toISOString(), ":staleClaim": staleClaimCutoff(), ...statusValues,
                ...(refundedClaimable ? { ":refunded": REFUNDED_STATUS, ":fhirCancelled": FHIR_CANCELLED } : {}), ...fact?.values }
        }));
        return claim;
    } catch (e) {
        if ((e as { name?: string })?.name === "ConditionalCheckFailedException") return null;
        throw e;
    }
}

/** Lets a retry proceed after a failed save; the refund's idempotency key makes that retry safe. */
async function releaseCancellationClaim(docClient: DocClient, appointmentId: string, claim: string) {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_APPOINTMENTS, Key: { appointmentId },
        UpdateExpression: "REMOVE cancellationClaim, cancellationClaimedAt",
        ConditionExpression: "cancellationClaim = :claim",
        ExpressionAttributeValues: { ":claim": claim }
    })).catch(() => logger.error("[BOOKING] Cancellation claim could not be released; operator review required", { appointmentId }));
}

/**
 * What happens to the money of a claimed cancellation. A refund row already recorded for the appointment decides the
 * outcome, so nothing is refunded or recorded twice. A patient no-show is not refunded automatically (existing
 * policy); a paid one is queued for staff review.
 */
async function decideRefund(docClient: DocClient, apt: Record<string, any>, region: string, policy: "REFUND" | "NO_SHOW"): Promise<RefundOutcome> {
    const recorded = (await docClient.send(new GetCommand({
        TableName: requiredResourceName("TABLE_TRANSACTIONS"), Key: { billId: refundBillId(apt.appointmentId) }, ConsistentRead: true
    }))).Item;
    if (recorded) {
        const refundStatus: RefundStatus = RECORDED_REFUND_STATUSES.includes(recorded.refundStatus) ? recorded.refundStatus
            : recorded.status === "PROCESSED" ? "ISSUED" : "REQUIRES_MANUAL_REFUND";
        return { refundId: typeof recorded.refundId === "string" ? recorded.refundId : "RECORDED", refundStatus, recordLedger: false };
    }
    if (!hasRealPayment(apt)) return { refundId: "NOT_APPLICABLE", refundStatus: "NOT_APPLICABLE", recordLedger: false };
    if (policy === "NO_SHOW") return { refundId: "NOT_REFUNDED", refundStatus: "REQUIRES_MANUAL_REFUND", recordLedger: true };
    return { ...await refundAppointmentPayment(apt.appointmentId, apt, region), recordLedger: true };
}

async function refundAppointmentPayment(appointmentId: string, apt: PaymentRecord, region: string): Promise<Omit<RefundOutcome, "recordLedger">> {
    try {
        const stripeKey = await getSSMParameter(STRIPE_SECRET_NAME, region, true);
        if (!stripeKey || !apt.paymentId) throw new Error("Payment provider key unavailable");
        const stripe = new Stripe(stripeKey);
        const refund = (await listPaymentRefunds(stripe, apt.paymentId)).find(r => r.metadata?.appointmentRefund === appointmentId)
            ?? await createAppointmentRefund(stripe, apt.paymentId, appointmentId, region);
        const refundStatus = PROVIDER_REFUND_STATUS[refund.status ?? ""] ?? "REQUIRES_MANUAL_REFUND";
        if (refundStatus === "REQUIRES_MANUAL_REFUND") logger.error("[BOOKING] Refund not issued; manual refund required", { appointmentId, refundStatus: refund.status });
        return { refundId: refund.id, refundStatus };
    } catch (e) {
        logger.error("[BOOKING] Refund failed; manual refund required", { appointmentId, error: errorMessage(e) });
        return { refundId: "REFUND_FAILED", refundStatus: "REQUIRES_MANUAL_REFUND" };
    }
}

/** Every refund on a payment. Stripe's idempotency cache can expire, so our own refund is found by its metadata. */
async function listPaymentRefunds(stripe: Stripe, paymentIntent: string): Promise<Stripe.Refund[]> {
    const { refundMaxPages } = getCancellationRefundSettings();
    const refunds: Stripe.Refund[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
        // An incomplete list could hide our own refund, so past the bound the refund goes to a person instead.
        if (++pages > refundMaxPages) throw new Error("Refund list exceeds the configured page bound");
        const page = await stripe.refunds.list({ payment_intent: paymentIntent, starting_after: cursor });
        refunds.push(...page.data);
        const next = page.has_more ? page.data.at(-1)?.id : undefined;
        if (page.has_more && (!next || next === cursor)) throw new Error("Refund list pagination stalled");
        cursor = next;
    } while (cursor);
    return refunds;
}

async function createAppointmentRefund(stripe: Stripe, paymentIntent: string, appointmentId: string, region: string): Promise<Stripe.Refund> {
    try {
        // The metadata routes refund.failed to this appointment's region. Stripe replays a key only for identical
        // parameters, so a retry of a request sent before region was added fails and goes to a person.
        return await stripe.refunds.create(
            { payment_intent: paymentIntent, metadata: { appointmentRefund: appointmentId, region } },
            { idempotencyKey: `appointment-refund:${appointmentId}` }
        );
    } catch (e) {
        // charge_already_refunded (docs.stripe.com/error-codes): the money is already back, so the refund on record
        // decides the outcome; with none on record the case goes to a person.
        if ((e as { code?: string })?.code !== "charge_already_refunded") throw e;
        const refunds = await listPaymentRefunds(stripe, paymentIntent);
        const onRecord = refunds.find(r => r.status === "pending") ?? refunds.find(r => r.status === "succeeded");
        if (!onRecord) throw e;
        return onRecord;
    }
}

type Finalization = { status: string; resource: unknown; refund: RefundOutcome; claim: string; ledgerDescription: string };

/**
 * Saves a claimed cancellation atomically: the appointment, its refund row and the released slot. The write is pinned
 * to the claim and to the patient not having been erased meanwhile. A write can commit and still fail on the way
 * back, so a failure is checked against a consistent read; a real failure releases the claim and propagates.
 */
async function finalizeCancellation(docClient: DocClient, apt: any, f: Finalization): Promise<void> {
    const now = new Date().toISOString();
    const transactItems: any[] = [{
        Update: {
            TableName: TABLE_APPOINTMENTS, Key: { appointmentId: apt.appointmentId },
            UpdateExpression: "SET #s = :s, #res = :resource, refundId = :r, refundStatus = :rs, cancellationId = :claim, lastUpdated = :now REMOVE cancellationClaim, cancellationClaimedAt",
            ConditionExpression: "cancellationClaim = :claim AND (attribute_not_exists(patientName) OR patientName <> :erased)",
            ExpressionAttributeNames: { "#s": "status", "#res": "resource" },
            ExpressionAttributeValues: { ":s": f.status, ":resource": f.resource ?? null, ":r": f.refund.refundId, ":rs": f.refund.refundStatus,
                ":claim": f.claim, ":now": now, ":erased": ERASED_MARKER }
        }
    }];
    if (f.refund.recordLedger) {
        transactItems.push({
            Put: {
                TableName: requiredResourceName("TABLE_TRANSACTIONS"),
                ConditionExpression: "attribute_not_exists(billId)",
                Item: {
                    billId: refundBillId(apt.appointmentId), referenceId: apt.appointmentId,
                    patientId: apt.patientId, doctorId: apt.doctorId || "UNKNOWN",
                    type: "REFUND", amount: -(apt.amountPaid || 0),
                    currency: "USD", status: ledgerStatusOf(f.refund.refundStatus),
                    refundId: f.refund.refundId, refundStatus: f.refund.refundStatus,
                    createdAt: now, description: f.ledgerDescription
                }
            }
        });
    }
    // Include lock release in the atomic transaction to prevent orphaned locks
    if (apt.doctorId && apt.timeSlot) {
        transactItems.push({ Delete: { TableName: TABLE_LOCKS, Key: { lockId: `${apt.doctorId}#${normalizeTimeSlot(apt.timeSlot)}` } } });
    }
    try {
        await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (finalizeError) {
        const saved = await docClient.send(new GetCommand({ TableName: TABLE_APPOINTMENTS, Key: { appointmentId: apt.appointmentId }, ConsistentRead: true }))
            .then(result => result.Item, () => undefined);
        if (saved?.cancellationId === f.claim) {
            logger.info("[BOOKING] Cancellation save reported an error after it committed", { appointmentId: apt.appointmentId });
            return;
        }
        await releaseCancellationClaim(docClient, apt.appointmentId, f.claim);
        throw finalizeError;
    }
}

/** Finalizes a claimed cancellation. A failed save releases the claim and propagates; side effects stay best-effort. */
async function cancelAppointment(apt: any, newStatus: string, refund: RefundOutcome, region: string, claim: string) {
    const docClient = getRegionalClient(region);
    const { refundId, refundStatus } = refund;
    // Decryption below works in place; the stored resource must keep its encrypted participant names.
    const storedResource = apt.resource ? structuredClone(apt.resource) : null;
    // FIX #7: Decrypt PHI names for downstream use (PDF receipt)
    await decryptAppointmentNames(apt, region);
    const refundBill = refundBillId(apt.appointmentId);
    if (storedResource) {
        storedResource.status = FHIR_CANCELLED;
        if (Array.isArray(storedResource.participant)) {
            storedResource.participant.forEach((p: any) => p.status = "declined");
        }
    }
    // Finalize: the one step whose failure the caller must see.
    await finalizeCancellation(docClient, apt, { status: newStatus, resource: storedResource, refund, claim,
        ledgerDescription: newStatus === "CANCELLED_NO_SHOW" ? CANCELLATION_COPY.ledgerNoShow : CANCELLATION_COPY.ledgerSystem });
    try {
        // 2. Google Calendar Cleanup (If connected)
        if (apt.googleEventId && apt.doctorId) {
            await deleteFromGoogleCalendar(apt.doctorId, apt.googleEventId, region).catch(e =>
                logger.error("[BOOKING] Cleanup calendar delete failed", { error: e.message })
            );
        }

        // 🟢 FIX: These must be OUTSIDE the google check to work for everyone!
        // 3. AUTOMATIC SYSTEM RECEIPT
        const generator = new BookingPDFGenerator();
        await generator.generateReceipt({
            appointmentId: apt.appointmentId,
            billId: apt.paymentId || apt.appointmentId,
            patientName: apt.patientName,
            doctorName: apt.doctorName,
            amount: apt.amountPaid ?? 0,
            date: new Date().toISOString(),
            ...receiptFor({ status: newStatus, refundStatus })
        }, region).catch(e => logger.error("[BOOKING] Auto-system PDF generation failed", { error: e.message }));

        // 4. BIGQUERY TELEMETRY
        await pushAppointmentToBigQuery({
            appointmentId: apt.appointmentId,
            doctorId: apt.doctorId,
            patientId: apt.patientId,
            status: newStatus,
            specialization: apt.specialization
        }, region).catch(e => logger.error("[BOOKING] BigQuery cancellation sync failed", { error: e.message }));

        // Push refund revenue to BigQuery analytics
        if (refund.recordLedger) {
            pushRevenueToBigQuery({
                billId: refundBill,
                patientId: apt.patientId,
                doctorId: apt.doctorId || "UNKNOWN",
                amount: -(apt.amountPaid || 0),
                status: REVENUE_STATUS[refundStatus],
                type: "REFUND",
            }, region).catch(e => logger.error("[BOOKING] BigQuery refund revenue sync failed", { error: e.message }));
        }

        // FIX #10: Audit log for cancellation
        try {
            await writeAuditLog(
                apt.patientId || "SYSTEM",
                apt.patientId || "UNKNOWN",
                "CANCEL_APPOINTMENT",
                `Appointment ${apt.appointmentId} cancelled with status ${newStatus}`,
                { region, appointmentId: apt.appointmentId, refundId, newStatus }
            );
        } catch (auditErr: any) {
            logger.error("[BOOKING] Audit log failed for cancellation", { error: auditErr.message });
        }

        // Event bus: appointment cancelled
        publishEvent(EventType.APPOINTMENT_CANCELLED, {
            appointmentId: apt.appointmentId, patientId: apt.patientId,
            doctorId: apt.doctorId, status: newStatus, refundId
        }, region).catch(() => {});

        // Clean up graph-data relationship entries (only if no other active appointments with same doctor)
        if (apt.doctorId && apt.patientId) {
            try {
                const otherApts = await docClient.send(new QueryCommand({
                    TableName: TABLE_APPOINTMENTS,
                    IndexName: "PatientIndex",
                    KeyConditionExpression: "patientId = :pid",
                    FilterExpression: "doctorId = :did AND appointmentId <> :currentId AND #s IN (:confirmed, :inProgress, :completed)",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                        ":pid": apt.patientId,
                        ":did": apt.doctorId,
                        ":currentId": apt.appointmentId,
                        ":confirmed": "CONFIRMED",
                        ":inProgress": "IN_PROGRESS",
                        ":completed": "COMPLETED"
                    },
                    Limit: 1
                }));

                if (!otherApts.Items || otherApts.Items.length === 0) {
                    const graphTable = setting("TABLE_GRAPH");
                    await docClient.send(new DeleteCommand({
                        TableName: graphTable,
                        Key: { PK: `PATIENT#${apt.patientId}`, SK: `DOCTOR#${apt.doctorId}` }
                    }));
                    await docClient.send(new DeleteCommand({
                        TableName: graphTable,
                        Key: { PK: `DOCTOR#${apt.doctorId}`, SK: `PATIENT#${apt.patientId}` }
                    }));
                }
            } catch (graphErr: any) {
                logger.error("[BOOKING] Failed to clean graph-data on cancel", { error: graphErr.message });
            }
        }

        // Fire-and-forget cancellation notification to patient
        if (apt.patientId) {
            try {
                const recipientEmail = await patientContactEmail(docClient, apt.patientId, region);
                if (recipientEmail) {
                    sendNotification({
                        region,
                        recipientEmail,
                        subject: CANCELLATION_COPY.noticeSubjectSystem,
                        message: cancellationNotice(apt.appointmentId, newStatus, refundStatus),
                        type: 'BOOKING_CANCELLATION',
                        metadata: { appointmentId: apt.appointmentId }
                    }).catch(() => {});
                } else {
                    logger.error("[BOOKING] Cancellation notice not sent: patient not notified (no email on profile)", { appointmentId: apt.appointmentId });
                }
            } catch (noticeErr: unknown) {
                // Non-blocking: the cancellation is already saved.
                logger.error("[BOOKING] Cancellation notice failed: patient not notified", { appointmentId: apt.appointmentId, error: noticeErr instanceof Error ? noticeErr.message : String(noticeErr) });
            }
        }

    } catch (e: any) { logger.error("[BOOKING] Post-cancellation side effect failed", { error: e.message }); }
}

export const getReceipt = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    
    const { appointmentId } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.user?.sub || authReq.user?.id;

    const getCmd = new GetCommand({ TableName: TABLE_APPOINTMENTS, Key: { appointmentId } });
    const result = await docClient.send(getCmd);
    const apt = result.Item;

    if (!apt) return res.status(404).json({ message: "Appointment not found" });
    if (apt.patientId !== userId) return res.status(403).json({ message: "Unauthorized" });

    // FIX #7: Decrypt PHI names for PDF receipt
    await decryptAppointmentNames(apt, region);

    try {
        const generator = new BookingPDFGenerator();
        const url = await generator.generateReceipt({
            appointmentId: apt.appointmentId,
            billId: apt.paymentId || appointmentId, 
            patientName: apt.patientName || "Patient",
            doctorName: apt.doctorName || "Doctor", 
            // Never invent an amount: a record without one shows what was actually paid, nothing.
            amount: apt.amountPaid ?? 0,
            date: apt.timeSlot || new Date().toISOString(),
            ...receiptFor(apt)
        }, region); 

        res.status(200).json({ downloadUrl: url });
    } catch (pdfError: any) {
        logger.error("[BOOKING] PDF receipt generation failed", { error: pdfError.message });
        res.status(500).json({ message: "Receipt generation failed on the server." });
    }
});

// 🟢 NEW HELPER: Sync to Google Calendar (DynamoDB Migrated)
async function syncToGoogleCalendar(doctorId: string, timeSlot: string, patientName: string, reason: string, region: string): Promise<string | null> {
    try {
        const docClient = getRegionalClient(region);

        const res = await docClient.send(new GetCommand({
            TableName: TABLE_DOCTORS,
            Key: { doctorId },
            ProjectionExpression: "googleRefreshToken"
        }));

        const storedToken = res.Item?.googleRefreshToken;
        if (!storedToken) return null; // Return null if no token

        // ─── KMS DECRYPTION FIX: Decrypt token before use ───
        const refreshToken = await decryptToken(storedToken, region);

        const doctorBase = process.env.DOCTOR_SERVICE_URL; 
        if (!doctorBase) throw new Error("Critical Config Error: DOCTOR_SERVICE_URL is missing.");

        const redirectUri = `${doctorBase.replace(/\/$/, '')}/doctors/auth/google/callback`;

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUri
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const startTime = new Date(timeSlot);
        const endTime = new Date(startTime.getTime() + 30 * 60000); 

        const response = await calendar.events.insert({ // Capture the response
            calendarId: 'primary',
            requestBody: {
                summary: `Consultation: ${patientName}`,
                description: `Reason: ${reason}\n\nManaged by MediConnect`,
                start: { dateTime: startTime.toISOString() },
                end: { dateTime: endTime.toISOString() },
                reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] }
            }
        });

        logger.info("[BOOKING] Calendar event created successfully");
        return response.data.id || null; // 🟢 RETURN THE ID

    } catch (error: any) {
        logger.error("[BOOKING] Calendar sync failed", { error: error.message });
        return null;
    }
}

async function deleteFromGoogleCalendar(doctorId: string, googleEventId: string, region: string) {
    try {
        const docClient = getRegionalClient(region);

        // 1. Get Doctor's Refresh Token
        const res = await docClient.send(new GetCommand({
            TableName: TABLE_DOCTORS,
            Key: { doctorId },
            ProjectionExpression: "googleRefreshToken"
        }));

        const storedToken = res.Item?.googleRefreshToken;
        if (!storedToken) return;

        // ─── KMS DECRYPTION FIX: Decrypt token before use ───
        const refreshToken = await decryptToken(storedToken, region);

        // 2. Auth with Google
        const doctorBase = process.env.DOCTOR_SERVICE_URL; 
        if (!doctorBase) throw new Error("Critical Config Error: DOCTOR_SERVICE_URL is missing.");

        const redirectUri = `${doctorBase.replace(/\/$/, '')}/doctors/auth/google/callback`;

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUri
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // 3. DELETE the event
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: googleEventId
        });

        logger.info("[BOOKING] Calendar event deleted successfully");
    } catch (error: any) {
        logger.error("[BOOKING] Calendar event deletion failed", { error: error.message });
    }
}