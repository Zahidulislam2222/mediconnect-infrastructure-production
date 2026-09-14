import { requestJurisdiction } from '../../../shared/region-context';
import { createPortabilityBundle } from '../../../shared/fhir-portability';
import { obtainErasureRefund } from '../../../shared/privacy-refund';
import { completeErasureQuery, completeAnalyticsExport } from '../../../shared/privacy-analytics';
import { z } from 'zod';
import { completePrivacyClient, eraseS3Versions, eraseSubjectDlqVersions, ErasureWorkflow, ErasureProgress } from '../../../shared/privacy-operations';
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
import { TABLE_NAMES, requiredEnv, setting, getPrivacySettings, getPrivacyAnalyticsSettings } from '../../../shared/settings';

// Shared Clients
import { getRegionalClient, getRegionalS3Client, getRegionalRekognitionClient, getRegionalSNSClient } from '../../../shared/aws-config';

// =============================================================================
// ⚙️ CONFIGURATION & ENV HANDLING
// =============================================================================
const CONFIG = {
    get DYNAMO_TABLE() { return setting("DYNAMO_TABLE"); },
    get DOCTOR_TABLE() { return setting("DYNAMO_TABLE_DOCTORS"); },
    get BUCKET_NAME() { return setting("BUCKET_NAME"); },
};

// =============================================================================
// 🛠️ HELPERS
// =============================================================================

// Helper to handle async errors (Prevents Node.js crash on unhandled promises)
const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// 🟢 COMPILER & GDPR FIX: Safely parse headers to determine Legal Jurisdiction
export const extractRegion = (req: Request): string => requestJurisdiction(req);

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
async function deleteS3ObjectVersions(s3Client: any, bucket: string, key: string): Promise<void> {
    await eraseS3Versions(s3Client, bucket, key, getPrivacySettings(), true);
}

/**
 * Deletes patient data from all BigQuery tables using DML DELETE queries.
 * Uses parameterized queries to prevent SQL injection.
 * Non-blocking: logs errors but never throws.
 */
async function deleteBigQueryPatientData(patientId: string, region: 'US' | 'EU', requestId: string): Promise<void> {
    const config = getPrivacyAnalyticsSettings(region);
    const hashedId = createHash('sha256').update(patientId + requiredEnv('HIPAA_SALT')).digest('hex');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const token = (await client.getAccessToken()).token;
    const projectId = await auth.getProjectId();
    if (!token || !projectId) throw new Error('PRIVACY_ANALYTICS_AUTH_REQUIRED');
    const queries = [
        { label: 'appointments_stream', query: `DELETE FROM \`${config.analyticsDataset}.appointments_stream\` WHERE patient_id = @hashedId` },
        { label: 'analytics_revenue', query: `DELETE FROM \`${config.analyticsDataset}.analytics_revenue\` WHERE patient_id = @hashedId` },
        { label: 'symptom_logs', query: `DELETE FROM \`${config.aiDataset}.symptom_logs\` WHERE user_id = @hashedId` },
        { label: 'vitals_raw', query: `DELETE FROM \`${config.iotDataset}.${config.iotTable}\` WHERE JSON_EXTRACT_SCALAR(data, '$.patientId') = @hashedId` },
    ];
    for (const item of queries) {
        const jobId = `erasure_${createHash('sha256').update(requestId + item.label).digest('hex')}`;
        await completeErasureQuery({ ...config, projectId, token, hashedId, jobId, query: item.query });
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
    let encryptedPHI: Record<string, string>;
    try {
        encryptedPHI = await encryptPHI(
            { name, ...(dob ? { dob } : {}), ...(phone ? { phone } : {}), email },
            region
        );
    } catch {
        return res.status(503).json({ code: 'PHI_ENCRYPTION_UNAVAILABLE', error: 'Protected data could not be saved. Please retry later.' });
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
    } catch { return res.status(503).json({ code: 'PHI_DECRYPTION_UNAVAILABLE', error: 'Protected data is temporarily unavailable.' }); }

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
    } catch {
        return res.status(503).json({ code: 'PHI_ENCRYPTION_UNAVAILABLE', error: 'Protected data could not be saved. Please retry later.' });
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
    const identity = (req as any).user;
    if (!identity?.id || !identity.region) return res.status(401).json({ error: 'Unauthorized' });
    const config = getPrivacySettings();
    const normalized = String(identity.region).toUpperCase();
    const region = normalized === 'EU' || identity.region === config.euRegion ? 'EU'
        : normalized === 'US' || identity.region === config.usRegion ? 'US' : null;
    if (!region) return res.status(400).json({ error: 'Unsupported authenticated region' });
    const userId = req.params.patientId || identity.id;
    if (userId !== identity.id && identity.isAdmin !== true) return res.status(403).json({ error: 'Forbidden' });
    const rawDb = getRegionalClient(region);
    const dynamicDb = completePrivacyClient(rawDb, config);
    const userCheck = await rawDb.send(new GetCommand({ TableName: CONFIG.DYNAMO_TABLE, Key: { patientId: userId }, ConsistentRead: true }));
    if (!userCheck.Item) return res.status(404).json({ error: 'Patient not found' });
    const previous = userCheck.Item.erasure;
    if (previous?.state === 'COMPLETED') return res.json({ status: 'ERASED_WITH_RETENTION', requestId: previous.requestId });
    const requestId = previous?.requestId || randomUUID();
    const approved = previous && userCheck.Item.erasureApproval?.requestId === previous.requestId
        && config.executionEnabled && userCheck.Item.erasureApproval?.decision === 'APPROVED'
        && userCheck.Item.erasureApproval?.policyVersion === config.policyVersion && !userCheck.Item.legalHold;
    const progress: ErasureProgress = previous || { requestId, requestedAt: new Date().toISOString(), completed: [], state: 'REVIEW_REQUIRED' };
    if (!approved) {
        if (previous) return res.status(previous.state === 'IN_PROGRESS' ? 409 : 202).json({ status: previous.state === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'REVIEW_REQUIRED', requestId });
        try {
        await rawDb.send(new UpdateCommand({ TableName: CONFIG.DYNAMO_TABLE, Key: { patientId: userId },
            UpdateExpression: 'SET erasure = :progress REMOVE #ttl', ExpressionAttributeNames: { '#ttl': 'ttl' },
            ConditionExpression: 'attribute_exists(patientId) AND attribute_not_exists(erasure) AND attribute_not_exists(erasureOwner)',
            ExpressionAttributeValues: { ':progress': { ...progress, state: 'REVIEW_REQUIRED' } } }));
        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') return res.status(409).json({ status: 'REQUEST_CHANGED' });
            throw error;
        }
        return res.status(202).json({ status: 'REVIEW_REQUIRED', requestId });
    }
    const owner = randomUUID();
    const now = Date.now();
    try {
        await rawDb.send(new UpdateCommand({ TableName: CONFIG.DYNAMO_TABLE, Key: { patientId: userId },
            UpdateExpression: 'SET erasure = :progress, erasureOwner = :owner, erasureLeaseUntil = :lease REMOVE #ttl',
            ConditionExpression: '(attribute_not_exists(erasureLeaseUntil) OR erasureLeaseUntil < :now) AND erasure.requestId = :request AND erasureApproval.requestId = :request AND erasureApproval.decision = :approved AND erasureApproval.policyVersion = :policy AND (attribute_not_exists(legalHold) OR legalHold = :false)',
            ExpressionAttributeNames: { '#ttl': 'ttl' },
            ExpressionAttributeValues: { ':progress': { ...progress, state: 'IN_PROGRESS' }, ':owner': owner, ':lease': now + config.leaseSeconds * 1000, ':now': now, ':approved': 'APPROVED', ':policy': config.policyVersion, ':false': false, ':request': requestId } }));
    } catch (error: any) {
        if (error.name === 'ConditionalCheckFailedException') return res.status(409).json({ status: 'IN_PROGRESS', requestId });
        throw error;
    }
    const persist = async (value: ErasureProgress) => {
        await rawDb.send(new UpdateCommand({ TableName: CONFIG.DYNAMO_TABLE, Key: { patientId: userId },
            UpdateExpression: 'SET erasure = :progress, erasureLeaseUntil = :lease', ConditionExpression: 'erasureOwner = :owner',
            ExpressionAttributeValues: { ':progress': JSON.parse(JSON.stringify(value)), ':owner': owner, ':lease': Date.now() + config.leaseSeconds * 1000 } }));
    };
    const workflow = new ErasureWorkflow(progress, persist);
    try {
await workflow.stage('appointments', async () => {

    const stripeKey = await getSSMParameter("/mediconnect/stripe/keys", region, true);
    const stripe = stripeKey ? new Stripe(stripeKey) : null;
    const apptQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_APPOINTMENTS"),
        IndexName: "PatientIndex",
        KeyConditionExpression: "patientId = :pid",
        ExpressionAttributeValues: { ":pid": userId }
    }));
    const appointments = apptQuery.Items || [];
    const nowMs = Date.parse(progress.requestedAt);
    if (!Number.isFinite(nowMs)) throw new Error('PRIVACY_INVALID_REQUEST_TIME');
    for (const apt of appointments) {
        const aptTimeMs = new Date(apt.timeSlot).getTime();
        const isFuture = aptTimeMs > nowMs;
        const isNotCancelled = apt.status !== "CANCELLED" && apt.status !== "CANCELLED_NO_SHOW";
        // GDPR Anonymization for FHIR Resource
        const fhirResource = apt.resource || {};
        fhirResource.name = [{ use: "official", text: "ANONYMIZED_GDPR" }];
        if (Array.isArray(fhirResource.participant)) {
            (fhirResource.participant || []).forEach((p: any) => {
                if (p.actor?.reference === `Patient/${userId}`) {
                    p.actor.display = "ANONYMIZED_GDPR";
                }
            });
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
                    if (!storedToken) throw new Error('PRIVACY_CALENDAR_ACCESS_REQUIRED');
                    if (storedToken) {
                        const refreshToken = await decryptToken(storedToken, region);
                        const tokenRes = await axios.post<{
                            access_token: string;
                        }>('https://oauth2.googleapis.com/token', {
                            client_id: process.env.GOOGLE_CLIENT_ID,
                            client_secret: process.env.GOOGLE_CLIENT_SECRET,
                            refresh_token: refreshToken,
                            grant_type: 'refresh_token'
                        });
                        await axios.delete(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${apt.googleEventId}`, { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } });
                        safeLog(`[GDPR] Deleted Google Calendar event ${apt.googleEventId} for appointment ${apt.appointmentId}`);
                    }
                }
                catch (calErr: any) {
                    if (![404, 410].includes(calErr.response?.status)) throw calErr;
                }
            }
        if (isFuture && isNotCancelled) {
            // 1. Refund the future appointment
            let refundId = "NOT_APPLICABLE";
            if (apt.paymentId && apt.paymentId !== "TEST_MODE" && apt.paymentStatus === 'paid') {
                if (!stripe) throw new Error('PRIVACY_REFUND_PROVIDER_REQUIRED');
                {
                    const refund = await obtainErasureRefund(stripe, apt.paymentId, apt.appointmentId, requestId, config.maxPages);
                    refundId = refund.id;
                    // Ledger Entry for Refund
                    await dynamicDb.send(new PutCommand({
                        TableName: setting("TABLE_TRANSACTIONS"),
                        Item: {
                            billId: `erasure-refund-${apt.appointmentId}`, referenceId: apt.appointmentId,
                            patientId: userId, doctorId: apt.doctorId || "UNKNOWN",
                            type: "REFUND", amount: -(apt.amountPaid || 0),
                            currency: "USD", status: "PROCESSED",
                            createdAt: new Date().toISOString(), description: "GDPR Account Deletion Auto-Refund"
                        }
                    }));
                }
            }
            // 3. Remove Doctor Lock so another patient can book this slot
            if (apt.doctorId && apt.timeSlot) {
                {
                    const lockKey = `${apt.doctorId}#${apt.timeSlot}`;
                    await dynamicDb.send(new DeleteCommand({
                        TableName: setting("TABLE_LOCKS"),
                        Key: { lockId: lockKey }
                    }));
                }
            }
            // 2. Cancel the appointment & anonymize
            fhirResource.status = "cancelled";
            (fhirResource.participant || []).forEach((p: any) => p.status = "declined");
            await dynamicDb.send(new UpdateCommand({
                TableName: setting("TABLE_APPOINTMENTS"),
                Key: { appointmentId: apt.appointmentId },
                UpdateExpression: "SET #s = :s, refundId = :r, patientName = :anon, patientAvatar = :null, #res = :resource, lastUpdated = :now",
                ExpressionAttributeNames: { "#s": "status", "#res": "resource" },
                ExpressionAttributeValues: {
                    ":s": "CANCELLED", ":r": refundId, ":anon": "ANONYMIZED_GDPR", ":null": null, ":resource": fhirResource, ":now": new Date().toISOString()
                }
            }));

        }
        else {
            // Just Anonymize past/completed appointments (Don't refund, just strip PII for GDPR)
            await dynamicDb.send(new UpdateCommand({
                TableName: setting("TABLE_APPOINTMENTS"),
                Key: { appointmentId: apt.appointmentId },
                UpdateExpression: "SET patientName = :anon, patientAvatar = :null, #res = :resource, lastUpdated = :now",
                ExpressionAttributeNames: { "#res": "resource" },
                ExpressionAttributeValues: {
                    ":anon": "ANONYMIZED_GDPR", ":null": null, ":resource": fhirResource, ":now": new Date().toISOString()
                }
            }));
        }
        // 🟢 BIGQUERY PUSH (Runs for every appointment after DB is updated)

    }

});
await workflow.stage('analytics', async () => {
await deleteBigQueryPatientData(userId, region, requestId);
});
await workflow.stage('chat', async () => {

    let chatLastKey: any = undefined;
    do {
        const chatScan = await dynamicDb.send(new ScanCommand({
            TableName: TABLE_NAMES.chatHistory,
            FilterExpression: 'senderId = :uid OR recipientId = :uid',
            ExpressionAttributeValues: { ':uid': userId },
            ...(chatLastKey ? { ExclusiveStartKey: chatLastKey } : {})
        }));
        const chatItems = chatScan.Items || [];
        for (let i = 0; i < chatItems.length; i += 25) {
            const batch = chatItems.slice(i, i + 25).map((item: any) => ({
                DeleteRequest: { Key: { conversationId: item.conversationId, timestamp: item.timestamp } }
            }));
            await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAMES.chatHistory]: batch } }));
        }
        chatLastKey = chatScan.LastEvaluatedKey;
    } while (chatLastKey);
    const tickets = await dynamicDb.send(new ScanCommand({ TableName: TABLE_NAMES.chatConnections,
        FilterExpression: 'subjectId = :uid AND #kind = :kind', ExpressionAttributeNames: { '#kind': 'kind' },
        ExpressionAttributeValues: { ':uid': userId, ':kind': 'CONNECTION_TICKET' } }));
    for (let start = 0; start < (tickets.Items || []).length; start += 25) {
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAMES.chatConnections]: tickets.Items.slice(start, start + 25)
            .map((item: any) => ({ DeleteRequest: { Key: { connectionId: item.connectionId } } })) } }));
    }
    // Granular GDPR audit for chat history erasure
    {
        await writeAuditLog(userId, userId, "GDPR_CHAT_ERASURE", "Chat history deleted under GDPR Art. 17 right to erasure", { region });
    }

});
await workflow.stage('graph', async () => {

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

});
await workflow.stage('reverse-graph', async () => {

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

});
await workflow.stage('prescriptions', async () => {

    const rxQuery = await dynamicDb.send(new QueryCommand({
        TableName: 'mediconnect-prescriptions',
        IndexName: 'PatientIndex',
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    // Delete prescription PDFs from S3 before anonymizing
    {
        const regionalS3 = getRegionalS3Client(region);
        const isEU = region.toUpperCase() === 'EU';
        const rxBucket = isEU
            ? (setting("S3_BUCKET_PRESCRIPTIONS_EU"))
            : (setting("S3_BUCKET_PRESCRIPTIONS_US"));
        for (const rx of (rxQuery.Items || [])) {
            await deleteS3ObjectVersions(regionalS3, rxBucket, `prescriptions/${rx.prescriptionId}.pdf`);
        }
        safeLog(`[GDPR] Deleted ${(rxQuery.Items || []).length} prescription PDFs (all versions) for patient ${userId}`);
    }
    for (const rx of (rxQuery.Items || [])) {
        await dynamicDb.send(new UpdateCommand({
            TableName: 'mediconnect-prescriptions',
            Key: { prescriptionId: rx.prescriptionId },
            UpdateExpression: 'SET patientName = :anon, lastUpdated = :now',
            ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
        }));
    }

});
await workflow.stage('mpi', async () => {

    const mpiQuery = await dynamicDb.send(new ScanCommand({
        TableName: setting("TABLE_MPI"),
        FilterExpression: 'sourcePatientId = :pid OR targetPatientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const mpiItems = mpiQuery.Items || [];
    for (let i = 0; i < mpiItems.length; i += 25) {
        const batch = mpiItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { linkId: item.linkId } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [setting("TABLE_MPI")]: batch } }));
    }

});
await workflow.stage('allergies', async () => {

    const allergyQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_ALLERGIES"),
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const allergyItems = allergyQuery.Items || [];
    for (let i = 0; i < allergyItems.length; i += 25) {
        const batch = allergyItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { patientId: item.patientId, allergyId: item.allergyId } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [setting("TABLE_ALLERGIES")]: batch } }));
    }

});
await workflow.stage('immunizations', async () => {

    const immunQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_IMMUNIZATIONS"),
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const immunItems = immunQuery.Items || [];
    for (let i = 0; i < immunItems.length; i += 25) {
        const batch = immunItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { patientId: item.patientId, immunizationId: item.immunizationId } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [setting("TABLE_IMMUNIZATIONS")]: batch } }));
    }

});
await workflow.stage('care-plans', async () => {

    const cpQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_CARE_PLANS"),
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const cpItems = cpQuery.Items || [];
    for (let i = 0; i < cpItems.length; i += 25) {
        const batch = cpItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { patientId: item.patientId, planId: item.planId || item.carePlanId } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [setting("TABLE_CARE_PLANS")]: batch } }));
    }

});
await workflow.stage('labs', async () => {

    const labQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_LAB_ORDERS"),
        IndexName: 'PatientIndex',
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    for (const lab of (labQuery.Items || [])) {
        await dynamicDb.send(new UpdateCommand({
            TableName: setting("TABLE_LAB_ORDERS"),
            Key: { labOrderId: lab.labOrderId },
            UpdateExpression: 'SET patientName = :anon, patientDob = :null, patientGender = :null, lastUpdated = :now',
            ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':null': null, ':now': new Date().toISOString() }
        }));
    }

});
await workflow.stage('referrals', async () => {

    const refQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_REFERRALS"),
        IndexName: 'PatientIndex',
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    for (const ref of (refQuery.Items || [])) {
        await dynamicDb.send(new UpdateCommand({
            TableName: setting("TABLE_REFERRALS"),
            Key: { referralId: ref.referralId },
            UpdateExpression: 'SET patientName = :anon, lastUpdated = :now',
            ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
        }));
    }

});
await workflow.stage('medications', async () => {

    const reconQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_MED_RECON"),
        IndexName: 'PatientIndex',
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    for (const recon of (reconQuery.Items || [])) {
        await dynamicDb.send(new UpdateCommand({
            TableName: setting("TABLE_MED_RECON"),
            Key: { reconciliationId: recon.reconciliationId },
            UpdateExpression: 'SET patientName = :anon, lastUpdated = :now',
            ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
        }));
    }

});
await workflow.stage('vitals', async () => {

    const vitalsQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("DYNAMO_TABLE_VITALS"),
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const vitalsItems = vitalsQuery.Items || [];
    for (let i = 0; i < vitalsItems.length; i += 25) {
        const batch = vitalsItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { patientId: item.patientId, timestamp: item.timestamp } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [setting("DYNAMO_TABLE_VITALS")]: batch } }));
    }
    safeLog(`[GDPR] Deleted ${vitalsItems.length} vitals records for patient ${userId}`);

});
await workflow.stage('ehr', async () => {

    const ehrQuery = await dynamicDb.send(new QueryCommand({
        TableName: TABLE_NAMES.ehr,
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const ehrItems = ehrQuery.Items || [];
    for (let i = 0; i < ehrItems.length; i += 25) {
        const batch = ehrItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { patientId: item.patientId, recordId: item.recordId } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAMES.ehr]: batch } }));
    }
    safeLog(`[GDPR] Deleted ${ehrItems.length} health records for patient ${userId}`);

});
await workflow.stage('sdoh', async () => {

    const sdohQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_SDOH"),
        IndexName: 'patientId-index',
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const sdohItems = sdohQuery.Items || [];
    for (let i = 0; i < sdohItems.length; i += 25) {
        const batch = sdohItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { assessmentId: item.assessmentId } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [setting("TABLE_SDOH")]: batch } }));
    }
    safeLog(`[GDPR] Deleted ${sdohItems.length} SDOH assessments for patient ${userId}`);

});
await workflow.stage('eligibility', async () => {

    const eligQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_ELIGIBILITY"),
        IndexName: 'patientId-index',
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const eligItems = eligQuery.Items || [];
    for (let i = 0; i < eligItems.length; i += 25) {
        const batch = eligItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { checkId: item.checkId } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [setting("TABLE_ELIGIBILITY")]: batch } }));
    }
    safeLog(`[GDPR] Deleted ${eligItems.length} eligibility checks for patient ${userId}`);

});
await workflow.stage('prior-authorization', async () => {

    const priorAuthQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_PRIOR_AUTH"),
        IndexName: 'patientId-index',
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const priorAuthItems = priorAuthQuery.Items || [];
    for (let i = 0; i < priorAuthItems.length; i += 25) {
        const batch = priorAuthItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { authId: item.authId } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [setting("TABLE_PRIOR_AUTH")]: batch } }));
    }
    safeLog(`[GDPR] Deleted ${priorAuthItems.length} prior auth records for patient ${userId}`);

});
await workflow.stage('video-sessions', async () => {

    const videoQuery = await dynamicDb.send(new ScanCommand({
        TableName: setting("TABLE_SESSIONS"),
        FilterExpression: 'contains(participantIds, :uid) OR patientId = :uid',
        ExpressionAttributeValues: { ':uid': userId }
    }));
    for (const session of (videoQuery.Items || [])) {
        await dynamicDb.send(new DeleteCommand({
            TableName: setting("TABLE_SESSIONS"),
            Key: { sessionId: session.sessionId }
        }));
    }
    safeLog(`[GDPR] Deleted ${(videoQuery.Items || []).length} video sessions for patient ${userId}`);

});
await workflow.stage('blue-button', async () => {

    const bbQuery = await dynamicDb.send(new QueryCommand({
        TableName: setting("TABLE_BB_CONNECTIONS"),
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    for (const conn of (bbQuery.Items || [])) {
        await dynamicDb.send(new DeleteCommand({
            TableName: setting("TABLE_BB_CONNECTIONS"),
            Key: { patientId: conn.patientId }
        }));
    }
    safeLog(`[GDPR] Deleted ${(bbQuery.Items || []).length} Blue Button connections for patient ${userId}`);

});
await workflow.stage('exports', async () => {

    const exportQuery = await dynamicDb.send(new ScanCommand({
        TableName: setting("TABLE_EXPORTS"),
        FilterExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    for (const exp of (exportQuery.Items || [])) {
        await dynamicDb.send(new DeleteCommand({
            TableName: setting("TABLE_EXPORTS"),
            Key: { exportId: exp.exportId }
        }));
    }
    safeLog(`[GDPR] Deleted ${(exportQuery.Items || []).length} export jobs for patient ${userId}`);

});
await workflow.stage('reminders', async () => {

    const reminderQuery = await dynamicDb.send(new ScanCommand({
        TableName: setting("TABLE_REMINDERS"),
        FilterExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    for (const rem of (reminderQuery.Items || [])) {
        await dynamicDb.send(new DeleteCommand({
            TableName: setting("TABLE_REMINDERS"),
            Key: { reminderId: rem.reminderId }
        }));
    }
    safeLog(`[GDPR] Deleted ${(reminderQuery.Items || []).length} reminders for patient ${userId}`);

});
await workflow.stage('hl7', async () => {

    const hl7Scan = await dynamicDb.send(new ScanCommand({
        TableName: TABLE_NAMES.hl7Messages,
        FilterExpression: 'contains(#raw, :uid)',
        ExpressionAttributeNames: { '#raw': 'raw' },
        ExpressionAttributeValues: { ':uid': userId }
    }));
    for (const msg of (hl7Scan.Items || [])) {
        await dynamicDb.send(new DeleteCommand({
            TableName: TABLE_NAMES.hl7Messages,
            Key: { messageId: msg.messageId }
        }));
    }
    safeLog(`[GDPR] Deleted ${(hl7Scan.Items || []).length} HL7 messages for patient ${userId}`);

});
await workflow.stage('recordings', async () => {
    const storage = getRegionalS3Client(region);
    const base = setting('RECORDING_BUCKET');
    const bucket = region === 'EU' && !base.endsWith('-eu') ? `${base}-eu` : base;
    const appointments = await dynamicDb.send(new QueryCommand({ TableName: setting('TABLE_APPOINTMENTS'), IndexName: 'PatientIndex', KeyConditionExpression: 'patientId = :id', ExpressionAttributeValues: { ':id': userId } }));
    for (const appointment of appointments.Items || []) await eraseS3Versions(storage, bucket, `recordings/${appointment.appointmentId}/`, config);
});
await workflow.stage('dicom-images', async () => {
    const storage = getRegionalS3Client(region);
    const base = setting('BUCKET_NAME_DICOM');
    const bucket = region === 'EU' && !base.endsWith('-eu') ? `${base}-eu` : base;
    await eraseS3Versions(storage, bucket, `dicom/${userId}/`, config);
    await eraseS3Versions(storage, bucket, `dicom-de-identified/${userId}/`, config);
});
await workflow.stage('dicom-metadata', async () => {

    const dicomMetaQuery = await dynamicDb.send(new QueryCommand({
        TableName: TABLE_NAMES.dicomStudies,
        KeyConditionExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    const dicomMetaItems = dicomMetaQuery.Items || [];
    for (let i = 0; i < dicomMetaItems.length; i += 25) {
        const batch = dicomMetaItems.slice(i, i + 25).map((item: any) => ({
            DeleteRequest: { Key: { patientId: item.patientId, studyInstanceUID: item.studyInstanceUID } }
        }));
        await dynamicDb.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAMES.dicomStudies]: batch } }));
    }
    safeLog(`[GDPR] Deleted ${dicomMetaItems.length} DICOM metadata entries for patient ${userId}`);

});
await workflow.stage('ecr', async () => {

    const ecrScan = await dynamicDb.send(new ScanCommand({
        TableName: setting("TABLE_ECR"),
        FilterExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    for (const ecr of (ecrScan.Items || [])) {
        await dynamicDb.send(new UpdateCommand({
            TableName: setting("TABLE_ECR"),
            Key: { reportId: ecr.reportId },
            UpdateExpression: 'SET patientId = :anon, lastUpdated = :now',
            ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
        }));
    }
    safeLog(`[GDPR] Anonymized ${(ecrScan.Items || []).length} eCR reports for patient ${userId}`);

});
await workflow.stage('elr', async () => {

    const elrScan = await dynamicDb.send(new ScanCommand({
        TableName: setting("TABLE_ELR"),
        FilterExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    for (const elr of (elrScan.Items || [])) {
        await dynamicDb.send(new UpdateCommand({
            TableName: setting("TABLE_ELR"),
            Key: { reportId: elr.reportId },
            UpdateExpression: 'SET patientId = :anon, patientName = :anon, patientDob = :null, patientGender = :null, lastUpdated = :now',
            ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':null': null, ':now': new Date().toISOString() }
        }));
    }
    safeLog(`[GDPR] Anonymized ${(elrScan.Items || []).length} ELR reports for patient ${userId}`);

});
await workflow.stage('transactions', async () => {

    const txScan = await dynamicDb.send(new ScanCommand({
        TableName: setting("TABLE_TRANSACTIONS"),
        FilterExpression: 'patientId = :pid',
        ExpressionAttributeValues: { ':pid': userId }
    }));
    // Delete receipt PDFs from S3 before anonymizing (keyed by billId)
    {
        const regionalS3 = getRegionalS3Client(region);
        const isEU = region.toUpperCase() === 'EU';
        const receiptBucket = isEU
            ? (setting("S3_BUCKET_UPLOADS_EU"))
            : (setting("S3_BUCKET_UPLOADS"));
        for (const tx of (txScan.Items || [])) {
            await deleteS3ObjectVersions(regionalS3, receiptBucket, `receipts/${tx.billId}.pdf`);
        }
        safeLog(`[GDPR] Deleted ${(txScan.Items || []).length} receipt PDFs (all versions) for patient ${userId}`);
    }
    for (const tx of (txScan.Items || [])) {
        await dynamicDb.send(new UpdateCommand({
            TableName: setting("TABLE_TRANSACTIONS"),
            Key: { billId: tx.billId },
            UpdateExpression: 'SET patientId = :anon, lastUpdated = :now',
            ExpressionAttributeValues: { ':anon': 'ANONYMIZED_GDPR', ':now': new Date().toISOString() }
        }));
    }
    safeLog(`[GDPR] Anonymized ${(txScan.Items || []).length} transactions for patient ${userId}`);

});
await workflow.stage('analytics-dlq', async () => {

    const regionalS3 = getRegionalS3Client(region);
    const isEU = region.toUpperCase() === 'EU';
    const dlqBucket = setting("DLQ_BUCKET");
    const dlqBucketName = isEU ? `${dlqBucket}-eu` : dlqBucket;
    const hashedPatientId = createHash('sha256')
        .update(userId + requiredEnv('HIPAA_SALT')).digest('hex');
    await eraseSubjectDlqVersions(regionalS3, dlqBucketName, 'failed/', [userId, hashedPatientId], config);
    await eraseSubjectDlqVersions(regionalS3, dlqBucketName, 'failed-inserts/', [userId, hashedPatientId], config);

});
await workflow.stage('biometrics', async () => {

    const regionalS3 = getRegionalS3Client(region);
    const baseBucket = CONFIG.BUCKET_NAME;
    const isEU = region.toUpperCase() === 'EU';
    const bucketName = (isEU && !baseBucket.endsWith('-eu')) ? `${baseBucket}-eu` : baseBucket;
    await eraseS3Versions(regionalS3, bucketName, `patient/${userId}/`, config);

});
await workflow.stage('ehr-objects', async () => {
    const storage = getRegionalS3Client(region);
    const bucket = setting(region === 'EU' ? 'S3_BUCKET_UPLOADS_EU' : 'S3_BUCKET_UPLOADS');
    await eraseS3Versions(storage, bucket, `ehr/${userId}/`, config);
});
        await workflow.stage('completion-audit', async () => {
            await writeAuditLog(userId, userId, 'ERASURE_DATA_STAGES_COMPLETE', 'Approved erasure stages complete; retained records remain subject to the reviewed retention policy', { region, requirePersistence: true });
        });
        await workflow.stage('identity', async () => {
            const pool = setting(region === 'EU' ? 'COGNITO_USER_POOL_ID_EU' : 'COGNITO_USER_POOL_ID_US');
            try {
                await getRegionalCognitoClient(region).send(new AdminDeleteUserCommand({ UserPoolId: pool, Username: userId }));
            } catch (error: any) {
                if (error.name !== 'UserNotFoundException') throw error;
            }
        });
        await workflow.stage('profile', async () => {
            await rawDb.send(new UpdateCommand({ TableName: CONFIG.DYNAMO_TABLE, Key: { patientId: userId },
                UpdateExpression: 'SET #s = :status, #n = :name, email = :null, avatar = :null, phone = :null, address = :null, dob = :null, #resource = :empty, preferences = :empty, fcmToken = :null, isIdentityVerified = :false',
                ConditionExpression: 'erasureOwner = :owner', ExpressionAttributeNames: { '#s': 'status', '#n': 'name', '#resource': 'resource' },
                ExpressionAttributeValues: { ':status': 'ERASED_WITH_RETENTION', ':name': 'REMOVED', ':null': null, ':empty': {}, ':false': false, ':owner': owner } }));
        });
        await persist({ ...workflow.progress, state: 'COMPLETED' });
        return res.json({ status: 'ERASED_WITH_RETENTION', requestId });
    } catch {
        return res.status(503).json({ status: 'RETRY_REQUIRED', requestId, code: 'ERASURE_INCOMPLETE' });
    } finally {
        await rawDb.send(new UpdateCommand({ TableName: CONFIG.DYNAMO_TABLE, Key: { patientId: userId },
            UpdateExpression: 'REMOVE erasureOwner, erasureLeaseUntil', ConditionExpression: 'erasureOwner = :owner',
            ExpressionAttributeValues: { ':owner': owner } })).catch(() => {});
    }
});

const erasureReviewSchema = z.object({
    requestId: z.string().uuid(),
    decision: z.enum(['APPROVED', 'REFUSED']), policyVersion: z.string().min(1),
    reasonCode: z.string().regex(/^[A-Z_]+$/),
    retainedCategories: z.array(z.enum(['medical', 'financial', 'audit', 'consent'])),
}).strict();

export const reviewErasure = catchAsync(async (req: Request, res: Response) => {
    const identity = (req as any).user;
    if (identity?.isAdmin !== true) return res.status(403).json({ error: 'Administrative review required' });
    const body = erasureReviewSchema.safeParse(req.body);
    if (!body.success || !req.params.patientId) return res.status(400).json({ error: 'Invalid erasure review' });
    const config = getPrivacySettings();
    if (body.data.policyVersion !== config.policyVersion) return res.status(409).json({ error: 'Retention policy version mismatch' });
    if (body.data.decision === 'APPROVED' && ['medical', 'financial', 'audit', 'consent'].some(category => !body.data.retainedCategories.includes(category as any))) {
        return res.status(400).json({ error: 'This workflow retains medical, financial, audit and consent records; review must account for every category' });
    }
    const approval = { ...body.data, reviewedBy: identity.id, reviewedAt: new Date().toISOString() };
    const db = getRegionalClient(identity.region);
    try {
    await db.send(new UpdateCommand({ TableName: CONFIG.DYNAMO_TABLE, Key: { patientId: req.params.patientId },
        UpdateExpression: 'SET erasureApproval = :approval, erasureReviews = list_append(if_not_exists(erasureReviews, :empty), :review)',
        ConditionExpression: 'erasure.requestId = :request AND attribute_not_exists(erasureOwner) AND (attribute_not_exists(legalHold) OR legalHold = :false)',
        ExpressionAttributeValues: { ':approval': approval, ':empty': [], ':review': [approval], ':request': body.data.requestId, ':false': false },
    }));
    } catch (error: any) {
        if (error.name === 'ConditionalCheckFailedException') return res.status(409).json({ error: 'Erasure request changed, is active, or is subject to a legal hold' });
        throw error;
    }
    return res.json({ status: 'REVIEW_RECORDED', decision: body.data.decision });
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
        TableName: setting("DYNAMO_TABLE_DOCTORS"),
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
            TableName: setting("DYNAMO_TABLE_DOCTORS"),
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
            TableName: setting("DYNAMO_TABLE_DOCTORS"),
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
            TableName: setting("TABLE_APPOINTMENTS"),
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
    } catch { return res.status(503).json({ code: 'PHI_DECRYPTION_UNAVAILABLE', error: 'Protected data is temporarily unavailable.' }); }

    response.Item.avatar = await signAvatarUrl(response.Item.avatar, region);

    await writeAuditLog(requesterId, requestedId, "READ_PATIENT_BY_ID", "Authorized medical record accessed", { region, role: isDoctor ? 'doctor' : 'patient' });
    res.json(response.Item);
});

/**
 * 9. EXPORT PATIENT DATA (GDPR Right to Data Portability)
 */
export const exportPatientData = catchAsync(async (req: Request, res: Response) => { try {
    const identity = (req as any).user;
    if (!identity?.id || !identity.region) return res.status(401).json({ error: 'Unauthorized' });
    const config = getPrivacySettings();
    const region = identity.region === 'EU' || identity.region === config.euRegion ? 'EU' : identity.region === 'US' || identity.region === config.usRegion ? 'US' : null;
    if (!region) return res.status(400).json({ error: 'Unsupported authenticated region' });
    const dynamicDb = completePrivacyClient(getRegionalClient(region), config);
    const userId = (req as any).user?.id;
    if (!userId)
        return res.status(401).json({ error: "Unauthorized" });
    // Fetch patient's complete profile
    const patientResponse = await dynamicDb.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { patientId: userId }
    }));
    if (!patientResponse.Item)
        return res.status(404).json({ error: "Patient not found" });
    const patientData = patientResponse.Item;
    // 🟢 HIPAA: Decrypt PHI fields before export
    try {
        const decrypted = await decryptPHI({ name: patientData.name, dob: patientData.dob, phone: patientData.phone, email: patientData.email }, region);
        if (decrypted.name)
            patientData.name = decrypted.name;
        if (decrypted.dob)
            patientData.dob = decrypted.dob;
        if (decrypted.phone)
            patientData.phone = decrypted.phone;
        if (decrypted.email)
            patientData.email = decrypted.email;
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    // Fetch patient's appointments
    const appointmentsResponse = await dynamicDb.send(new ScanCommand({
        TableName: setting("TABLE_APPOINTMENTS"),
        FilterExpression: "patientId = :pid",
        ExpressionAttributeValues: { ":pid": userId }
    }));
    const appointments = appointmentsResponse.Items || [];
    // Fetch patient's vitals
    const vitalsResponse = await dynamicDb.send(new ScanCommand({
        TableName: setting("DYNAMO_TABLE_VITALS"),
        FilterExpression: "patientId = :pid",
        ExpressionAttributeValues: { ":pid": userId }
    }));
    const vitals = vitalsResponse.Items || [];
    // GDPR Art. 20: Export ALL personal data across all tables
    let allergies: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_ALLERGIES"), KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        allergies = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let immunizations: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_IMMUNIZATIONS"), KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        immunizations = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let carePlans: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_CARE_PLANS"), KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        carePlans = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let prescriptions: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: 'mediconnect-prescriptions', IndexName: 'PatientIndex', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        prescriptions = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let labOrders: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_LAB_ORDERS"), IndexName: 'PatientIndex', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        labOrders = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let referrals: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_REFERRALS"), IndexName: 'PatientIndex', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        referrals = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let consentLedger: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: TABLE_NAMES.consentLedger, KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        consentLedger = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let transactions: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: setting("TABLE_TRANSACTIONS"), FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        transactions = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let reconciliations: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_MED_RECON"), IndexName: 'PatientIndex', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        reconciliations = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let chatHistory: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: TABLE_NAMES.chatHistory, FilterExpression: 'senderId = :uid OR recipientId = :uid', ExpressionAttributeValues: { ':uid': userId } }));
        chatHistory = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let sdohAssessments: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_SDOH"), IndexName: 'patientId-index', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        sdohAssessments = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let healthRecords: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: TABLE_NAMES.ehr, KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        healthRecords = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let eligibilityChecks: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_ELIGIBILITY"), IndexName: 'patientId-index', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        eligibilityChecks = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let priorAuths: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_PRIOR_AUTH"), IndexName: 'patientId-index', KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        priorAuths = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let emergencyAccessLogs: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: setting("TABLE_EMERGENCY_ACCESS"), FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        emergencyAccessLogs = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let graphData: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_GRAPH"), KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `PATIENT#${userId}` } }));
        graphData = r.Items || [];
        // Decrypt PHI fields in graph-data (doctorName, patientName) for GDPR Art. 20 portability
        for (const g of graphData) {
            try {
                if (g.doctorName) {
                    const decrypted = await decryptPHI({ name: g.doctorName }, region);
                    if (decrypted.name)
                        g.doctorName = decrypted.name;
                }
                if (g.patientName) {
                    const decrypted = await decryptPHI({ name: g.patientName }, region);
                    if (decrypted.name)
                        g.patientName = decrypted.name;
                }
            }
            catch {
                throw new Error("PRIVACY_EXPORT_INCOMPLETE");
            }
        }
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let videoSessions: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: setting("TABLE_SESSIONS"), FilterExpression: 'contains(participantIds, :uid) OR patientId = :uid', ExpressionAttributeValues: { ':uid': userId } }));
        videoSessions = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let bluebuttonConnections: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: setting("TABLE_BB_CONNECTIONS"), KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        bluebuttonConnections = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let reminders: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: setting("TABLE_REMINDERS"), FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        reminders = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let hl7Messages: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: TABLE_NAMES.hl7Messages, FilterExpression: 'contains(#raw, :uid)', ExpressionAttributeNames: { '#raw': 'raw' }, ExpressionAttributeValues: { ':uid': userId } }));
        hl7Messages = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let mpiLinks: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: setting("TABLE_MPI"), FilterExpression: 'sourcePatientId = :pid OR targetPatientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        mpiLinks = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let ecrReports: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: setting("TABLE_ECR"), FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        ecrReports = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let elrReports: any[] = [];
    try {
        const r = await dynamicDb.send(new ScanCommand({ TableName: setting("TABLE_ELR"), FilterExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        elrReports = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    let dicomStudies: any[] = [];
    try {
        const r = await dynamicDb.send(new QueryCommand({ TableName: TABLE_NAMES.dicomStudies, KeyConditionExpression: 'patientId = :pid', ExpressionAttributeValues: { ':pid': userId } }));
        dicomStudies = r.Items || [];
    }
    catch {
        throw new Error("PRIVACY_EXPORT_INCOMPLETE");
    }
    // Generate presigned S3 URLs for downloadable files (GDPR Art. 20 — actual data, not just metadata)
    const regionalS3Export = getRegionalS3Client(region);
    const isEUExport = region.toUpperCase() === 'EU';
    // EHR document download URLs
    for (const hr of healthRecords) {
        try {
            if (hr.s3Key || hr.recordId) {
                const ehrBucket = isEUExport
                    ? (setting("EHR_BUCKET_EU"))
                    : (setting("EHR_BUCKET_US"));
                const key = hr.s3Key || `ehr/${userId}/${hr.recordId}`;
                const url = await getSignedUrl(regionalS3Export, new GetObjectCommand({ Bucket: ehrBucket, Key: key }), { expiresIn: 3600 });
                hr.downloadUrl = url;
            }
        }
        catch {
            throw new Error("PRIVACY_EXPORT_INCOMPLETE");
        }
    }
    // DICOM study download URLs
    for (const ds of dicomStudies) {
        try {
            if (ds.s3Key || ds.studyInstanceUID) {
                const dicomBucket = isEUExport
                    ? (setting("BUCKET_NAME_DICOM_EU"))
                    : (setting("BUCKET_NAME_DICOM"));
                const key = ds.s3Key || `dicom/${userId}/${ds.studyInstanceUID}`;
                const url = await getSignedUrl(regionalS3Export, new GetObjectCommand({ Bucket: dicomBucket, Key: key }), { expiresIn: 3600 });
                ds.downloadUrl = url;
            }
        }
        catch {
            throw new Error("PRIVACY_EXPORT_INCOMPLETE");
        }
    }
    // Prescription PDF download URLs
    for (const rx of prescriptions) {
        try {
            if (rx.prescriptionId) {
                const rxBucket = isEUExport
                    ? (setting("S3_BUCKET_PRESCRIPTIONS_EU"))
                    : (setting("S3_BUCKET_PRESCRIPTIONS_US"));
                const url = await getSignedUrl(regionalS3Export, new GetObjectCommand({ Bucket: rxBucket, Key: `prescriptions/${rx.prescriptionId}.pdf` }), { expiresIn: 3600 });
                rx.downloadUrl = url;
            }
        }
        catch {
            throw new Error("PRIVACY_EXPORT_INCOMPLETE");
        }
    }
    // Query BigQuery for symptom analysis and vitals data (GDPR Art. 20 — patient-generated content)
    let symptomLogs: any[] = [];
    let bigqueryVitals: any[] = [];
    try {
        const bqAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
        const bqClient = await bqAuth.getClient();
        const bqToken = (await bqClient.getAccessToken()).token;
        const bqProject = await bqAuth.getProjectId();
        if (!bqToken || !bqProject) throw new Error('PRIVACY_ANALYTICS_CREDENTIALS_UNAVAILABLE');
        const config = getPrivacyAnalyticsSettings(region);
        const hashedId = createHash('sha256').update(userId + requiredEnv('HIPAA_SALT')).digest('hex');
        const base = { ...config, projectId: bqProject, token: bqToken, hashedId, maxPages: getPrivacySettings().maxPages };
        symptomLogs = await completeAnalyticsExport({ ...base, jobId: `export_symptoms_${randomUUID()}`,
            query: `SELECT * FROM \`${bqProject}.${config.aiDataset}.symptom_logs\` WHERE user_id = @hashedId` });
        bigqueryVitals = await completeAnalyticsExport({ ...base, jobId: `export_vitals_${randomUUID()}`,
            query: `SELECT * FROM \`${bqProject}.${config.iotDataset}.${config.iotTable}\` WHERE JSON_EXTRACT_SCALAR(data, '$.patientId') = @hashedId` });
    } catch {
        throw new Error('PRIVACY_EXPORT_INCOMPLETE');
    }

    // Build FHIR Bundle for data portability
    const exportBundle = createPortabilityBundle({ patient: patientData, appointments, vitals, allergies, immunizations, carePlans, prescriptions, labOrders, referrals, consentLedger, transactions, reconciliations, chatHistory, sdohAssessments, healthRecords, eligibilityChecks, priorAuths, emergencyAccessLogs, graphData, videoSessions, bluebuttonConnections, reminders, hl7Messages, mpiLinks, ecrReports, elrReports, dicomStudies, symptomLogs, bigqueryVitals });
await writeAuditLog(userId, userId, "GDPR_DATA_EXPORT", "Patient exported personal data", { region, ipAddress: req.ip, requirePersistence: true });
    // SOC 2 P1: Mark exported data with integrity hash
    const exportHash = createHash('sha256').update(JSON.stringify(exportBundle)).digest('hex');
    res.setHeader('X-Export-Integrity', exportHash);
    res.setHeader('Cache-Control', 'no-store');
res.setHeader('Content-Type', 'application/fhir+json');
    res.json(exportBundle);
} catch { return res.status(503).json({ code: 'DATA_EXPORT_INCOMPLETE', error: 'The complete data export is unavailable. Please retry later.' }); } });
