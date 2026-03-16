import { Request, Response, NextFunction } from 'express';

// AWS SDK v3
import { GetCommand, PutCommand, UpdateCommand, ScanCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CompareFacesCommand } from "@aws-sdk/client-rekognition";
import { PublishCommand } from "@aws-sdk/client-sns";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { getRegionalSESClient, getRegionalCognitoClient, getSSMParameter } from '../../../shared/aws-config';
import { AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import Stripe from "stripe";
import { randomUUID } from "crypto";
import { GoogleAuth } from "google-auth-library";

// Shared Utilities
import { safeError } from '../../../shared/logger';
import { writeAuditLog } from '../../../shared/audit';

// Shared Clients
import { getRegionalClient, getRegionalS3Client, getRegionalRekognitionClient, getRegionalSNSClient } from '../../../shared/aws-config';

// =============================================================================
// ⚙️ CONFIGURATION & ENV HANDLING
// =============================================================================
const CONFIG = {
    get DYNAMO_TABLE() { return process.env.DYNAMO_TABLE || 'mediconnect-patients'; },
    get DOCTOR_TABLE() { return process.env.DYNAMO_TABLE_DOCTORS || 'mediconnect-doctors'; },
    get BUCKET_NAME() { return process.env.BUCKET_NAME || 'mediconnect-patient-data'; },
};

// =============================================================================
// 🛠️ HELPERS
// =============================================================================

// Helper to handle async errors (Prevents Node.js crash on unhandled promises)
const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// 🟢 COMPILER & GDPR FIX: Safely parse headers to determine Legal Jurisdiction
export const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

/**
 * Generates a temporary signed URL for viewing private S3 avatars.
 * 🟢 HIPAA 2026 Standard: PHI links must expire in 15 minutes (900s).
 */
async function signAvatarUrl(avatarKey: string | null, region: string): Promise<string | null> {
    if (!avatarKey) return null;

    let finalKey = avatarKey;

    if (avatarKey.startsWith('http')) {
        const match = avatarKey.match(/(patient|doctor)\/[a-zA-Z0-9-]+\/[^?]+/);
        if (match) finalKey = match[0]; 
        else return avatarKey;
    }

    try {
        const regionalS3 = getRegionalS3Client(region);
        const baseBucket = CONFIG.BUCKET_NAME;
        const isEU = region.toUpperCase() === 'EU';
        const bucketName = (isEU && !baseBucket.endsWith('-eu')) 
    ? `${baseBucket}-eu` 
    : baseBucket;
        const command = new GetObjectCommand({ Bucket: bucketName, Key: finalKey });
        
        return await getSignedUrl(regionalS3, command, { expiresIn: 900 });
    } catch (e) {
        safeError(`[Avatar Sign Error]`, e);
        return null;
    }
}

// =============================================================================
// 🎮 CONTROLLERS
// =============================================================================

/**
 * 1. CREATE PATIENT (FHIR R4 Compliant)
 */
export const createPatient = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);
    
    const authUser = (req as any).user;
    if (!authUser || !authUser.id) {
        return res.status(401).json({ error: "Unauthorized: You must be logged in." });
    }

    const finalId = authUser.id; 
    // 🟢 ADDED: Extract consentDetails from the frontend request
    const { email, name, role = 'patient', dob, gender = 'unknown', phone, consentDetails } = req.body;

    if (!email) return res.status(400).json({ error: "Missing email" });

    // 🟢 GDPR & HIPAA STRICT CHECK: Explicit Consent Validation
    if (!consentDetails || consentDetails.agreedToTerms !== true) {
        // Block the registration completely if consent is missing
        await writeAuditLog(finalId, finalId, "CONSENT_FAILURE", "Failed registration: Missing explicit consent.", { region, ipAddress: req.ip });
        return res.status(400).json({ error: "Legal compliance failure: Explicit consent to Terms and Privacy Policy is required." });
    }

    // Lock down the consent record with server-side timestamps and IPs to prevent spoofing
    const verifiedConsent = {
        ...consentDetails,
        backendVerifiedIp: req.ip,
        recordedAt: new Date().toISOString()
    };

    const timestamp = new Date().toISOString();

    const fhirResource = {
        resourceType: "Patient",
        id: finalId,
        active: true,
        name: [{ use: "official", text: name }],
        telecom: [{ system: "email", value: email }, { system: "phone", value: phone }],
        gender: gender?.toLowerCase(),
        birthDate: dob,
        meta: { lastUpdated: timestamp }
    };

    const item = {
        patientId: finalId,
        email,
        name,
        role,
        isEmailVerified: true,
        isIdentityVerified: false,
        createdAt: timestamp,
        avatar: null,
        dob,
        resource: fhirResource,
        region: region,
        consent: verifiedConsent // 🟢 SAVED TO DYNAMODB FOREVER (Required for Audits)
    };

    try {
        await dynamicDb.send(new PutCommand({ 
            TableName: CONFIG.DYNAMO_TABLE, 
            Item: item,
            ConditionExpression: "attribute_not_exists(patientId)"
        }));
    } catch (e: any) {
        if (e.name === 'ConditionalCheckFailedException') return res.status(409).json({ error: 'Patient already registered' });
        throw e;
    }

    // 🟢 AUDIT LOG FIX: Explicitly log that consent was given
    await writeAuditLog(finalId, finalId, "CREATE_PROFILE", "Patient registration and explicit GDPR/HIPAA consent captured", { 
        region, 
        ipAddress: req.ip,
        policyVersion: consentDetails.policyVersion || "v1.0"
    });

    res.status(200).json({ message: "Patient Registration Processed", region, profile: item });
});

/**
 * 2. GET PROFILE (Strict Ownership Check)
 */
export const getProfile = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);
    
    const requestedId = req.params.id;
    const requesterId = (req as any).user?.id;
    const isDoctor = (req as any).user?.isDoctor;

    const targetId = requestedId || requesterId;

    // 🟢 PRIVACY GATE: Only the owner or a verified Doctor can view a profile
    if (requestedId && requestedId !== requesterId && !isDoctor) {
        await writeAuditLog(requesterId || "UNKNOWN", targetId, "UNAUTHORIZED_READ_ATTEMPT", "Blocked attempt to read another patient.");
        return res.status(403).json({ error: "HIPAA Violation: Unauthorized access." });
    }

    const response = await dynamicDb.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { patientId: targetId }
    }));

    if (!response.Item) return res.status(404).json({ error: "Profile not found." });

    response.Item.avatar = await signAvatarUrl(response.Item.avatar, region);

    await writeAuditLog(requesterId, targetId, "READ_PROFILE", "Profile accessed", {
        role: isDoctor ? "doctor" : "patient",
        region,
        ipAddress: req.ip
    });

    res.json(response.Item);
});

/**
 * 3. UPDATE PROFILE (FHIR Sync) - SECURED
 */
export const updateProfile = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);

    const requestedId = req.params.id;
    const requesterId = (req as any).user?.id;

    if (requestedId !== requesterId) {
        return res.status(403).json({ error: "Unauthorized to edit this profile." });
    }

    const body = req.body;

    // 🟢 SECURITY FIX: Prevent S3 Avatar Spoofing
    if (body.avatar && typeof body.avatar === 'string') {
        if (!body.avatar.includes(requesterId)) {
            await writeAuditLog(requesterId, requestedId, "SPOOF_ATTEMPT", "Attempted to link external S3 asset", { region, ipAddress: req.ip });
            return res.status(403).json({ error: "Security Violation: Cannot link to another user's avatar." });
        }
        const match = body.avatar.match(/(patient|doctor)\/[a-zA-Z0-9-]+\/[^?]+/);
        if (match) body.avatar = match[0];
    }

    // 🟢 SECURITY FIX: Removed 'isEmailVerified' to prevent Privilege Escalation
    const allowedUpdates =['name', 'avatar', 'phone', 'address', 'preferences', 'dob', 'fcmToken']; 
    const parts: string[] =[];
    const names: any = {};
    const values: any = {};

    allowedUpdates.forEach(field => {
        if (body[field] !== undefined) {
            parts.push(`#${field} = :${field}`);
            names[`#${field}`] = field;
            values[`:${field}`] = body[field];

            // FHIR Mapping
            if (field === 'name') {
                parts.push("#res.#nm[0].#txt = :fhirName");
                names["#res"] = "resource";
                names["#nm"] = "name";
                names["#txt"] = "text";
                values[":fhirName"] = body[field];
            }
            if (field === 'dob') {
                parts.push("#res.#bd = :dob");
                names["#res"] = "resource";
                names["#bd"] = "birthDate";
            }
            if (field === 'phone') {
                parts.push("#res.telecom[1].#val = :phone");
                names["#res"] = "resource";
                names["#val"] = "value";
            }
        }
    });

    if (parts.length === 0) return res.status(400).json({ error: "No valid fields to update" });

    const now = new Date().toISOString();
    parts.push("#updatedAt = :now", "#res.#meta.#lu = :now");
    names["#updatedAt"] = "updatedAt";
    names["#meta"] = "meta";
    names["#lu"] = "lastUpdated";
    values[":now"] = now;

    const response = await dynamicDb.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { patientId: requestedId },
        UpdateExpression: "SET " + parts.join(", "),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW"
    }));

    await writeAuditLog(requesterId, requestedId, "UPDATE_PROFILE", "Patient profile updated", {
        region, ipAddress: req.ip
    });
    
    res.json({ message: "Profile updated successfully", profile: response.Attributes });
});

/**
 * 4. VERIFY IDENTITY (AI Rekognition)
 */
export const verifyIdentity = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const authUser = (req as any).user;
    
    const { selfieImage, idImage, gender } = req.body;
    if (!authUser?.id || !selfieImage) return res.status(400).json({ error: "Missing identity data" });

    const userId = authUser.id;
    const dynamicDb = getRegionalClient(region); 

    // 🟢 HIPAA FIX: Hardcoded to Patient Table Only (Least Privilege)
    const targetTable = CONFIG.DYNAMO_TABLE;

    const userCheck = await dynamicDb.send(new GetCommand({
        TableName: targetTable,
        Key: { patientId: userId }
    }));

    if (!userCheck.Item) {
        return res.status(401).json({ error: "Security Alert: Account no longer exists." });
    }

    // 🟢 HIPAA/GDPR FIX: Strict Pathing & Auto-Delete Tags
    const idCardKey = `patient/${userId}/id_card.jpg`;
    const fileTags = "auto-delete=true"; // Patients trigger the 24h deletion rule

    const regionalS3 = getRegionalS3Client(region);
    const regionalRek = getRegionalRekognitionClient(region);
    const baseBucket = CONFIG.BUCKET_NAME;
    const isEU = region.toUpperCase() === 'EU';
    const bucketName = (isEU && !baseBucket.endsWith('-eu')) 
    ? `${baseBucket}-eu` 
    : baseBucket;

    if (idImage) {
        await regionalS3.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: idCardKey,
            Body: Buffer.from(idImage, 'base64'),
            ContentType: 'image/jpeg',
            Tagging: fileTags
        }));
    }

    const compareCmd = new CompareFacesCommand({
        SourceImage: { S3Object: { Bucket: bucketName, Name: idCardKey } },
        TargetImage: { Bytes: Buffer.from(selfieImage, 'base64') },
        SimilarityThreshold: 80
    });
    
    const aiResponse = await regionalRek.send(compareCmd);
    if (!aiResponse.FaceMatches || aiResponse.FaceMatches.length === 0) {
        return res.json({ verified: false, message: "Face does not match ID card." });
    }

    const selfieKey = `patient/${userId}/selfie_verified.jpg`;
    await regionalS3.send(new PutObjectCommand({
        Bucket: bucketName, Key: selfieKey,
        Body: Buffer.from(selfieImage, 'base64'), ContentType: 'image/jpeg'
    }));

    await dynamicDb.send(new UpdateCommand({
        TableName: targetTable,
        Key: { patientId: userId },
        UpdateExpression: "set avatar = :a, isIdentityVerified = :v, identityStatus = :s, #g = :g, #res.#gen = :g",
    ExpressionAttributeNames: { 
        "#g": "gender",
        "#res": "resource",
        "#gen": "gender"
    },
    ExpressionAttributeValues: { 
        ':a': selfieKey, ':v': true, ':s': "VERIFIED", ':g': gender }
    }));

    await writeAuditLog(userId, userId, "IDENTITY_VERIFIED", "Patient AI facial biometric match successful", {
        region, ipAddress: req.ip
    });

    return res.json({ verified: true, message: "Identity Verified" });
});

/**
 * 5. DELETE PROFILE (GDPR Right to be Forgotten)
 */
/**
 * 5. DELETE PROFILE (GDPR Right to be Forgotten)
 */
export const deleteProfile = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const userCheck = await dynamicDb.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { patientId: userId }
    }));

    if (!userCheck.Item) return res.status(404).json({ error: "Patient not found" });

    // 🟢 HIPAA Data Retention vs GDPR Erasure: 
    try {
        const stripeKey = await getSSMParameter("/mediconnect/stripe/keys", region, true);
        const stripe = stripeKey ? new Stripe(stripeKey) : null;
        
        const apptQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_APPOINTMENTS || "mediconnect-appointments",
            IndexName: "PatientIndex",
            KeyConditionExpression: "patientId = :pid",
            ExpressionAttributeValues: { ":pid": userId }
        }));
        
        const appointments = apptQuery.Items ||[];
        const nowMs = Date.now();

        for (const apt of appointments) {
            const aptTimeMs = new Date(apt.timeSlot).getTime();
            const isFuture = aptTimeMs > nowMs;
            const isNotCancelled = apt.status !== "CANCELLED" && apt.status !== "CANCELLED_NO_SHOW";

            // GDPR Anonymization for FHIR Resource
            let fhirResource = apt.resource || {};
            fhirResource.name =[{ use: "official", text: "ANONYMIZED_GDPR" }];
            if (Array.isArray(fhirResource.participant)) {
                fhirResource.participant.forEach((p: any) => {
                    if (p.actor?.reference === `Patient/${userId}`) {
                        p.actor.display = "ANONYMIZED_GDPR";
                    }
                });
            }

            if (isFuture && isNotCancelled) {
                // 1. Refund the future appointment
                let refundId = "NOT_APPLICABLE";
                if (stripe && apt.paymentId && apt.paymentId !== "TEST_MODE" && apt.paymentStatus === 'paid') {
                    try {
                        const refund = await stripe.refunds.create({ payment_intent: apt.paymentId });
                        refundId = refund.id;
                        
                        // Ledger Entry for Refund
                        await dynamicDb.send(new PutCommand({
                            TableName: process.env.TABLE_TRANSACTIONS || "mediconnect-transactions",
                            Item: {
                                billId: randomUUID(), referenceId: apt.appointmentId,
                                patientId: userId, doctorId: apt.doctorId || "UNKNOWN",
                                type: "REFUND", amount: -(apt.amountPaid || 0),
                                currency: "USD", status: "PROCESSED",
                                createdAt: new Date().toISOString(), description: "GDPR Account Deletion Auto-Refund"
                            }
                        }));
                    } catch (stripeErr: any) {
                        console.error("GDPR Stripe Refund Failed:", stripeErr.message);
                        refundId = "REFUND_FAILED_MANUAL_REQUIRED";
                    }
                }

                // 2. Cancel the appointment & anonymize
                fhirResource.status = "cancelled";
                fhirResource.participant.forEach((p: any) => p.status = "declined");

                await dynamicDb.send(new UpdateCommand({
                    TableName: process.env.TABLE_APPOINTMENTS || "mediconnect-appointments",
                    Key: { appointmentId: apt.appointmentId },
                    UpdateExpression: "SET #s = :s, refundId = :r, patientName = :anon, patientAvatar = :null, #res = :resource, lastUpdated = :now",
                    ExpressionAttributeNames: { "#s": "status", "#res": "resource" },
                    ExpressionAttributeValues: { 
                        ":s": "CANCELLED", ":r": refundId, ":anon": "ANONYMIZED_GDPR", ":null": null, ":resource": fhirResource, ":now": new Date().toISOString()
                    }
                }));

                // 3. Remove Doctor Lock so another patient can book this slot
                if (apt.doctorId && apt.timeSlot) {
                    try {
                        const lockKey = `${apt.doctorId}#${apt.timeSlot}`;
                        await dynamicDb.send(new DeleteCommand({ 
                            TableName: process.env.TABLE_LOCKS || "mediconnect-booking-locks", 
                            Key: { lockId: lockKey } 
                        }));
                    } catch (e) {}
                }
            } else {
                // Just Anonymize past/completed appointments (Don't refund, just strip PII for GDPR)
                await dynamicDb.send(new UpdateCommand({
                    TableName: process.env.TABLE_APPOINTMENTS || "mediconnect-appointments",
                    Key: { appointmentId: apt.appointmentId },
                    UpdateExpression: "SET patientName = :anon, patientAvatar = :null, #res = :resource, lastUpdated = :now",
                    ExpressionAttributeNames: { "#res": "resource" },
                    ExpressionAttributeValues: { 
                        ":anon": "ANONYMIZED_GDPR", ":null": null, ":resource": fhirResource, ":now": new Date().toISOString()
                    }
                }));
            }
            
            // 🟢 BIGQUERY PUSH (Runs for every appointment after DB is updated)
            try {
                const auth = new GoogleAuth({ scopes:['https://www.googleapis.com/auth/cloud-platform'] });
                const client = await auth.getClient();
                const accessToken = (await client.getAccessToken()).token;
                const projectId = await auth.getProjectId();
                const dataset = region.toUpperCase() === 'EU' ? "mediconnect_analytics_eu" : "mediconnect_analytics";
                
                await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}/tables/appointments_stream/insertAll`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        kind: "bigquery#tableDataInsertAllRequest",
                        rows:[{ json: {
                            appointment_id: apt.appointmentId,
                            doctor_id: apt.doctorId,
                            patient_id: "ANONYMIZED_GDPR", 
                            status: "ANONYMIZED",
                            timestamp: new Date().toISOString()
                        }}]
                    })
                });
            } catch (bqErr) { console.error("BQ Anonymization Failed", bqErr); }
                
        }
    } catch (orphanErr) {
        console.error("Failed to sweep orphaned appointments during deletion:", orphanErr);
    }

    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

    await dynamicDb.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { patientId: userId },
        UpdateExpression: "SET #s = :s, #ttl = :ttl, #n = :n, email = :e, avatar = :a, deletedAt = :now, #res = :empty, address = :null, phone = :null, dob = :null, preferences = :empty, fcmToken = :null",
        ExpressionAttributeNames: { 
            "#s": "status", 
            "#ttl": "ttl", 
            "#n": "name", 
            "#res": "resource" 
        },
        ExpressionAttributeValues: { 
            ":s": "DELETED", 
            ":ttl": ttl, 
            ":n": "ANONYMIZED_USER", 
            ":e": `gdpr_deleted_${userId}@mediconnect.local`, 
            ":a": null, 
            ":now": new Date().toISOString(), 
            ":empty": {},
            ":null": null 
        }
    }));

    try {
        const regionalS3 = getRegionalS3Client(region);
        const baseBucket = CONFIG.BUCKET_NAME; 
        const isEU = region.toUpperCase() === 'EU';
        const bucketName = (isEU && !baseBucket.endsWith('-eu')) ? `${baseBucket}-eu` : baseBucket;
        
        const filesToDelete =[
            `patient/${userId}/selfie_verified.jpg`,
            `patient/${userId}/selfie_verified.png`,
            `patient/${userId}/profile_picture.jpg`,
            `patient/${userId}/profile_picture.png`
        ];

        for (const key of filesToDelete) {
            await regionalS3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
        }
    } catch (s3Error) {
        console.error(`[GDPR Warning] Failed to delete Selfie for ${userId}`, s3Error);
    }

    await writeAuditLog(userId, userId, "DELETE_PROFILE", "User invoked GDPR Right to be Forgotten", {
        region, 
        ipAddress: req.ip,
        lastKnownContact: { 
            email: userCheck.Item.email, 
            phone: userCheck.Item.phone || "N/A" 
        }
    });

    try {
        const regionalSns = getRegionalSNSClient(region);
        const regionalSes = getRegionalSESClient(region);
        const topicArn = region.toUpperCase() === 'EU' ? process.env.SNS_TOPIC_ARN_EU : process.env.SNS_TOPIC_ARN_US;

        await regionalSns.send(new PublishCommand({
            TopicArn: topicArn,
            Subject: "⚠️ SECURITY ALERT: Patient Identity Purged",
            Message: `CRITICAL: Patient account ${userId} has been anonymized. Biometric photos deleted. \nRegion: ${region}\nIP: ${req.ip}`
        }));

        if (userCheck.Item?.email) {
            await regionalSes.send(new SendEmailCommand({
                Source: process.env.SYSTEM_EMAIL || "noreply@yourdomain.com", 
                Destination: { ToAddresses: [userCheck.Item.email] },
                Message: {
                    Subject: { Data: "MediConnect - Account Deleted Successfully" },
                    Body: { 
                        Text: { 
                            Data: `Hello, \n\nThis is a formal confirmation that your MediConnect account and all biometric data have been erased as per your request under GDPR/HIPAA regulations. \n\nIn accordance with medical record laws, your clinical data has been anonymized and will be retained for the legal minimum period for audit purposes only. \n\nThank you.` 
                        } 
                    }
                }
            }));
        }
    } catch (err) {
        console.error("Failed to send deletion alerts/emails", err);
    }
    
    try {
        const cognitoClient = getRegionalCognitoClient(region);
        const userPoolId = region.toUpperCase() === 'EU' ? process.env.COGNITO_USER_POOL_ID_EU : process.env.COGNITO_USER_POOL_ID_US;

        if (userPoolId) {
            await cognitoClient.send(new AdminDeleteUserCommand({
                UserPoolId: userPoolId,
                Username: userId
            }));
            console.log(`[COMPLIANCE] Patient Identity ${userId} permanently erased from Cognito.`);
        }
    } catch (cognitoErr) {
        console.error("Failed to remove patient from Cognito Pool", cognitoErr);
    }

    res.json({ message: "Account fully anonymized and scheduled for hard deletion.", status: "DELETED" });
});

/**
 * 6. SEARCH PATIENTS (FHIR Interoperability)
 */
export const searchPatients = catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);

    if (!user?.isDoctor) {
        return res.status(403).json({ error: "Access Denied: Only medical practitioners can search the directory." });
    }

    // 🟢 SECURITY FIX: Manual Verification Gate (Replaces Middleware)
    const docCheck = await dynamicDb.send(new GetCommand({
        TableName: process.env.DYNAMO_TABLE_DOCTORS || 'mediconnect-doctors',
        Key: { doctorId: user.id }
    }));

    if (!docCheck.Item || docCheck.Item.verificationStatus !== 'APPROVED') {
        await writeAuditLog(user.id, "SYSTEM", "UNVERIFIED_SEARCH_ATTEMPT", "Unapproved doctor attempted to search patients", { region, ipAddress: req.ip });
        return res.status(403).json({ error: "Compliance Block: You must be a fully verified doctor to search patient records." });
    }

    const { name } = req.query;

    const command = new ScanCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        FilterExpression: "contains(#n, :name)",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: { ":name": name as string }
    });

    const result = await dynamicDb.send(command);
    
    await writeAuditLog(user.id, "MULTIPLE", "SEARCH_PATIENT", "Database search performed", {
        region, ipAddress: req.ip
    });

    res.json(result.Items ||[]);
});

/**
 * 7. GET DEMOGRAPHICS (Analytics Dashboard)
 */
export const getDemographics = catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);

    // 🟢 SECURITY FIX: Strict Role & Verification Checking
    if (user?.isDoctor) {
        const docCheck = await dynamicDb.send(new GetCommand({
            TableName: process.env.DYNAMO_TABLE_DOCTORS || 'mediconnect-doctors',
            Key: { doctorId: user.id }
        }));
        if (!docCheck.Item || docCheck.Item.verificationStatus !== 'APPROVED') {
            return res.status(403).json({ error: "Access Denied: Doctor not verified." });
        }
    } else {
        const patCheck = await dynamicDb.send(new GetCommand({
            TableName: CONFIG.DYNAMO_TABLE,
            Key: { patientId: user?.id }
        }));
        if (!patCheck.Item || patCheck.Item.isIdentityVerified !== true) {
            return res.status(403).json({ error: "Access Denied: Patient identity not verified." });
        }
    }

    const command = new ScanCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        ProjectionExpression: 'dob, #r',
        ExpressionAttributeNames: { '#r': 'role' }
    });

    const response = await dynamicDb.send(command);
    const items = response.Items ||[];

    const ageGroups: Record<string, number> = { '18-30': 0, '31-50': 0, '51-70': 0, '70+': 0 };
    let patientCount = 0;
    const currentYear = new Date().getFullYear();

    for (const item of items) {
        if (item.role === 'patient' && item.dob) {
            patientCount++;
            try {
                const birthYear = parseInt(item.dob.split('-')[0]);
                const age = currentYear - birthYear;
                if (age <= 30) ageGroups['18-30']++;
                else if (age <= 50) ageGroups['31-50']++;
                else if (age <= 70) ageGroups['51-70']++;
                else ageGroups['70+']++;
            } catch { continue; }
        }
    }

    const demographicData = Object.entries(ageGroups).map(([k, v]) => ({ name: k, value: v }));
    res.json({ demographicData, totalPatients: patientCount });
});

/**
 * 8. GET PATIENT BY ID (HIPAA Compliant Minimum Necessary Access)
 */
export const getPatientById = catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);
    
    const requestedId = req.params.userId || req.params.id;
    const requesterId = user?.id;
    const isDoctor = user?.isDoctor;

    // 🟢 SECURITY FIX: Manual Verification Gate
    if (isDoctor) {
        const docCheck = await dynamicDb.send(new GetCommand({
            TableName: process.env.DYNAMO_TABLE_DOCTORS || 'mediconnect-doctors',
            Key: { doctorId: requesterId }
        }));
        if (!docCheck.Item || docCheck.Item.verificationStatus !== 'APPROVED') {
            return res.status(403).json({ error: "Compliance Block: Doctor not verified." });
        }
    } else {
        const patCheck = await dynamicDb.send(new GetCommand({
            TableName: CONFIG.DYNAMO_TABLE,
            Key: { patientId: requesterId }
        }));
        if (!patCheck.Item || patCheck.Item.isIdentityVerified !== true) {
            return res.status(403).json({ error: "Compliance Block: Patient not verified." });
        }
    }

    // 🟢 HIPAA ACCESS CONTROL: Only the Owner OR a Doctor with an active relationship
    if (requestedId !== requesterId) {
        if (!isDoctor) {
             return res.status(403).json({ error: "Unauthorized access to patient record." });
        }

        // 🟢 HIPAA "Minimum Necessary" Rule: Check Clinical Relationship
        const relationshipCheck = await dynamicDb.send(new QueryCommand({
            TableName: process.env.APPOINTMENT_TABLE || "mediconnect-appointments",
            IndexName: "PatientIndex", 
            KeyConditionExpression: "patientId = :pid",
            FilterExpression: "doctorId = :did AND #st <> :cancelled",
            ExpressionAttributeNames: { "#st": "status" },
            ExpressionAttributeValues: { 
                ":pid": requestedId, 
                ":did": requesterId, 
                ":cancelled": "CANCELLED" 
            }
        }));

        if (!relationshipCheck.Items || relationshipCheck.Items.length === 0) {
            await writeAuditLog(requesterId, requestedId, "ILLEGAL_ACCESS_ATTEMPT", "Doctor attempted to view unassigned patient.", { region, role: 'doctor', ipAddress: req.ip });
            return res.status(403).json({ error: "HIPAA Violation: You do not have an active clinical relationship with this patient." });
        }
    }

    const response = await dynamicDb.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { patientId: requestedId }
    }));

    if (!response.Item) return res.status(404).json({ error: "Patient not found." });
    
    response.Item.avatar = await signAvatarUrl(response.Item.avatar, region);

    await writeAuditLog(requesterId, requestedId, "READ_PATIENT_BY_ID", "Authorized medical record accessed", { region, role: isDoctor ? 'doctor' : 'patient' });
    res.json(response.Item);
});