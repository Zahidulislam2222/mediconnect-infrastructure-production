import { Request, Response, NextFunction } from 'express';

// AWS SDK v3
import { GetCommand, PutCommand, UpdateCommand, ScanCommand, QueryCommand, DeleteCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectVersionsCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CompareFacesCommand } from "@aws-sdk/client-rekognition";
import { PublishCommand } from "@aws-sdk/client-sns";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { getRegionalSESClient, getRegionalCognitoClient, getSSMParameter } from '../../../shared/aws-config';
import { AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import Stripe from "stripe";
import { randomUUID, createHash } from "crypto";
import { GoogleAuth } from "google-auth-library";

// Shared Utilities
import { safeLog, safeError } from '../../../shared/logger';
import { writeAuditLog } from '../../../shared/audit';
import { encryptPHI, decryptPHI, decryptToken } from '../../../shared/kms-crypto';
import axios from 'axios';
import { publishEvent, EventType } from '../../../shared/event-bus';

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

/**
 * Deletes ALL versions (including delete markers) of an S3 object.
 * Handles pagination for buckets with many versions.
 * Non-blocking: logs errors but never throws.
 */
async function deleteS3ObjectVersions(
    s3Client: any,
    bucket: string,
    key: string
): Promise<void> {
    try {
        let keyMarker: string | undefined;
        let versionIdMarker: string | undefined;
        let hasMore = true;

        while (hasMore) {
            const listParams: any = {
                Bucket: bucket,
                Prefix: key,
                MaxKeys: 1000,
                ...(keyMarker ? { KeyMarker: keyMarker } : {}),
                ...(versionIdMarker ? { VersionIdMarker: versionIdMarker } : {})
            };

            const listResult = await s3Client.send(new ListObjectVersionsCommand(listParams));

            const objectsToDelete: { Key: string; VersionId: string }[] = [];

            // Collect all versions
            for (const version of (listResult.Versions || [])) {
                if (version.Key === key && version.VersionId) {
                    objectsToDelete.push({ Key: version.Key, VersionId: version.VersionId });
                }
            }

            // Collect all delete markers
            for (const marker of (listResult.DeleteMarkers || [])) {
                if (marker.Key === key && marker.VersionId) {
                    objectsToDelete.push({ Key: marker.Key, VersionId: marker.VersionId });
                }
            }

            // Bulk delete in batches of 1000 (S3 limit)
            for (let i = 0; i < objectsToDelete.length; i += 1000) {
                const batch = objectsToDelete.slice(i, i + 1000);
                await s3Client.send(new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: { Objects: batch, Quiet: true }
                }));
            }

            hasMore = listResult.IsTruncated === true;
            keyMarker = listResult.NextKeyMarker;
            versionIdMarker = listResult.NextVersionIdMarker;
        }
    } catch (err) {
        safeError(`[GDPR] Failed to delete S3 object versions for ${key} in ${bucket}`, err);
    }
}

/**
 * Deletes patient data from all BigQuery tables using DML DELETE queries.
 * Uses parameterized queries to prevent SQL injection.
 * Non-blocking: logs errors but never throws.
 */
async function deleteBigQueryPatientData(patientId: string, region: string): Promise<void> {
    try {
        const hashedId = createHash('sha256')
            .update(patientId + (process.env.HIPAA_SALT || 'mediconnect_salt'))
            .digest('hex');

        const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
        const client = await auth.getClient();
        const accessToken = (await client.getAccessToken()).token;
        const projectId = await auth.getProjectId();

        const isEU = region.toUpperCase() === 'EU';
        const analyticsDataset = isEU ? 'mediconnect_analytics_eu' : 'mediconnect_analytics';
        const aiDataset = isEU ? 'mediconnect_ai_eu' : 'mediconnect_ai';
        const iotDataset = isEU ? 'iot_eu' : 'iot';

        const deleteQueries = [
            {
                label: 'appointments_stream',
                query: `DELETE FROM \`${analyticsDataset}.appointments_stream\` WHERE patient_id = @hashedId`,
                paramName: 'hashedId'
            },
            {
                label: 'analytics_revenue',
                query: `DELETE FROM \`${analyticsDataset}.analytics_revenue\` WHERE patient_id = @hashedId`,
                paramName: 'hashedId'
            },
            {
                label: 'symptom_logs',
                query: `DELETE FROM \`${aiDataset}.symptom_logs\` WHERE user_id = @hashedId`,
                paramName: 'hashedId'
            },
            {
                label: 'vitals_raw',
                query: `DELETE FROM \`${iotDataset}.vitals_raw\` WHERE JSON_EXTRACT_SCALAR(data, '$.patientId') = @hashedId`,
                paramName: 'hashedId'
            }
        ];

        for (const dq of deleteQueries) {
            try {
                const response = await fetch(
                    `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/jobs`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            configuration: {
                                query: {
                                    query: dq.query,
                                    useLegacySql: false,
                                    parameterMode: 'NAMED',
                                    queryParameters: [{
                                        name: dq.paramName,
                                        parameterType: { type: 'STRING' },
                                        parameterValue: { value: hashedId }
                                    }]
                                }
                            }
                        })
                    }
                );

                if (!response.ok) {
                    const errBody = await response.text();
                    safeError(`[GDPR] BigQuery DML DELETE failed for ${dq.label}: ${response.status}`, errBody);
                } else {
                    safeLog(`[GDPR] BigQuery DML DELETE submitted for ${dq.label} (patient ${patientId})`);
                }
            } catch (queryErr) {
                safeError(`[GDPR] BigQuery DML DELETE error for ${dq.label}`, queryErr);
            }
        }
    } catch (err) {
        safeError('[GDPR] BigQuery patient data deletion failed', err);
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
        identifier: [{ use: "usual", system: "urn:mediconnect:patient-id", value: finalId }],
        name: [{ use: "official", text: name, family: name.split(' ').pop(), given: name.split(' ').slice(0, -1) }],
        telecom: [
            { system: "email", value: email, use: "home" },
            ...(phone ? [{ system: "phone", value: phone, use: "mobile" }] : []),
        ],
        gender: gender?.toLowerCase(),
        birthDate: dob,
        address: req.body.address ? [{ use: "home", text: req.body.address }] : [],
        communication: [{ language: { coding: [{ system: "urn:ietf:bcp:47", code: req.body.language || "en" }] }, preferred: true }],
        meta: { lastUpdated: timestamp, versionId: "1" }
    };

    // 🟢 HIPAA: Encrypt PHI fields at rest using KMS envelope encryption
    let encryptedPHI: Record<string, string> = {};
    try {
        encryptedPHI = await encryptPHI(
            { name, ...(dob ? { dob } : {}), ...(phone ? { phone } : {}), email },
            region
        );
    } catch (kmsErr: any) {
        // KMS unavailable (dev/test) — store plaintext with warning
        safeError('[PHI] KMS encryption unavailable, storing plaintext', kmsErr.message);
        encryptedPHI = { name, ...(dob ? { dob } : {}), ...(phone ? { phone } : {}), email };
    }

    // After encryption, update FHIR resource to use encrypted values (prevent PHI leak in stored resource)
    if (encryptedPHI.name) {
        fhirResource.name = [{ use: "official", text: encryptedPHI.name, family: encryptedPHI.name, given: [encryptedPHI.name] }];
    }
    if (encryptedPHI.phone || encryptedPHI.email) {
        fhirResource.telecom = [
            { system: "email", value: encryptedPHI.email || email, use: "home" },
            ...(encryptedPHI.phone ? [{ system: "phone", value: encryptedPHI.phone, use: "mobile" }] : (phone ? [{ system: "phone", value: phone, use: "mobile" }] : [])),
        ];
    }
    if (encryptedPHI.dob) {
        fhirResource.birthDate = encryptedPHI.dob;
    }

    const item = {
        patientId: finalId,
        email: encryptedPHI.email || email,
        name: encryptedPHI.name || name,
        role,
        isEmailVerified: true,
        isIdentityVerified: false,
        createdAt: timestamp,
        avatar: null,
        dob: encryptedPHI.dob || dob,
        phone: encryptedPHI.phone || phone,
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

    // Event bus: patient registered
    publishEvent(EventType.PATIENT_REGISTERED, { patientId: finalId, region }, region).catch(() => {});

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

    // 🟢 HIPAA: Decrypt PHI fields before returning to client
    try {
        const decrypted = await decryptPHI(
            { name: response.Item.name, dob: response.Item.dob, phone: response.Item.phone, email: response.Item.email },
            region
        );
        if (decrypted.name) response.Item.name = decrypted.name;
        if (decrypted.dob) response.Item.dob = decrypted.dob;
        if (decrypted.phone) response.Item.phone = decrypted.phone;
        if (decrypted.email) response.Item.email = decrypted.email;
    } catch { /* KMS unavailable — fields are already plaintext */ }

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

    // HIPAA: Encrypt PHI fields before writing to DynamoDB
    try {
        const phiFields: Record<string, string> = {};
        if (values[':name']) phiFields.name = values[':name'];
        if (values[':dob']) phiFields.dob = values[':dob'];
        if (values[':phone']) phiFields.phone = values[':phone'];
        if (Object.keys(phiFields).length > 0) {
            const encrypted = await encryptPHI(phiFields, region);
            if (encrypted.name) values[':name'] = encrypted.name;
            if (encrypted.dob) values[':dob'] = encrypted.dob;
            if (encrypted.phone) values[':phone'] = encrypted.phone;
        }
    } catch (kmsErr: any) {
        safeError('[PHI] KMS encryption unavailable during profile update, storing plaintext', kmsErr.message);
    }

    // Sync FHIR resource name with encrypted value
    if (values[':fhirName'] && values[':name']) values[':fhirName'] = values[':name'];

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

    // Event bus: patient updated
    publishEvent(EventType.PATIENT_UPDATED, { patientId: requestedId, updatedBy: requesterId }, region).catch(() => {});

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

    // 🟢 GDPR: Mark patient as DELETED immediately before cascade begins
    // If function crashes mid-erasure, the patient is already marked DELETED
    // Re-running deleteProfile can detect DELETED status and skip already-processed tables
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
                        safeError("GDPR Stripe Refund Failed:", stripeErr.message);
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

                // 4. GDPR: Delete Google Calendar event (patient name visible on doctor's calendar)
                if (apt.googleEventId && apt.doctorId) {
                    try {
                        const doctorRecord = await dynamicDb.send(new GetCommand({
                            TableName: CONFIG.DOCTOR_TABLE,
                            Key: { doctorId: apt.doctorId },
                            ProjectionExpression: 'googleRefreshToken'
                        }));
                        const storedToken = doctorRecord.Item?.googleRefreshToken;
                        if (storedToken) {
                            const refreshToken = await decryptToken(storedToken, region);
                            const tokenRes = await axios.post<{ access_token: string }>('https://oauth2.googleapis.com/token', {
                                client_id: process.env.GOOGLE_CLIENT_ID,
                                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                                refresh_token: refreshToken,
                                grant_type: 'refresh_token'
                            });
                            await axios.delete(
                                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${apt.googleEventId}`,
                                { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } }
                            );
                            safeLog(`[GDPR] Deleted Google Calendar event ${apt.googleEventId} for appointment ${apt.appointmentId}`);
                        }
                    } catch (calErr) {
                        safeError('[GDPR] Google Calendar event deletion failed (non-blocking)', calErr);
                    }
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
                            specialization: apt.specialization || 'General',
                            notes: 'ANONYMIZED_GDPR',
                            cost: 0,
                            timestamp: new Date().toISOString()
                        }}]
                    })
                });
            } catch (bqErr) { safeError("BQ Anonymization Failed", bqErr); }
                
        }
    } catch (orphanErr) {
        safeError("Failed to sweep orphaned appointments during deletion:", orphanErr);
    }

    // BigQuery DML DELETE: Remove patient data from all BigQuery tables
    // Runs AFTER BigQuery anonymization inserts above to ensure old rows are purged
    await deleteBigQueryPatientData(userId, region);

    // ─── GDPR Erasure Cascade: Clean up additional tables ───────────────
    // 1. Chat history (PK=conversationId, SK=timestamp; patient referenced via senderId/recipientId)
    try {
        let chatLastKey: any = undefined;
        do {
            const chatScan = await dynamicDb.send(new ScanCommand({
                TableName: 'mediconnect-chat-history',
                FilterExpression: 'senderId = :uid OR recipientId = :uid',
                ExpressionAttributeValues: { ':uid': userId },
                ...(chatLastKey ? { ExclusiveStartKey: chatLastKey } : {})
            }));
            const chatItems = chatScan.Items || [];
            for (let i = 0; i < chatItems.length; i += 25) {
                const batch = chatItems.slice(i, i + 25).map((item: any) => ({
                    DeleteRequest: { Key: { conversationId: item.conversationId, timestamp: item.timestamp } }
                }));
                await dynamicDb.send(new BatchWriteCommand({ RequestItems: { 'mediconnect-chat-history': batch } }));
            }
            chatLastKey = chatScan.LastEvaluatedKey;
        } while (chatLastKey);
        // Granular GDPR audit for chat history erasure
        try {
            await writeAuditLog(userId, userId, "GDPR_CHAT_ERASURE", "Chat history deleted under GDPR Art. 17 right to erasure", { region });
        } catch { /* Non-blocking */ }
    } catch (e) { safeError('[GDPR] Failed to delete chat history', e); }

    // 2. Graph data
    try {
        const graphQuery = await dynamicDb.send(new QueryCommand({
            TableName: 'mediconnect-graph-data',
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: { ':pk': `PATIENT#${userId}` }
        }));
        const graphItems = graphQuery.Items || [];
        for (let i = 0; i < graphItems.length; i += 25) {
            const batch = graphItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { PK: item.PK, SK: item.SK } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { 'mediconnect-graph-data': batch } }));
        }
    } catch (e) { safeError('[GDPR] Failed to delete graph data', e); }

    // 2b. Reverse graph-data entries (DOCTOR#x → PATIENT#userId)
    try {
        const reverseGraphScan = await dynamicDb.send(new ScanCommand({
            TableName: 'mediconnect-graph-data',
            FilterExpression: 'SK = :patientSk',
            ExpressionAttributeValues: { ':patientSk': `PATIENT#${userId}` }
        }));
        const reverseItems = reverseGraphScan.Items || [];
        for (let i = 0; i < reverseItems.length; i += 25) {
            const batch = reverseItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { PK: item.PK, SK: item.SK } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { 'mediconnect-graph-data': batch } }));
        }
    } catch (e) { safeError('[GDPR] Failed to delete reverse graph data', e); }

    // 3. Prescriptions (anonymize patientName + delete S3 PDFs)
    try {
        const rxQuery = await dynamicDb.send(new QueryCommand({
            TableName: 'mediconnect-prescriptions',
            IndexName: 'PatientIndex',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        // Delete prescription PDFs from S3 before anonymizing
        try {
            const regionalS3 = getRegionalS3Client(region);
            const isEU = region.toUpperCase() === 'EU';
            const rxBucket = isEU
                ? (process.env.S3_BUCKET_PRESCRIPTIONS_EU || 'mediconnect-prescriptions-eu')
                : (process.env.S3_BUCKET_PRESCRIPTIONS_US || 'mediconnect-prescriptions');
            for (const rx of (rxQuery.Items || [])) {
                await deleteS3ObjectVersions(regionalS3, rxBucket, `prescriptions/${rx.prescriptionId}.pdf`);
            }
            safeLog(`[GDPR] Deleted ${(rxQuery.Items || []).length} prescription PDFs (all versions) for patient ${userId}`);
        } catch (s3Err) { safeError('[GDPR] Failed to delete prescription PDFs', s3Err); }
        for (const rx of (rxQuery.Items || [])) {
            await dynamicDb.send(new UpdateCommand({
                TableName: 'mediconnect-prescriptions',
                Key: { prescriptionId: rx.prescriptionId },
                UpdateExpression: 'SET patientName = :anon, lastUpdated = :now',
                ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
            }));
        }
    } catch (e) { safeError('[GDPR] Failed to anonymize prescriptions', e); }

    // 4. MPI links
    try {
        const mpiQuery = await dynamicDb.send(new ScanCommand({
            TableName: process.env.TABLE_MPI || 'mediconnect-mpi-links',
            FilterExpression: 'sourcePatientId = :pid OR targetPatientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const mpiItems = mpiQuery.Items || [];
        for (let i = 0; i < mpiItems.length; i += 25) {
            const batch = mpiItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { linkId: item.linkId } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_MPI || 'mediconnect-mpi-links']: batch } }));
        }
    } catch (e) { safeError('[GDPR] Failed to delete MPI links', e); }

    // 5. Allergies
    try {
        const allergyQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_ALLERGIES || 'mediconnect-allergies',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const allergyItems = allergyQuery.Items || [];
        for (let i = 0; i < allergyItems.length; i += 25) {
            const batch = allergyItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { patientId: item.patientId, allergyId: item.allergyId } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_ALLERGIES || 'mediconnect-allergies']: batch } }));
        }
    } catch (e) { safeError('[GDPR] Failed to delete allergies', e); }

    // 6. Immunizations
    try {
        const immunQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_IMMUNIZATIONS || 'mediconnect-immunizations',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const immunItems = immunQuery.Items || [];
        for (let i = 0; i < immunItems.length; i += 25) {
            const batch = immunItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { patientId: item.patientId, immunizationId: item.immunizationId } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_IMMUNIZATIONS || 'mediconnect-immunizations']: batch } }));
        }
    } catch (e) { safeError('[GDPR] Failed to delete immunizations', e); }

    // 7. Care plans
    try {
        const cpQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_CARE_PLANS || 'mediconnect-care-plans',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const cpItems = cpQuery.Items || [];
        for (let i = 0; i < cpItems.length; i += 25) {
            const batch = cpItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { patientId: item.patientId, planId: item.planId || item.carePlanId } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_CARE_PLANS || 'mediconnect-care-plans']: batch } }));
        }
    } catch (e) { safeError('[GDPR] Failed to delete care plans', e); }

    // 8. Lab orders (anonymize patientName)
    try {
        const labQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_LAB_ORDERS || 'mediconnect-lab-orders',
            IndexName: 'PatientIndex',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        for (const lab of (labQuery.Items || [])) {
            await dynamicDb.send(new UpdateCommand({
                TableName: process.env.TABLE_LAB_ORDERS || 'mediconnect-lab-orders',
                Key: { labOrderId: lab.labOrderId },
                UpdateExpression: 'SET patientName = :anon, patientDob = :null, patientGender = :null, lastUpdated = :now',
                ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':null': null, ':now': new Date().toISOString() }
            }));
        }
    } catch (e) { safeError('[GDPR] Failed to anonymize lab orders', e); }

    // 9. Referrals (anonymize patientId reference)
    try {
        const refQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_REFERRALS || 'mediconnect-referrals',
            IndexName: 'PatientIndex',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        for (const ref of (refQuery.Items || [])) {
            await dynamicDb.send(new UpdateCommand({
                TableName: process.env.TABLE_REFERRALS || 'mediconnect-referrals',
                Key: { referralId: ref.referralId },
                UpdateExpression: 'SET patientName = :anon, lastUpdated = :now',
                ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
            }));
        }
    } catch (e) { safeError('[GDPR] Failed to anonymize referrals', e); }

    // 10. Reconciliations (anonymize)
    try {
        const reconQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_MED_RECON || 'mediconnect-med-reconciliations',
            IndexName: 'PatientIndex',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        for (const recon of (reconQuery.Items || [])) {
            await dynamicDb.send(new UpdateCommand({
                TableName: process.env.TABLE_MED_RECON || 'mediconnect-med-reconciliations',
                Key: { reconciliationId: recon.reconciliationId },
                UpdateExpression: 'SET patientName = :anon, lastUpdated = :now',
                ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
            }));
        }
    } catch (e) { safeError('[GDPR] Failed to anonymize reconciliations', e); }

    // 11. Vitals
    try {
        const vitalsQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.DYNAMO_TABLE_VITALS || 'mediconnect-iot-vitals',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const vitalsItems = vitalsQuery.Items || [];
        for (let i = 0; i < vitalsItems.length; i += 25) {
            const batch = vitalsItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { patientId: item.patientId, timestamp: item.timestamp } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.DYNAMO_TABLE_VITALS || 'mediconnect-iot-vitals']: batch } }));
        }
        safeLog(`[GDPR] Deleted ${vitalsItems.length} vitals records for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete vitals', e); }

    // 12. Health records
    try {
        const ehrQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_EHR || 'mediconnect-health-records',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const ehrItems = ehrQuery.Items || [];
        for (let i = 0; i < ehrItems.length; i += 25) {
            const batch = ehrItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { patientId: item.patientId, recordId: item.recordId } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_EHR || 'mediconnect-health-records']: batch } }));
        }
        safeLog(`[GDPR] Deleted ${ehrItems.length} health records for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete health records', e); }

    // 13. SDOH assessments
    try {
        const sdohQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_SDOH || 'mediconnect-sdoh-assessments',
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const sdohItems = sdohQuery.Items || [];
        for (let i = 0; i < sdohItems.length; i += 25) {
            const batch = sdohItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { assessmentId: item.assessmentId } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_SDOH || 'mediconnect-sdoh-assessments']: batch } }));
        }
        safeLog(`[GDPR] Deleted ${sdohItems.length} SDOH assessments for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete SDOH assessments', e); }

    // 14. Eligibility checks
    try {
        const eligQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_ELIGIBILITY || 'mediconnect-eligibility-checks',
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const eligItems = eligQuery.Items || [];
        for (let i = 0; i < eligItems.length; i += 25) {
            const batch = eligItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { checkId: item.checkId } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_ELIGIBILITY || 'mediconnect-eligibility-checks']: batch } }));
        }
        safeLog(`[GDPR] Deleted ${eligItems.length} eligibility checks for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete eligibility checks', e); }

    // 15. Prior authorizations
    try {
        const priorAuthQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_PRIOR_AUTH || 'mediconnect-prior-auth',
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const priorAuthItems = priorAuthQuery.Items || [];
        for (let i = 0; i < priorAuthItems.length; i += 25) {
            const batch = priorAuthItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { authId: item.authId } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_PRIOR_AUTH || 'mediconnect-prior-auth']: batch } }));
        }
        safeLog(`[GDPR] Deleted ${priorAuthItems.length} prior auth records for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete prior authorizations', e); }

    // 16. Video sessions
    try {
        const videoQuery = await dynamicDb.send(new ScanCommand({
            TableName: process.env.TABLE_SESSIONS || 'mediconnect-video-sessions',
            FilterExpression: 'contains(participantIds, :uid) OR patientId = :uid',
            ExpressionAttributeValues: { ':uid': userId }
        }));
        for (const session of (videoQuery.Items || [])) {
            await dynamicDb.send(new DeleteCommand({
                TableName: process.env.TABLE_SESSIONS || 'mediconnect-video-sessions',
                Key: { sessionId: session.sessionId }
            }));
        }
        safeLog(`[GDPR] Deleted ${(videoQuery.Items || []).length} video sessions for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete video sessions', e); }

    // 17. Blue Button connections
    try {
        const bbQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_BB_CONNECTIONS || 'mediconnect-bluebutton-connections',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        for (const conn of (bbQuery.Items || [])) {
            await dynamicDb.send(new DeleteCommand({
                TableName: process.env.TABLE_BB_CONNECTIONS || 'mediconnect-bluebutton-connections',
                Key: { patientId: conn.patientId }
            }));
        }
        safeLog(`[GDPR] Deleted ${(bbQuery.Items || []).length} Blue Button connections for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete Blue Button connections', e); }

    // 18. Bulk export jobs
    try {
        const exportQuery = await dynamicDb.send(new ScanCommand({
            TableName: process.env.TABLE_EXPORTS || 'mediconnect-bulk-exports',
            FilterExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        for (const exp of (exportQuery.Items || [])) {
            await dynamicDb.send(new DeleteCommand({
                TableName: process.env.TABLE_EXPORTS || 'mediconnect-bulk-exports',
                Key: { exportId: exp.exportId }
            }));
        }
        safeLog(`[GDPR] Deleted ${(exportQuery.Items || []).length} export jobs for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete export jobs', e); }

    // 19. Appointment reminders
    try {
        const reminderQuery = await dynamicDb.send(new ScanCommand({
            TableName: process.env.TABLE_REMINDERS || 'mediconnect-reminders',
            FilterExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        for (const rem of (reminderQuery.Items || [])) {
            await dynamicDb.send(new DeleteCommand({
                TableName: process.env.TABLE_REMINDERS || 'mediconnect-reminders',
                Key: { reminderId: rem.reminderId }
            }));
        }
        safeLog(`[GDPR] Deleted ${(reminderQuery.Items || []).length} reminders for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete reminders', e); }

    // 20. HL7 messages (contain raw HL7 with patient identifiers)
    try {
        const hl7Scan = await dynamicDb.send(new ScanCommand({
            TableName: 'mediconnect-hl7-messages',
            FilterExpression: 'contains(#raw, :uid)',
            ExpressionAttributeNames: { '#raw': 'raw' },
            ExpressionAttributeValues: { ':uid': userId }
        }));
        for (const msg of (hl7Scan.Items || [])) {
            await dynamicDb.send(new DeleteCommand({
                TableName: 'mediconnect-hl7-messages',
                Key: { messageId: msg.messageId }
            }));
        }
        safeLog(`[GDPR] Deleted ${(hl7Scan.Items || []).length} HL7 messages for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete HL7 messages', e); }

    // 21. S3: Delete consultation recordings
    try {
        const regionalS3 = getRegionalS3Client(region);
        const isEU = region.toUpperCase() === 'EU';
        const recordingBucket = process.env.RECORDING_BUCKET || 'mediconnect-consultation-recordings';
        const recordingBucketName = (isEU && !recordingBucket.endsWith('-eu')) ? `${recordingBucket}-eu` : recordingBucket;

        // Find appointments for this patient to get recording keys
        const aptScan = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_APPOINTMENTS || 'mediconnect-appointments',
            IndexName: 'PatientIndex',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        for (const apt of (aptScan.Items || [])) {
            const listResult = await regionalS3.send(new ListObjectsV2Command({
                Bucket: recordingBucketName,
                Prefix: `recordings/${apt.appointmentId}/`
            }));
            for (const obj of (listResult.Contents || [])) {
                if (obj.Key) {
                    await deleteS3ObjectVersions(regionalS3, recordingBucketName, obj.Key);
                }
            }
        }
        safeLog(`[GDPR] Deleted consultation recordings (all versions) for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete consultation recordings', e); }

    // 22. S3: Delete DICOM medical images
    try {
        const regionalS3 = getRegionalS3Client(region);
        const isEU = region.toUpperCase() === 'EU';
        const imageBucket = process.env.BUCKET_NAME_DICOM || 'mediconnect-medical-images';
        const imageBucketName = (isEU && !imageBucket.endsWith('-eu')) ? `${imageBucket}-eu` : imageBucket;

        const listResult = await regionalS3.send(new ListObjectsV2Command({
            Bucket: imageBucketName,
            Prefix: `dicom/${userId}/`
        }));
        for (const obj of (listResult.Contents || [])) {
            if (obj.Key) {
                await deleteS3ObjectVersions(regionalS3, imageBucketName, obj.Key);
            }
        }
        // Also check de-identified folder
        const deIdResult = await regionalS3.send(new ListObjectsV2Command({
            Bucket: imageBucketName,
            Prefix: `dicom-de-identified/${userId}/`
        }));
        for (const obj of (deIdResult.Contents || [])) {
            if (obj.Key) {
                await deleteS3ObjectVersions(regionalS3, imageBucketName, obj.Key);
            }
        }
        safeLog(`[GDPR] Deleted ${(listResult.Contents || []).length + (deIdResult.Contents || []).length} DICOM images (all versions) for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete DICOM images', e); }

    // 22b. DynamoDB: Delete DICOM study metadata (mediconnect-dicom-studies, PK=patientId)
    try {
        const dicomMetaQuery = await dynamicDb.send(new QueryCommand({
            TableName: process.env.TABLE_DICOM_STUDIES || 'mediconnect-dicom-studies',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        const dicomMetaItems = dicomMetaQuery.Items || [];
        for (let i = 0; i < dicomMetaItems.length; i += 25) {
            const batch = dicomMetaItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { patientId: item.patientId, studyInstanceUID: item.studyInstanceUID } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [process.env.TABLE_DICOM_STUDIES || 'mediconnect-dicom-studies']: batch } }));
        }
        safeLog(`[GDPR] Deleted ${dicomMetaItems.length} DICOM metadata entries for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to delete DICOM metadata', e); }

    // 23. eCR reports (electronic Case Reporting — contains patientId)
    try {
        const ecrScan = await dynamicDb.send(new ScanCommand({
            TableName: process.env.TABLE_ECR || 'mediconnect-ecr-reports',
            FilterExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        for (const ecr of (ecrScan.Items || [])) {
            await dynamicDb.send(new UpdateCommand({
                TableName: process.env.TABLE_ECR || 'mediconnect-ecr-reports',
                Key: { reportId: ecr.reportId },
                UpdateExpression: 'SET patientId = :anon, lastUpdated = :now',
                ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
            }));
        }
        safeLog(`[GDPR] Anonymized ${(ecrScan.Items || []).length} eCR reports for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to anonymize eCR reports', e); }

    // 24. ELR reports (Electronic Lab Reporting — contains patientId, patientName, patientDob)
    try {
        const elrScan = await dynamicDb.send(new ScanCommand({
            TableName: process.env.TABLE_ELR || 'mediconnect-elr-reports',
            FilterExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        for (const elr of (elrScan.Items || [])) {
            await dynamicDb.send(new UpdateCommand({
                TableName: process.env.TABLE_ELR || 'mediconnect-elr-reports',
                Key: { reportId: elr.reportId },
                UpdateExpression: 'SET patientId = :anon, patientName = :anon, patientDob = :null, patientGender = :null, lastUpdated = :now',
                ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':null': null, ':now': new Date().toISOString() }
            }));
        }
        safeLog(`[GDPR] Anonymized ${(elrScan.Items || []).length} ELR reports for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to anonymize ELR reports', e); }

    // 25. Transactions (financial records — delete receipt PDFs, then anonymize patientId)
    try {
        const txScan = await dynamicDb.send(new ScanCommand({
            TableName: process.env.TABLE_TRANSACTIONS || 'mediconnect-transactions',
            FilterExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': userId }
        }));
        // Delete receipt PDFs from S3 before anonymizing (keyed by billId)
        try {
            const regionalS3 = getRegionalS3Client(region);
            const isEU = region.toUpperCase() === 'EU';
            const receiptBucket = isEU
                ? (process.env.S3_BUCKET_UPLOADS_EU || 'mediconnect-patient-data-eu')
                : (process.env.S3_BUCKET_UPLOADS || 'mediconnect-patient-data');
            for (const tx of (txScan.Items || [])) {
                await deleteS3ObjectVersions(regionalS3, receiptBucket, `receipts/${tx.billId}.pdf`);
            }
            safeLog(`[GDPR] Deleted ${(txScan.Items || []).length} receipt PDFs (all versions) for patient ${userId}`);
        } catch (s3Err) { safeError('[GDPR] Failed to delete receipt PDFs', s3Err); }
        for (const tx of (txScan.Items || [])) {
            await dynamicDb.send(new UpdateCommand({
                TableName: process.env.TABLE_TRANSACTIONS || 'mediconnect-transactions',
                Key: { billId: tx.billId },
                UpdateExpression: 'SET patientId = :anon, lastUpdated = :now',
                ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
            }));
        }
        safeLog(`[GDPR] Anonymized ${(txScan.Items || []).length} transactions for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to anonymize transactions', e); }

    // 26. S3: Delete failed BigQuery DLQ entries containing this patient's data
    try {
        const regionalS3 = getRegionalS3Client(region);
        const isEU = region.toUpperCase() === 'EU';
        const dlqBucket = process.env.DLQ_BUCKET || 'mediconnect-data-lake-dlq';
        const dlqBucketName = isEU ? `${dlqBucket}-eu` : dlqBucket;
        const hashedPatientId = createHash('sha256')
            .update(userId + (process.env.HIPAA_SALT || 'mediconnect_salt')).digest('hex');
        const listResult = await regionalS3.send(new ListObjectsV2Command({
            Bucket: dlqBucketName, Prefix: 'failed/'
        }));
        for (const obj of (listResult.Contents || [])) {
            if (!obj.Key) continue;
            try {
                const getResult = await regionalS3.send(new GetObjectCommand({ Bucket: dlqBucketName, Key: obj.Key }));
                const body = await getResult.Body?.transformToString();
                if (body && body.includes(hashedPatientId)) {
                    await deleteS3ObjectVersions(regionalS3, dlqBucketName, obj.Key);
                }
            } catch { /* Individual file read/delete failure — continue */ }
        }
        safeLog(`[GDPR] Cleaned DLQ bucket for patient ${userId}`);
    } catch (e) { safeError('[GDPR] Failed to clean DLQ bucket', e); }

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
            await deleteS3ObjectVersions(regionalS3, bucketName, key);
        }
    } catch (s3Error) {
        safeError(`[GDPR Warning] Failed to delete Selfie for ${userId}`, s3Error);
    }

    // S3: Delete EHR records
    try {
        const regionalS3 = getRegionalS3Client(region);
        const isEU = region.toUpperCase() === 'EU';
        const ehrBucket = process.env.S3_EHR_RECORDS_BUCKET || 'mediconnect-ehr-records';
        const ehrBucketName = (isEU && !ehrBucket.endsWith('-eu')) ? `${ehrBucket}-eu` : ehrBucket;

        // List and delete all objects (including all versions) under ehr/{userId}/
        const listResult = await regionalS3.send(new ListObjectsV2Command({
            Bucket: ehrBucketName,
            Prefix: `ehr/${userId}/`
        }));
        for (const obj of (listResult.Contents || [])) {
            if (obj.Key) {
                await deleteS3ObjectVersions(regionalS3, ehrBucketName, obj.Key);
            }
        }
        safeLog(`[GDPR] Deleted ${(listResult.Contents || []).length} EHR S3 objects (all versions) for patient ${userId}`);
    } catch (s3EhrErr) {
        safeError(`[GDPR Warning] Failed to delete EHR S3 records for ${userId}`, s3EhrErr);
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
        safeError("Failed to send deletion alerts/emails", err);
    }
    
    try {
        const cognitoClient = getRegionalCognitoClient(region);
        const userPoolId = region.toUpperCase() === 'EU' ? process.env.COGNITO_USER_POOL_ID_EU : process.env.COGNITO_USER_POOL_ID_US;

        if (userPoolId) {
            await cognitoClient.send(new AdminDeleteUserCommand({
                UserPoolId: userPoolId,
                Username: userId
            }));
            safeLog(`[COMPLIANCE] Patient Identity ${userId} permanently erased from Cognito.`);
        }
    } catch (cognitoErr) {
        safeError("Failed to remove patient from Cognito Pool", cognitoErr);
    }

    // Event bus: patient deleted (GDPR erasure)
    publishEvent(EventType.PATIENT_DELETED, { patientId: userId, region }, region).catch(() => {});

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
        ExpressionAttributeValues: { ":name": name as string },
        ProjectionExpression: "patientId, #n, email, avatar, gender, createdAt"
    });

    const result = await dynamicDb.send(command);

    await writeAuditLog(user.id, "MULTIPLE", "SEARCH_PATIENT", "Database search performed", {
        region, ipAddress: req.ip, searchCriteria: { name: name || '' }
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
            TableName: process.env.TABLE_APPOINTMENTS || "mediconnect-appointments",
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

    // 🟢 HIPAA: Decrypt PHI fields before returning to client
    try {
        const decrypted = await decryptPHI(
            { name: response.Item.name, dob: response.Item.dob, phone: response.Item.phone, email: response.Item.email },
            region
        );
        if (decrypted.name) response.Item.name = decrypted.name;
        if (decrypted.dob) response.Item.dob = decrypted.dob;
        if (decrypted.phone) response.Item.phone = decrypted.phone;
        if (decrypted.email) response.Item.email = decrypted.email;
    } catch { /* KMS unavailable — fields are already plaintext */ }

    response.Item.avatar = await signAvatarUrl(response.Item.avatar, region);

    await writeAuditLog(requesterId, requestedId, "READ_PATIENT_BY_ID", "Authorized medical record accessed", { region, role: isDoctor ? 'doctor' : 'patient' });
    res.json(response.Item);
});

/**
 * 9. EXPORT PATIENT DATA (GDPR Right to Data Portability)
 */
export const exportPatientData = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Fetch patient's complete profile
    const patientResponse = await dynamicDb.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { patientId: userId }
    }));

    if (!patientResponse.Item) return res.status(404).json({ error: "Patient not found" });

    const patientData = patientResponse.Item;

    // 🟢 HIPAA: Decrypt PHI fields before export
    try {
        const decrypted = await decryptPHI(
            { name: patientData.name, dob: patientData.dob, phone: patientData.phone, email: patientData.email },
            region
        );
        if (decrypted.name) patientData.name = decrypted.name;
        if (decrypted.dob) patientData.dob = decrypted.dob;
        if (decrypted.phone) patientData.phone = decrypted.phone;
        if (decrypted.email) patientData.email = decrypted.email;
    } catch { /* KMS unavailable — fields are already plaintext */ }

    // Fetch patient's appointments
    const appointmentsResponse = await dynamicDb.send(new ScanCommand({
        TableName: process.env.TABLE_APPOINTMENTS || "mediconnect-appointments",
        FilterExpression: "patientId = :pid",
        ExpressionAttributeValues: { ":pid": userId }
    }));

    const appointments = appointmentsResponse.Items || [];

    // Fetch patient's vitals
    const vitalsResponse = await dynamicDb.send(new ScanCommand({
        TableName: process.env.DYNAMO_TABLE_VITALS || "mediconnect-iot-vitals",
        FilterExpression: "patientId = :pid",
        ExpressionAttributeValues: { ":pid": userId }
    }));

    const vitals = vitalsResponse.Items || [];

    // GDPR Art. 20: Export ALL personal data across all tables
    let allergies: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_ALLERGIES || 'mediconnect-allergies', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        allergies = r.Items || [];
    } catch { /* Table may not exist */ }

    let immunizations: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_IMMUNIZATIONS || 'mediconnect-immunizations', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        immunizations = r.Items || [];
    } catch { /* Table may not exist */ }

    let carePlans: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_CARE_PLANS || 'mediconnect-care-plans', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        carePlans = r.Items || [];
    } catch { /* Table may not exist */ }

    let prescriptions: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: 'mediconnect-prescriptions', IndexName: 'PatientIndex', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        prescriptions = r.Items || [];
    } catch { /* Table may not exist */ }

    let labOrders: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_LAB_ORDERS || 'mediconnect-lab-orders', IndexName: 'PatientIndex', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        labOrders = r.Items || [];
    } catch { /* Table may not exist */ }

    let referrals: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_REFERRALS || 'mediconnect-referrals', IndexName: 'PatientIndex', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        referrals = r.Items || [];
    } catch { /* Table may not exist */ }

    let consentLedger: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: 'mediconnect-consent-ledger', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        consentLedger = r.Items || [];
    } catch { /* Table may not exist */ }

    let transactions: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: process.env.TABLE_TRANSACTIONS || 'mediconnect-transactions', FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        transactions = r.Items || [];
    } catch { /* Table may not exist */ }

    let reconciliations: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_MED_RECON || 'mediconnect-med-reconciliations', IndexName: 'PatientIndex', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        reconciliations = r.Items || [];
    } catch { /* Table may not exist */ }

    let chatHistory: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: 'mediconnect-chat-history', FilterExpression: 'senderId = :uid OR recipientId = :uid', ExpressionAttributeValues: { ':uid': userId } }));
        chatHistory = r.Items || [];
    } catch { /* Table may not exist */ }

    let sdohAssessments: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_SDOH || 'mediconnect-sdoh-assessments', IndexName: 'patientId-index', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        sdohAssessments = r.Items || [];
    } catch { /* Table may not exist */ }

    let healthRecords: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_EHR || 'mediconnect-health-records', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        healthRecords = r.Items || [];
    } catch { /* Table may not exist */ }

    let eligibilityChecks: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_ELIGIBILITY || 'mediconnect-eligibility-checks', IndexName: 'patientId-index', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        eligibilityChecks = r.Items || [];
    } catch { /* Table may not exist */ }

    let priorAuths: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_PRIOR_AUTH || 'mediconnect-prior-auth', IndexName: 'patientId-index', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        priorAuths = r.Items || [];
    } catch { /* Table may not exist */ }

    let emergencyAccessLogs: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: process.env.TABLE_EMERGENCY_ACCESS || 'mediconnect-emergency-access', FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        emergencyAccessLogs = r.Items || [];
    } catch { /* Table may not exist */ }

    let graphData: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_GRAPH || 'mediconnect-graph-data', KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `PATIENT#${userId}` } }));
        graphData = r.Items || [];
        // Decrypt PHI fields in graph-data (doctorName, patientName) for GDPR Art. 20 portability
        for (const g of graphData) {
            try {
                if (g.doctorName) {
                    const decrypted = await decryptPHI({ name: g.doctorName }, region);
                    if (decrypted.name) g.doctorName = decrypted.name;
                }
                if (g.patientName) {
                    const decrypted = await decryptPHI({ name: g.patientName }, region);
                    if (decrypted.name) g.patientName = decrypted.name;
                }
            } catch { /* KMS unavailable — field may already be plaintext */ }
        }
    } catch { /* Table may not exist */ }

    let videoSessions: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: process.env.TABLE_SESSIONS || 'mediconnect-video-sessions', FilterExpression: 'contains(participantIds, :uid) OR patientId = :uid', ExpressionAttributeValues: { ':uid': userId } }));
        videoSessions = r.Items || [];
    } catch { /* Table may not exist */ }

    let bluebuttonConnections: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_BB_CONNECTIONS || 'mediconnect-bluebutton-connections', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        bluebuttonConnections = r.Items || [];
    } catch { /* Table may not exist */ }

    let reminders: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: process.env.TABLE_REMINDERS || 'mediconnect-reminders', FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        reminders = r.Items || [];
    } catch { /* Table may not exist */ }

    let hl7Messages: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: 'mediconnect-hl7-messages', FilterExpression: 'contains(#raw, :uid)', ExpressionAttributeNames: { '#raw': 'raw' }, ExpressionAttributeValues: { ':uid': userId } }));
        hl7Messages = r.Items || [];
    } catch { /* Table may not exist */ }

    let mpiLinks: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: process.env.TABLE_MPI || 'mediconnect-mpi-links', FilterExpression: 'sourcePatientId = :pid OR targetPatientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        mpiLinks = r.Items || [];
    } catch { /* Table may not exist */ }

    let ecrReports: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: process.env.TABLE_ECR || 'mediconnect-ecr-reports', FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        ecrReports = r.Items || [];
    } catch { /* Table may not exist */ }

    let elrReports: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: process.env.TABLE_ELR || 'mediconnect-elr-reports', FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        elrReports = r.Items || [];
    } catch { /* Table may not exist */ }

    let dicomStudies: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: process.env.TABLE_DICOM_STUDIES || 'mediconnect-dicom-studies', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        dicomStudies = r.Items || [];
    } catch { /* Table may not exist */ }

    // Generate presigned S3 URLs for downloadable files (GDPR Art. 20 — actual data, not just metadata)
    const regionalS3Export = getRegionalS3Client(region);
    const isEUExport = region.toUpperCase() === 'EU';

    // EHR document download URLs
    for (const hr of healthRecords) {
        try {
            if (hr.s3Key || hr.recordId) {
                const ehrBucket = isEUExport
                    ? (process.env.EHR_BUCKET_EU || 'mediconnect-ehr-records-eu')
                    : (process.env.EHR_BUCKET_US || 'mediconnect-ehr-records');
                const key = hr.s3Key || `ehr/${userId}/${hr.recordId}`;
                const url = await getSignedUrl(regionalS3Export, new GetObjectCommand({ Bucket: ehrBucket, Key: key }), { expiresIn: 3600 });
                hr.downloadUrl = url;
            }
        } catch { /* S3 object may not exist */ }
    }

    // DICOM study download URLs
    for (const ds of dicomStudies) {
        try {
            if (ds.s3Key || ds.studyInstanceUID) {
                const dicomBucket = isEUExport
                    ? (process.env.BUCKET_NAME_DICOM_EU || 'mediconnect-medical-images-eu')
                    : (process.env.BUCKET_NAME_DICOM || 'mediconnect-medical-images');
                const key = ds.s3Key || `dicom/${userId}/${ds.studyInstanceUID}`;
                const url = await getSignedUrl(regionalS3Export, new GetObjectCommand({ Bucket: dicomBucket, Key: key }), { expiresIn: 3600 });
                ds.downloadUrl = url;
            }
        } catch { /* S3 object may not exist */ }
    }

    // Prescription PDF download URLs
    for (const rx of prescriptions) {
        try {
            if (rx.prescriptionId) {
                const rxBucket = isEUExport
                    ? (process.env.S3_BUCKET_PRESCRIPTIONS_EU || 'mediconnect-prescriptions-eu')
                    : (process.env.S3_BUCKET_PRESCRIPTIONS_US || 'mediconnect-prescriptions');
                const url = await getSignedUrl(regionalS3Export, new GetObjectCommand({ Bucket: rxBucket, Key: `prescriptions/${rx.prescriptionId}.pdf` }), { expiresIn: 3600 });
                rx.downloadUrl = url;
            }
        } catch { /* S3 object may not exist */ }
    }

    // Query BigQuery for symptom analysis and vitals data (GDPR Art. 20 — patient-generated content)
    let symptomLogs: any[] = [];
    let bigqueryVitals: any[] = [];
    try {
        const bqAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
        const bqClient = await bqAuth.getClient();
        const bqToken = (await bqClient.getAccessToken()).token;
        const bqProject = await bqAuth.getProjectId();

        if (bqToken && bqProject) {
            const hashedUserId = createHash('sha256').update(userId + (process.env.HIPAA_SALT || 'mediconnect_salt')).digest('hex');
            const aiDataset = isEUExport ? 'mediconnect_ai_eu' : 'mediconnect_ai';
            const iotDataset = isEUExport ? 'iot_eu' : 'iot';
            const bqHeaders = { "Authorization": `Bearer ${bqToken}`, "Content-Type": "application/json" };

            // Fetch symptom analysis sessions
            try {
                const symptomResponse = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${bqProject}/queries`, {
                    method: "POST",
                    headers: bqHeaders,
                    body: JSON.stringify({
                        query: `SELECT * FROM \`${bqProject}.${aiDataset}.symptom_logs\` WHERE user_id = @hashedId`,
                        useLegacySql: false,
                        parameterMode: "NAMED",
                        queryParameters: [{ name: "hashedId", parameterType: { type: "STRING" }, parameterValue: { value: hashedUserId } }]
                    })
                });
                if (symptomResponse.ok) {
                    const symptomData = await symptomResponse.json() as any;
                    symptomLogs = (symptomData.rows || []).map((row: any) => {
                        const fields = symptomData.schema?.fields || [];
                        const entry: any = {};
                        fields.forEach((f: any, i: number) => { entry[f.name] = row.f?.[i]?.v; });
                        return entry;
                    });
                }
            } catch { /* BigQuery symptom query failed */ }

            // Fetch IoT vitals from BigQuery
            try {
                const vitalsResponse = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${bqProject}/queries`, {
                    method: "POST",
                    headers: bqHeaders,
                    body: JSON.stringify({
                        query: `SELECT * FROM \`${bqProject}.${iotDataset}.vitals_raw\` WHERE JSON_EXTRACT_SCALAR(data, '$.patientId') = @hashedId`,
                        useLegacySql: false,
                        parameterMode: "NAMED",
                        queryParameters: [{ name: "hashedId", parameterType: { type: "STRING" }, parameterValue: { value: hashedUserId } }]
                    })
                });
                if (vitalsResponse.ok) {
                    const vitalsData = await vitalsResponse.json() as any;
                    bigqueryVitals = (vitalsData.rows || []).map((row: any) => {
                        const fields = vitalsData.schema?.fields || [];
                        const entry: any = {};
                        fields.forEach((f: any, i: number) => { entry[f.name] = row.f?.[i]?.v; });
                        return entry;
                    });
                }
            } catch { /* BigQuery vitals query failed */ }
        }
    } catch { /* BigQuery unavailable — export continues without analytics data */ }

    // Build FHIR Bundle for data portability
    const allEntries = [
        { resource: { resourceType: "Patient", ...patientData } },
        ...appointments.map(a => ({ resource: a })),
        ...vitals.map(v => ({ resource: v })),
        ...allergies.map(a => ({ resource: { resourceType: "AllergyIntolerance", ...a } })),
        ...immunizations.map(i => ({ resource: { resourceType: "Immunization", ...i } })),
        ...carePlans.map(cp => ({ resource: { resourceType: "CarePlan", ...cp } })),
        ...prescriptions.map(rx => ({ resource: { resourceType: "MedicationRequest", ...rx } })),
        ...labOrders.map(lo => ({ resource: { resourceType: "ServiceRequest", ...lo } })),
        ...referrals.map(r => ({ resource: { resourceType: "ServiceRequest", ...r } })),
        ...consentLedger.map(c => ({ resource: { resourceType: "Consent", ...c } })),
        ...transactions.map(t => ({ resource: { resourceType: "PaymentNotice", ...t } })),
        ...reconciliations.map(r => ({ resource: { resourceType: "DetectedIssue", ...r } })),
        ...chatHistory.map(c => ({ resource: { resourceType: "Communication", ...c } })),
        ...sdohAssessments.map(s => ({ resource: { resourceType: "QuestionnaireResponse", id: s.assessmentId, questionnaire: 'Questionnaire/ahc-hrsn-screening', status: s.status || 'completed', subject: { reference: `Patient/${userId}` }, authored: s.createdAt, totalScore: s.totalScore, riskLevel: s.riskLevel, ...s } })),
        ...healthRecords.map(hr => ({ resource: { resourceType: "DocumentReference", id: hr.recordId, status: 'current', subject: { reference: `Patient/${userId}` }, date: hr.createdAt, ...hr } })),
        ...eligibilityChecks.map(ec => ({ resource: { resourceType: "CoverageEligibilityResponse", id: ec.checkId, status: 'active', patient: { reference: `Patient/${userId}` }, created: ec.createdAt, insurer: { display: ec.payerName || ec.payerId }, ...ec } })),
        ...priorAuths.map(pa => ({ resource: { resourceType: "ClaimResponse", id: pa.authId, status: pa.status || 'active', patient: { reference: `Patient/${userId}` }, created: pa.createdAt, ...pa } })),
        ...emergencyAccessLogs.map(ea => ({ resource: { resourceType: "AuditEvent", id: ea.overrideId, type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110113', display: 'Security Alert' }, action: 'E', recorded: ea.grantedAt, agent: [{ who: { reference: `Practitioner/${ea.actorId}` } }], entity: [{ what: { reference: `Patient/${userId}` } }], reasonCode: ea.reasonCode, durationMinutes: ea.durationMinutes, ...ea } })),
        ...graphData.map(g => ({ resource: { resourceType: "Basic", id: `${g.PK}-${g.SK}`, code: { text: 'relationship' }, subject: { reference: `Patient/${userId}` }, relationship: g.relationship, lastInteraction: g.lastInteraction } })),
        ...videoSessions.map(vs => ({ resource: { resourceType: "Encounter", id: vs.sessionId, status: 'finished', class: { code: 'VR', display: 'virtual' }, subject: { reference: `Patient/${userId}` }, period: { start: vs.createdAt } } })),
        ...bluebuttonConnections.map(bb => ({ resource: { resourceType: "Basic", id: `bb-${bb.patientId}`, code: { text: 'blue-button-connection' }, subject: { reference: `Patient/${userId}` }, created: bb.connectedAt } })),
        ...reminders.map(rem => ({ resource: { resourceType: "Communication", id: rem.reminderId, status: rem.status || 'completed', subject: { reference: `Patient/${userId}` }, sent: rem.scheduledAt, payload: [{ contentString: rem.message || 'Appointment reminder' }] } })),
        ...hl7Messages.map(msg => ({ resource: { resourceType: "Basic", id: msg.messageId, code: { text: 'hl7-message' }, subject: { reference: `Patient/${userId}` }, messageType: msg.messageType, status: msg.status, receivedAt: msg.receivedAt } })),
        ...mpiLinks.map(link => ({ resource: { resourceType: "Basic", id: link.linkId, code: { text: 'mpi-link' }, subject: { reference: `Patient/${userId}` }, sourcePatientId: link.sourcePatientId, targetPatientId: link.targetPatientId, matchScore: link.matchScore, linkedAt: link.linkedAt } })),
        ...ecrReports.map(ecr => ({ resource: { resourceType: "Composition", id: ecr.reportId, meta: { profile: ['http://hl7.org/fhir/us/ecr/StructureDefinition/eicr-composition'] }, status: ecr.status || 'final', subject: { reference: `Patient/${userId}` }, date: ecr.reportDate, title: 'Electronic Case Report', conditionCode: ecr.conditionCode, conditionDisplay: ecr.conditionDisplay, urgency: ecr.urgency } })),
        ...elrReports.map(elr => ({ resource: { resourceType: "DiagnosticReport", id: elr.reportId, meta: { profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-diagnosticreport-lab'] }, status: elr.status || 'final', subject: { reference: `Patient/${userId}` }, effectiveDateTime: elr.collectionDate || elr.reportDate, issued: elr.reportDate, code: { coding: [{ system: 'http://loinc.org', code: elr.testLoinc, display: elr.testDisplay }] }, result: [{ display: `${elr.testDisplay}: ${elr.resultValue} ${elr.resultUnit || ''}` }] } })),
        ...dicomStudies.map(ds => ({ resource: { resourceType: "ImagingStudy", id: ds.studyInstanceUID, status: 'available', subject: { reference: `Patient/${userId}` }, started: ds.studyDate || ds.createdAt, numberOfSeries: ds.numberOfSeries, numberOfInstances: ds.numberOfInstances, modality: ds.modality ? [{ system: 'http://dicom.nema.org/resources/ontology/DCM', code: ds.modality }] : undefined, description: ds.studyDescription, downloadUrl: ds.downloadUrl } })),
        ...symptomLogs.map(sl => ({ resource: { resourceType: "Observation", id: `symptom-${sl.timestamp || sl.session_id}`, status: 'final', code: { text: 'AI Symptom Analysis' }, subject: { reference: `Patient/${userId}` }, effectiveDateTime: sl.timestamp, valueString: sl.symptoms, component: [{ code: { text: 'risk_level' }, valueString: sl.risk_level }, { code: { text: 'ai_provider' }, valueString: sl.provider }] } })),
        ...bigqueryVitals.map(bv => ({ resource: { resourceType: "Observation", id: `bq-vital-${bv.timestamp}`, status: 'final', code: { text: 'IoT Vital Reading (Analytics)' }, subject: { reference: `Patient/${userId}` }, effectiveDateTime: bv.timestamp, category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }] } })),
    ];

    const exportBundle = {
        resourceType: "Bundle",
        type: "document",
        timestamp: new Date().toISOString(),
        total: allEntries.length,
        entry: allEntries
    };

    await writeAuditLog(userId, userId, "GDPR_DATA_EXPORT", "Patient exported personal data", { region, ipAddress: req.ip });

    // SOC 2 P1: Mark exported data with integrity hash
    const exportHash = createHash('sha256').update(JSON.stringify(exportBundle)).digest('hex');
    res.setHeader('X-Export-Integrity', exportHash);
    res.setHeader('X-Export-Encryption', 'AES-256-GCM-client-side');

    res.json(exportBundle);
});