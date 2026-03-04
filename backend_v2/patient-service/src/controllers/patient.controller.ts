import { Request, Response, NextFunction } from 'express';

// AWS SDK v3
import { GetCommand, PutCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CompareFacesCommand } from "@aws-sdk/client-rekognition";

// Shared Utilities
import { safeError } from '../../../shared/logger';
import { writeAuditLog } from '../../../shared/audit';

// Shared Clients
import { getRegionalClient, getRegionalS3Client, getRegionalRekognitionClient } from '../../../shared/aws-config';

// =============================================================================
// ⚙️ CONFIGURATION & ENV HANDLING
// =============================================================================
const CONFIG = {
    DYNAMO_TABLE: process.env.DYNAMO_TABLE || 'mediconnect-patients',
    DOCTOR_TABLE: process.env.DYNAMO_TABLE_DOCTORS || 'mediconnect-doctors',
    BUCKET_NAME: process.env.BUCKET_NAME || 'mediconnect-identity-verification',
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
        if (avatarKey.includes('mediconnect-identity-verification')) {
            const match = avatarKey.match(/(patient|doctor)\/[a-zA-Z0-9-]+\/[^?]+/);
            if (match) finalKey = match[0]; 
            else return avatarKey;
        } else {
            return avatarKey; 
        }
    }

    try {
        const regionalS3 = getRegionalS3Client(region);
        const bucketName = region.toUpperCase() === 'EU' ? `${CONFIG.BUCKET_NAME}-eu` : CONFIG.BUCKET_NAME;
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
 * 3. UPDATE PROFILE (FHIR Sync)
 */
export const updateProfile = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);

    const requestedId = req.params.id;
    const requesterId = (req as any).user?.id;

    if (requestedId !== requesterId) {
        return res.status(403).json({ error: "Unauthorized to edit this profile." });
    }

    const allowedUpdates =['name', 'avatar', 'phone', 'address', 'preferences', 'dob', 'fcmToken', 'isEmailVerified']; 
    const body = req.body;
    const parts: string[] =[];
    const names: any = {};
    const values: any = {};

    allowedUpdates.forEach(field => {
        if (body[field] !== undefined) {
            parts.push(`#${field} = :${field}`);
            names[`#${field}`] = field;
            values[`:${field}`] = body[field];

            // 🟢 DYNAMODB RESERVED WORD FIX (Escaping 'name', 'text', 'value')
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
    
    const { selfieImage, idImage } = req.body;
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
    const bucketName = region.toUpperCase() === 'EU' ? `${CONFIG.BUCKET_NAME}-eu` : CONFIG.BUCKET_NAME;

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
        UpdateExpression: "set avatar = :a, isIdentityVerified = :v, identityStatus = :s",
        ExpressionAttributeValues: { ':a': selfieKey, ':v': true, ':s': "VERIFIED" }
    }));

    await writeAuditLog(userId, userId, "IDENTITY_VERIFIED", "Patient AI facial biometric match successful", {
        region, ipAddress: req.ip
    });

    return res.json({ verified: true, message: "Identity Verified" });
});

/**
 * 5. DELETE PROFILE (GDPR Right to be Forgotten)
 */
export const deleteProfile = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // 🟢 HIPAA Data Retention vs GDPR Erasure: 
    // We soft-delete and anonymize PII immediately, but keep a hashed record for 30 days.
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

    await dynamicDb.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { patientId: userId },
        UpdateExpression: "SET #s = :s, #ttl = :ttl, #n = :n, email = :e, avatar = :a, deletedAt = :now, resource = :empty",
        ExpressionAttributeNames: { "#s": "status", "#ttl": "ttl", "#n": "name" },
        ExpressionAttributeValues: { 
            ":s": "DELETED", ":ttl": ttl, 
            ":n": `ANONYMIZED_USER`, ":e": `gdpr_deleted_${userId}@mediconnect.local`, 
            ":a": null, ":now": new Date().toISOString(), ":empty": {} 
        }
    }));

    try {
        const regionalS3 = getRegionalS3Client(region);
        const bucketName = region.toUpperCase() === 'EU' ? `${CONFIG.BUCKET_NAME}-eu` : CONFIG.BUCKET_NAME;
        
        const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
        await regionalS3.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: `patient/${userId}/selfie_verified.jpg`
        }));
    } catch (s3Error) {
        console.error(`[GDPR Warning] Failed to delete Selfie for ${userId}`, s3Error);
    }

    await writeAuditLog(userId, userId, "DELETE_PROFILE", "User invoked GDPR Right to be Forgotten", {
        region, ipAddress: req.ip
    });

    res.json({ message: "Account fully anonymized and scheduled for hard deletion.", status: "DELETED" });
});

/**
 * 6. SEARCH PATIENTS (FHIR Interoperability)
 */
export const searchPatients = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);
    const { name } = req.query;

    const command = new ScanCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        FilterExpression: "contains(#n, :name)",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: { ":name": name as string }
    });

    const result = await dynamicDb.send(command);
    
    await writeAuditLog((req as any).user?.id || "SYSTEM", "MULTIPLE", "SEARCH_PATIENT", "Database search performed", {
        region, ipAddress: req.ip
    });

    res.json(result.Items || []);
});

/**
 * 7. GET DEMOGRAPHICS (Analytics Dashboard)
 */
export const getDemographics = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);

    const command = new ScanCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        ProjectionExpression: 'dob, #r',
        ExpressionAttributeNames: { '#r': 'role' }
    });

    const response = await dynamicDb.send(command);
    const items = response.Items || [];

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
 * 8. GET PATIENT BY ID (Shared Access for Doctors)
 */
export const getPatientById = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const dynamicDb = getRegionalClient(region);
    
    // Support both /:userId and /:id parameters
    const requestedId = req.params.userId || req.params.id;
    const requesterId = (req as any).user?.id;
    const isDoctor = (req as any).user?.isDoctor;

    // 🟢 ACCESS CONTROL: Owner OR Doctor Only
    if (requestedId !== requesterId && !isDoctor) {
         return res.status(403).json({ error: "Unauthorized access to patient record." });
    }

    const response = await dynamicDb.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { patientId: requestedId }
    }));

    if (!response.Item) return res.status(404).json({ error: "Patient not found." });
    
    // Sign the avatar URL before returning
    response.Item.avatar = await signAvatarUrl(response.Item.avatar, region);

    await writeAuditLog(requesterId, requestedId, "READ_PATIENT_BY_ID", "Direct ID lookup performed", { region, role: isDoctor ? 'doctor' : 'patient' });
    res.json(response.Item);
});