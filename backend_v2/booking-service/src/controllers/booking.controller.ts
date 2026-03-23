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

// 🛡️ ARCHITECTURAL PURGE: 'pg' and 'db.ts' have been completely removed.
// All data (including pricing and tokens) now securely flows through Regional DynamoDB.

interface AuthRequest extends Request {
    user?: {
        sub?: string;
        id?: string;
        email_verified?: boolean;
    };
}

const TABLE_APPOINTMENTS = process.env.TABLE_APPOINTMENTS || "mediconnect-appointments";
const TABLE_LOCKS = process.env.TABLE_LOCKS || "mediconnect-booking-locks";
const TABLE_PATIENTS = process.env.TABLE_PATIENTS || "mediconnect-patients";
const TABLE_DOCTORS = process.env.TABLE_DOCTORS || "mediconnect-doctors"; // 🟢 Replaced Postgres
const TABLE_TRANSACTIONS = process.env.TABLE_TRANSACTIONS || "mediconnect-transactions";
const TABLE_GRAPH = process.env.TABLE_GRAPH || "mediconnect-graph-data";
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
export const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

// --- CONTROLLER METHODS ---

export const createBooking = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    
    let stripeInstance: Stripe | null = null;
    let paymentIntentId: string | null = null;
    let lockKey: string | null = null;

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
    
    lockKey = `${doctorId}#${normalizedTime}`;
    const transactionId = randomUUID();
    const appointmentId = randomUUID();
    const timestamp = new Date().toISOString();

    let patientAge = "N/A";
    let patientAvatar: string | null = null;
    let amountToCharge = 5000; 

    const [patientRes, doctorRes] = await Promise.all([
        docClient.send(new GetCommand({ TableName: TABLE_PATIENTS, Key: { patientId } })),
        docClient.send(new GetCommand({ TableName: TABLE_DOCTORS, Key: { doctorId } }))
    ]);

    if (!patientRes.Item || patientRes.Item.status === 'DELETED' || patientRes.Item.isIdentityVerified !== true) {
        return res.status(403).json({ message: "HIPAA Block: Patient identity not verified." });
    }

    if (!doctorRes.Item || doctorRes.Item.verificationStatus !== 'APPROVED') {
        return res.status(404).json({ message: "Doctor is currently unavailable or unverified." });
    }

    // Safely extract data
    const actualPatientName = patientRes.Item.name || patientName || "Unknown Patient";
    const actualDoctorName = doctorRes.Item.name || doctorName || "Medical Provider";
    patientAvatar = patientRes.Item.avatar || null;
    if (patientRes.Item.dob) {
        const dob = new Date(patientRes.Item.dob);
        patientAge = Math.abs(new Date(Date.now() - dob.getTime()).getUTCFullYear() - 1970).toString();
    }
    let fee = Number(doctorRes.Item.consultationFee);
    if (isNaN(fee) || fee < 0) fee = 50; // Fallback to safe default
    amountToCharge = Math.round(fee * 100);

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
            region 
            },
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' }
        });
        paymentIntentId = paymentIntent.id;
    } catch (paymentError: any) {
        logger.error("[BOOKING] Payment authorization failed", { error: paymentError.message });
        await docClient.send(new DeleteCommand({ TableName: TABLE_LOCKS, Key: { lockId: lockKey } }));
        return res.status(402).json({ error: "Payment Failed", details: paymentError.message });
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
            try { await stripeInstance.paymentIntents.cancel(paymentIntentId); } catch (e) { }
            if (lockKey) {
                try { await docClient.send(new DeleteCommand({ TableName: TABLE_LOCKS, Key: { lockId: lockKey } })); } catch (e) { }
            }
            return res.status(402).json({ error: "Payment capture failed. Your card was not charged.", details: captureError.message });
        }
    }

    // Step 2: TransactWriteItems (Atomic Commit to Regional DB) — only after payment confirmed
    // FIX #7: Encrypt PHI (patient/doctor names) before storing in DynamoDB
    let encryptedPatientName = actualPatientName;
    let encryptedDoctorName = actualDoctorName;
    try {
        const encryptedNames = await encryptPHI({ patientName: actualPatientName, doctorName: actualDoctorName }, region);
        encryptedPatientName = encryptedNames.patientName;
        encryptedDoctorName = encryptedNames.doctorName;
        // Update FHIR resource participant display names with encrypted values
        if (fhirResource && Array.isArray(fhirResource.participant)) {
            fhirResource.participant[0].actor.display = encryptedPatientName;
            fhirResource.participant[1].actor.display = encryptedDoctorName;
        }
    } catch (encErr: any) {
        logger.error("[BOOKING] PHI encryption failed, storing plaintext as fallback", { error: encErr.message });
    }

    try {
        await docClient.send(new TransactWriteCommand({
        TransactItems: [
            {
                Put: {
                    TableName: TABLE_APPOINTMENTS,
                    Item: {
                        appointmentId, patientId, patientName: encryptedPatientName, doctorId, doctorName: encryptedDoctorName,
                        timeSlot: normalizedTime, status: "CONFIRMED",
                        paymentStatus: "paid", paymentId: paymentIntentId,
                        createdAt: timestamp, amountPaid: amountToCharge / 100,
                        coverageType: "NONE", priority, reason, patientAvatar, patientAge,
                        triageStatus: "WAITING", resource: fhirResource
                    }
                }
            },
            {
                Put: {
                    TableName: TABLE_TRANSACTIONS,
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
        if (stripeInstance && paymentIntentId) {
            try {
                await stripeInstance.refunds.create({ payment_intent: paymentIntentId });
                logger.info(`Refund issued for failed booking: ${paymentIntentId}`);
            } catch (refundError) {
                // CRITICAL: Money taken but DB and refund both failed
                // This requires manual intervention
                logger.error("CRITICAL ESCALATION: Payment captured but both DB write and refund failed. Manual intervention required.", {
                    appointmentId, paymentIntentId, patientId, amount: amountToCharge
                });
            }
        }
        if (lockKey) {
            try { await docClient.send(new DeleteCommand({ TableName: TABLE_LOCKS, Key: { lockId: lockKey } })); } catch (e) { }
        }
        res.status(500).json({ error: "System Error. Your payment has been refunded." });
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
        try { exclusiveStartKey = JSON.parse(decodeURIComponent(startKey as string)); } catch (e) { }
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
    const stripeKey = await getSSMParameter(STRIPE_SECRET_NAME, region, true);
    const stripe = stripeKey ? new Stripe(stripeKey) : null;
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

            if (diffMinutes >= 10 && !apt.patientArrived) {
                await cancelAppointment(apt, "CANCELLED_NO_SHOW", "FAILED", region);
                processed++;
                continue;
            }

            if (diffMinutes >= 30 && apt.patientArrived) {
                let refundId = "REFUND_FAILED";
                if (stripe && apt.paymentId && apt.paymentId !== "TEST_MODE") {
                    try {
                        const refund = await stripe.refunds.create({ payment_intent: apt.paymentId });
                        refundId = refund.id;
                    } catch (e: any) { logger.error("[BOOKING] Refund failed during cleanup", { error: e.message }); }
                }
                await cancelAppointment(apt, "CANCELLED_DOCTOR_FAULT", refundId, region);
                processed++;
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

    // 1. Refund Logic
    let refundId = "NOT_APPLICABLE";
    if (apt.paymentId && apt.paymentId !== "TEST_MODE") {
        try {
            const stripeKey = await getSSMParameter(STRIPE_SECRET_NAME, region, true);
            if (stripeKey) {
                const stripe = new Stripe(stripeKey);
                const refund = await stripe.refunds.create({ payment_intent: apt.paymentId });
                refundId = refund.id;
            }
        } catch (e: any) {
            logger.error("[BOOKING] Stripe refund failed for user cancellation", { error: e.message });
            refundId = "REFUND_FAILED_MANUAL_REQUIRED";
        }
    }

    // 2. Update Appointment Status
    let fhirResource = apt.resource;
    if (fhirResource) {
        fhirResource.status = "cancelled";
        fhirResource.cancelationReason = { coding: [{ system: "http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason", code: "pat", display: "Patient" }], text: "Cancelled by patient" };
        if (Array.isArray(fhirResource.participant)) {
            fhirResource.participant.forEach((p: any) => p.status = "declined");
        }
    }

    // 2b. Atomic: Update appointment status + create refund transaction (if amount > 0)
    const transactionId = randomUUID();
    const txStatus = refundId === "REFUND_FAILED_MANUAL_REQUIRED" ? "FAILED_REQUIRES_MANUAL_REFUND" : "PROCESSED";

    const transactItems: any[] = [
        {
            Update: {
                TableName: TABLE_APPOINTMENTS, Key: { appointmentId },
                UpdateExpression: "set #s = :s, #res = :resource",
                ExpressionAttributeNames: { "#s": "status", "#res": "resource" },
                ExpressionAttributeValues: { ":s": "CANCELLED", ":resource": fhirResource || null }
            }
        }
    ];

    if (apt.amountPaid > 0) {
        transactItems.push({
            Put: {
                TableName: TABLE_TRANSACTIONS,
                Item: {
                    billId: transactionId, referenceId: appointmentId,
                    patientId, doctorId: apt.doctorId || "UNKNOWN",
                    type: "REFUND", amount: -(apt.amountPaid || 0),
                    currency: "USD", status: txStatus,
                    createdAt: new Date().toISOString(),
                    description: txStatus === "PROCESSED" ? "User requested cancellation" : "Refund Failed - Contact Support"
                }
            }
        });
    }

    // Include lock release in the atomic transaction to prevent orphaned locks
    if (apt.doctorId && apt.timeSlot) {
        const lockKey = `${apt.doctorId}#${normalizeTimeSlot(apt.timeSlot)}`;
        transactItems.push({
            Delete: {
                TableName: TABLE_LOCKS,
                Key: { lockId: lockKey }
            }
        });
    }

    await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

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
                const graphTable = process.env.TABLE_GRAPH || 'mediconnect-graph-data';
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
            amount: apt.amountPaid || 0,
            date: new Date().toISOString(),
            status: "REFUNDED",
            type: "REFUND"
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
    if (apt.amountPaid > 0) {
        pushRevenueToBigQuery({
            billId: transactionId,
            patientId: apt.patientId,
            doctorId: apt.doctorId || "UNKNOWN",
            amount: -(apt.amountPaid || 0),
            status: txStatus === "PROCESSED" ? "REFUNDED" : "REFUND_FAILED",
            type: "REFUND",
        }, region).catch(e => logger.error("[BOOKING] BigQuery refund revenue sync failed", { error: e.message }));
    }

    // Fire-and-forget cancellation notification
    sendNotification({
        region,
        recipientEmail: (req as any).user?.email,
        subject: 'Booking Cancelled',
        message: `Your appointment (${appointmentId}) has been cancelled and a refund has been initiated.`,
        type: 'BOOKING_CANCELLATION',
        metadata: { appointmentId }
    }).catch(() => {});

    // Event bus: appointment cancelled
    publishEvent(EventType.APPOINTMENT_CANCELLED, { appointmentId, patientId: apt.patientId, doctorId: apt.doctorId, reason: "Patient cancellation" }, region).catch(() => {});

    res.status(200).json({ message: "Appointment cancelled and refunded" });
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
        let refundId = "REFUND_FAILED";

        if (existing.Item.paymentId && existing.Item.paymentId !== "TEST_MODE") {
            try {
                const stripeKey = await getSSMParameter(STRIPE_SECRET_NAME, region, true);
                if (stripeKey) {
                    const stripe = new Stripe(stripeKey);
                    const refund = await stripe.refunds.create({ payment_intent: existing.Item.paymentId });
                    refundId = refund.id;
                }
            } catch (e: any) {
                logger.error("[BOOKING] Stripe refund failed during doctor cancellation", { error: e.message });
            }
        }

        await cancelAppointment(existing.Item, status, refundId, region);

        await writeAuditLog(requesterId || "SYSTEM", existing.Item.patientId, "CANCEL_APPOINTMENT_DOCTOR", `Doctor cancelled appointment ${appointmentId}`, { region, ipAddress: req.ip });
        
        return res.status(200).json({ message: "Appointment cancelled, refunded, and schedule unlocked." });
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

    await docClient.send(new UpdateCommand({
        TableName: TABLE_APPOINTMENTS, Key: { appointmentId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues
    }));

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
// Helper Function
async function cancelAppointment(apt: any, newStatus: string, refundId: string, region: string) {
    const docClient = getRegionalClient(region);
    // FIX #7: Decrypt PHI names for downstream use (PDF receipt)
    await decryptAppointmentNames(apt, region);
    try {
        // 1. FHIR & DYNAMODB CRASH FIX
        let fhirResource = apt.resource;
        if (fhirResource) {
            fhirResource.status = "cancelled"; 
            if (Array.isArray(fhirResource.participant)) {
                fhirResource.participant.forEach((p: any) => p.status = "declined"); 
            }
        }

        let updateExpression = "set #s = :s, refundId = :r, lastUpdated = :now, #res = :resource";
        const expressionAttributeValues: any = { 
            ":s": newStatus, 
            ":r": refundId, 
            ":now": new Date().toISOString(),
            ":resource": fhirResource || null
        };
        const expressionAttributeNames: any = { "#s": "status", "#res": "resource" };

        // Atomic appointment update + refund transaction (matches cancelBookingUser TransactWrite pattern)
        const refundBillId = randomUUID();
        const txStatus = (apt.amountPaid > 0)
            ? (refundId === "FAILED" || refundId === "REFUND_FAILED" ? "FAILED_REQUIRES_MANUAL_REFUND" : "PROCESSED")
            : null;

        const transactItems: any[] = [
            {
                Update: {
                    TableName: TABLE_APPOINTMENTS, Key: { appointmentId: apt.appointmentId },
                    UpdateExpression: updateExpression,
                    ExpressionAttributeNames: expressionAttributeNames,
                    ExpressionAttributeValues: expressionAttributeValues
                }
            }
        ];

        if (apt.amountPaid > 0 && txStatus) {
            transactItems.push({
                Put: {
                    TableName: TABLE_TRANSACTIONS,
                    Item: {
                        billId: refundBillId, referenceId: apt.appointmentId,
                        patientId: apt.patientId, doctorId: apt.doctorId || "UNKNOWN",
                        type: "REFUND", amount: -(apt.amountPaid || 0),
                        currency: "USD", status: txStatus,
                        createdAt: new Date().toISOString(),
                        description: newStatus === "CANCELLED_NO_SHOW" ? "No-show cancellation" : "System cancellation"
                    }
                }
            });
        }

        // Include lock release in the atomic transaction to prevent orphaned locks
        if (apt.doctorId && apt.timeSlot) {
            const lockKey = `${apt.doctorId}#${normalizeTimeSlot(apt.timeSlot)}`;
            transactItems.push({
                Delete: {
                    TableName: TABLE_LOCKS,
                    Key: { lockId: lockKey }
                }
            });
        }

        await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

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
            amount: apt.amountPaid || 0,
            date: new Date().toISOString(),
            status: refundId.includes("REFUND") || refundId !== "FAILED" ? "REFUNDED" : "CANCELLED",
            type: "REFUND"
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
        if (apt.amountPaid > 0) {
            pushRevenueToBigQuery({
                billId: refundBillId,
                patientId: apt.patientId,
                doctorId: apt.doctorId || "UNKNOWN",
                amount: -(apt.amountPaid || 0),
                status: txStatus === "PROCESSED" ? "REFUNDED" : "REFUND_FAILED",
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
                    const graphTable = process.env.TABLE_GRAPH || 'mediconnect-graph-data';
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
                const patientRecord = await docClient.send(new GetCommand({
                    TableName: process.env.DYNAMO_TABLE || 'mediconnect-patients',
                    Key: { patientId: apt.patientId },
                    ProjectionExpression: 'email'
                }));
                if (patientRecord.Item?.email) {
                    sendNotification({
                        region,
                        recipientEmail: patientRecord.Item.email,
                        subject: 'Appointment Cancelled',
                        message: `Your appointment (${apt.appointmentId}) has been cancelled. ${refundId !== 'FAILED' ? 'A refund has been initiated.' : 'Please contact support for refund.'}`,
                        type: 'BOOKING_CANCELLATION',
                        metadata: { appointmentId: apt.appointmentId }
                    }).catch(() => {});
                }
            } catch { /* Non-blocking */ }
        }

    } catch (e: any) { logger.error("[BOOKING] Cancel appointment update failed", { error: e.message }); }
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

    const statusStr = apt.status || "";
    const isCancelled = statusStr.includes("CANCELLED");

    try {
        const generator = new BookingPDFGenerator();
        const url = await generator.generateReceipt({
            appointmentId: apt.appointmentId,
            billId: apt.paymentId || appointmentId, 
            patientName: apt.patientName || "Patient",
            doctorName: apt.doctorName || "Doctor", 
            amount: apt.amountPaid || 50,
            date: apt.timeSlot || new Date().toISOString(),
            status: isCancelled ? "REFUNDED" : "PAID",
            type: isCancelled ? "REFUND" : "BOOKING"
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