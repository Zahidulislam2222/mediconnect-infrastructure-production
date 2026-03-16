import { Request, Response, NextFunction } from 'express';
import { getRegionalClient, getSecret, getSSMParameter } from '../../../shared/aws-config';
import { PutCommand, QueryCommand, GetCommand, DeleteCommand, TransactWriteCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import { logger } from '../../../shared/logger';
import { writeAuditLog } from '../../../shared/audit';
import { BookingPDFGenerator } from "../utils/pdf-generator";
import { google } from 'googleapis';
import { pushAppointmentToBigQuery, pushRevenueToBigQuery } from './billing.controller';

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
    try {
        await docClient.send(new PutCommand({
            TableName: TABLE_LOCKS,
            Item: {
                lockId: lockKey,
                reservedBy: patientId,
                status: "LOCKED",
                createdAt: new Date().toISOString(),
                expiresAt: Math.floor(Date.now() / 1000) + (15 * 60)
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
        console.error("Payment Failed:", paymentError.message);
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
        serviceType: [{ coding: [{ code: "general", display: "General Practice" }] }]
    };

    // 4. TransactWriteItems (Atomic Commit to Regional DB)
    try {
        await docClient.send(new TransactWriteCommand({
        TransactItems: [
            {
                Put: {
                    TableName: TABLE_APPOINTMENTS,
                    Item: {
                        appointmentId, patientId, patientName: actualPatientName, doctorId, doctorName: actualDoctorName,
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
                Update: {
                    TableName: TABLE_LOCKS,
                    Key: { lockId: lockKey },
                    UpdateExpression: "SET #s = :s, appointmentId = :aid",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: { ":s": "BOOKED", ":aid": appointmentId }
                }
            },
            {
                Put: {
                    TableName: TABLE_GRAPH,
                    Item: {
                        PK: `PATIENT#${patientId}`, SK: `DOCTOR#${doctorId}`,
                        relationship: "isTreatedBy", doctorName: doctorName,
                        lastVisit: normalizedTime, createdAt: timestamp
                    }
                }
            },
            {
                Put: {
                    TableName: TABLE_GRAPH,
                    Item: {
                        PK: `DOCTOR#${doctorId}`, SK: `PATIENT#${patientId}`,
                        relationship: "treats", patientName: patientName,
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
        pushAppointmentToBigQuery({
            appointmentId,
            doctorId,
            patientId,
            status: "CONFIRMED",
            specialization: doctorRes.Item?.specialization
        }, region).catch(e => console.error(e));
        

        if (stripeInstance && paymentIntentId) {
            try {
                await stripeInstance.paymentIntents.capture(paymentIntentId);
                logger.info(`Payment captured for ${appointmentId}`);

                pushRevenueToBigQuery({
                    billId: transactionId,
                    patientId: patientId, // The function will hash this automatically
                    doctorId: doctorId,
                    amount: amountToCharge / 100,
                    status: "PAID"
                }, region).catch((e: any) => console.error("Revenue Stream Fail:", e));
                
                // 🟢 FIX: Get the ID and update DynamoDB
                const googleEventId = await syncToGoogleCalendar(doctorId, normalizedTime, patientName, reason, region);
                
                if (googleEventId) {
                    await docClient.send(new UpdateCommand({
                        TableName: TABLE_APPOINTMENTS,
                        Key: { appointmentId },
                        UpdateExpression: "SET googleEventId = :gid",
                        ExpressionAttributeValues: { ":gid": googleEventId }
                    }));
                }
            } catch (captureError) {
                logger.error("CRITICAL: DB Write Success but Payment Capture or Calendar Sync Failed", { appointmentId, paymentIntentId });
            }
        }

        res.status(200).json({
            message: "Appointment Secured", id: appointmentId,
            billId: transactionId, priority, queueStatus: "WAITING"
        });

    } catch (dbError: any) {
        console.error("Transaction Failed. Releasing Payment Hold.", dbError);
        if (stripeInstance && paymentIntentId) {
            try { await stripeInstance.paymentIntents.cancel(paymentIntentId); } catch (e) { }
        }
        if (lockKey) {
            try { await docClient.send(new DeleteCommand({ TableName: TABLE_LOCKS, Key: { lockId: lockKey } })); } catch (e) { }
        }
        res.status(500).json({ error: "System Error. Payment hold released." });
    }
});

export const getAppointments = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    
    const { doctorId, patientId, startKey } = req.query;
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

        return res.status(200).json({ existingBookings: response.Items ||[], lastEvaluatedKey: response.LastEvaluatedKey });
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

        return res.status(200).json({ existingBookings: bookings, lastEvaluatedKey: bookingRes.LastEvaluatedKey });
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
                    } catch (e) { console.error("Refund failed", e); }
                }
                await cancelAppointment(apt, "CANCELLED_DOCTOR_FAULT", refundId, region);
                processed++;
            }
        }
    } while (exclusiveStartKey);

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
            console.error("Stripe Refund Failed:", e.message);
            refundId = "REFUND_FAILED_MANUAL_REQUIRED";
        }
    }

    // 2. Update Appointment Status
    let fhirResource = apt.resource;
    if (fhirResource) {
        fhirResource.status = "cancelled"; // Root status
        if (Array.isArray(fhirResource.participant)) {
            // FHIR Spec: Participants decline, they do not "cancel"
            fhirResource.participant.forEach((p: any) => p.status = "declined"); 
        }
    }

    let updateExpression = "set #s = :s, #res = :resource";
    const expressionAttributeValues: any = { ":s": "CANCELLED", ":resource": fhirResource || null };
    const expressionAttributeNames: any = { "#s": "status", "#res": "resource" };

    await docClient.send(new UpdateCommand({
        TableName: TABLE_APPOINTMENTS, Key: { appointmentId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));

    // 3. Delete Lock
    if (apt.doctorId && apt.timeSlot) {
        try {
            const lockKey = `${apt.doctorId}#${normalizeTimeSlot(apt.timeSlot)}`;
            await docClient.send(new DeleteCommand({ TableName: TABLE_LOCKS, Key: { lockId: lockKey } }));
        } catch (lockError) { console.error("Failed to release lock:", lockError); }
    }

    if (apt.googleEventId && apt.doctorId) {
        deleteFromGoogleCalendar(apt.doctorId, apt.googleEventId, region).catch(console.error);
    }

    // 4. Audit Log
    try {
        await writeAuditLog(patientId, patientId, "CANCEL_BOOKING", `Appointment ${appointmentId} cancelled`, { 
            reason: "User requested", region, ipAddress: req.ip 
        });
        pushAppointmentToBigQuery({
            appointmentId,
            doctorId: apt.doctorId,
            patientId,
            status: "CANCELLED",
            specialization: apt.specialization
        }, region).catch(e => console.error(e));
    } catch (e) { console.warn("Audit log failed..."); }

    // 5. Ledger Entry
    if (apt.amountPaid > 0) {
        const transactionId = randomUUID();
        const txStatus = refundId === "REFUND_FAILED_MANUAL_REQUIRED" ? "FAILED_REQUIRES_MANUAL_REFUND" : "PROCESSED";
        
        await docClient.send(new PutCommand({
            TableName: TABLE_TRANSACTIONS,
            Item: {
                billId: transactionId, referenceId: appointmentId,
                patientId, doctorId: apt.doctorId || "UNKNOWN",
                type: "REFUND", amount: -(apt.amountPaid || 0),
                currency: "USD", status: txStatus, // 🟢 ACCOUNTING FIX: Track failed refunds
                createdAt: new Date().toISOString(), 
                description: txStatus === "PROCESSED" ? "User requested cancellation" : "Refund Failed - Contact Support"
            }
        }));
    }

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
                    
                    // Log the refund transaction
                    await docClient.send(new PutCommand({
                        TableName: TABLE_TRANSACTIONS,
                        Item: {
                            billId: randomUUID(), referenceId: appointmentId,
                            patientId: existing.Item.patientId, doctorId: existing.Item.doctorId,
                            type: "REFUND", amount: -(existing.Item.amountPaid || 0),
                            currency: "USD", status: "PROCESSED",
                            createdAt: new Date().toISOString(), description: "Doctor requested cancellation"
                        }
                    }));
                }
            } catch (e: any) {
                console.error("Stripe Refund Failed during Doctor Cancel:", e.message);
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
        pushAppointmentToBigQuery({
            appointmentId,
            doctorId: existing.Item.doctorId,
            patientId: existing.Item.patientId,
            status: status,
            specialization: existing.Item.specialization
        }, region).catch(e => console.error(e));
    }

    res.status(200).json({ message: "Appointment updated successfully" });
});
// Helper Function
async function cancelAppointment(apt: any, newStatus: string, refundId: string, region: string) {
    const docClient = getRegionalClient(region);
    try {
        // 🟢 FHIR & DYNAMODB CRASH FIX (Applied to Helper)
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

        await docClient.send(new UpdateCommand({
            TableName: TABLE_APPOINTMENTS, Key: { appointmentId: apt.appointmentId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        }));

        if (apt.doctorId && apt.timeSlot) {
            const lockKey = `${apt.doctorId}#${normalizeTimeSlot(apt.timeSlot)}`;
            await docClient.send(new DeleteCommand({ TableName: TABLE_LOCKS, Key: { lockId: lockKey } }));
        }

        if (apt.googleEventId && apt.doctorId) {
            deleteFromGoogleCalendar(apt.doctorId, apt.googleEventId, region).catch(e => 
                console.error("[Cleanup] Calendar delete failed:", e.message)
            );
            pushAppointmentToBigQuery({
            appointmentId: apt.appointmentId,
            doctorId: apt.doctorId,
            patientId: apt.patientId,
            status: newStatus,
            specialization: apt.specialization
        }, region).catch(e => console.error(e));
        }

    } catch (e) { console.error("Cancel update failed", e); }
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
        console.error("PDF Generation Error:", pdfError);
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
        
        const refreshToken = res.Item?.googleRefreshToken;
        if (!refreshToken) return null; // Return null if no token

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.API_PUBLIC_URL}/doctors/auth/google/callback`
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

        console.log(`[Calendar] Event created for ${doctorId}`);
        return response.data.id || null; // 🟢 RETURN THE ID

    } catch (error: any) {
        console.error("[Calendar Sync Failed]:", error.message);
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
        
        const refreshToken = res.Item?.googleRefreshToken;
        if (!refreshToken) return;

        // 2. Auth with Google
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // 3. DELETE the event
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: googleEventId
        });

        console.log(`[Calendar] Event ${googleEventId} deleted for doctor ${doctorId}`);
    } catch (error: any) {
        console.error("[Calendar Delete Failed]:", error.message);
    }
}