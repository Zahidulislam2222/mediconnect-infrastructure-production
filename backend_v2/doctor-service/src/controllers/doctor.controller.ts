// C:\Dev\mediconnect-project\mediconnect-infrastructure-develop\backend_v2\doctor-service\src\controllers\doctor.controller.ts

import { NextFunction, Request, Response } from 'express';
import { GetObjectCommand, PutObjectCommand, PutObjectTaggingCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { CompareFacesCommand } from "@aws-sdk/client-rekognition";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TextractClient, AnalyzeDocumentCommand } from "@aws-sdk/client-textract";
import { PublishCommand } from "@aws-sdk/client-sns";
import { google } from 'googleapis';
import { PutCommand, GetCommand, UpdateCommand, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getRegionalClient, getRegionalS3Client, getRegionalRekognitionClient, getRegionalSNSClient, getRegionalSESClient, getRegionalCognitoClient } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';
import jwt from 'jsonwebtoken';
import { GoogleAuth } from "google-auth-library";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import { AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";

// 🟢 FIX 1: Use Getter to prevent loading race condition
const CONFIG = {
    get DYNAMO_TABLE() { return process.env.DYNAMO_TABLE || 'mediconnect-doctors'; },
};

// Helper to handle async errors
const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

export const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

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
        const baseBucket = process.env.BUCKET_NAME || 'mediconnect-doctor-data';
const isEU = region.toUpperCase() === 'EU';
const bucketName = (isEU && !baseBucket.endsWith('-eu')) ? `${baseBucket}-eu` : baseBucket;
            
        const command = new GetObjectCommand({ Bucket: bucketName, Key: finalKey });
        return await getSignedUrl(regionalS3, command, { expiresIn: 900 });
    } catch (e) {
        console.error(`[Avatar Sign Error]`, e);
        return null;
    }
}

// =============================================================================
// 1. PROFILE MANAGEMENT
// =============================================================================

export const createDoctor = catchAsync(async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req) as string);
    
    const authUser = (req as any).user;
    if (!authUser || !authUser.sub) {
        return res.status(401).json({ error: "Unauthorized: You must be logged in to create a profile." });
    }
    
    const finalId = authUser.sub; 
    const { email, name, specialization, licenseNumber, role, consentDetails } = req.body;

    if (!email) return res.status(400).json({ error: 'Missing email' });

    if (!consentDetails || consentDetails.agreedToTerms !== true) {
        return res.status(400).json({ error: "Legal compliance failure: Explicit consent to Terms and Privacy Policy is required." });
    }

    const verifiedConsent = {
        ...consentDetails,
        backendVerifiedIp: req.ip,
        recordedAt: new Date().toISOString()
    };

    const fhirResource = {
        resourceType: "Practitioner",
        id: finalId,
        active: true,
        name: [{ text: name }],
        qualification:[{ code: { text: specialization || 'General Practice' } }]
    };

    const item = {
        doctorId: finalId, 
        email, 
        name,
        specialization: specialization || 'General Practice',
        licenseNumber: licenseNumber || 'PENDING_VERIFICATION',       
        verificationStatus: 'UNVERIFIED',
        isEmailVerified: true,  
        isIdentityVerified: false, 
        identityStatus: 'IDLE',
        isDiplomaAutoVerified: false,
        isOfficerApproved: false,
        role: role === 'provider' ? 'doctor' : 'doctor',
        createdAt: new Date().toISOString(),
        consultationFee: 50, 
        resource: fhirResource,
        consent: verifiedConsent
    };

    try {
        await docClient.send(new PutCommand({
            TableName: CONFIG.DYNAMO_TABLE, 
            Item: item,
            ConditionExpression: "attribute_not_exists(doctorId)"
        }));
    } catch (e: any) {
        if (e.name === 'ConditionalCheckFailedException') return res.status(409).json({ error: 'Doctor already registered' });
        throw e;
    }

    await writeAuditLog(finalId, finalId, "CREATE_DOCTOR", "Doctor profile created and explicit GDPR/HIPAA consent captured", { 
        region: extractRegion(req), 
        ipAddress: req.ip,
        policyVersion: consentDetails.policyVersion || "v1.0"
    });
    
    logDoctorOnboarding(finalId, "SIGNUP", "UNVERIFIED", extractRegion(req)).catch(console.error);

    // 🟢 ADMIN ALERT FIX: Notify Admin immediately when a doctor registers
    try {
        const regionalSns = getRegionalSNSClient(extractRegion(req));
        const topicArn = extractRegion(req).toUpperCase() === 'EU' ? process.env.SNS_TOPIC_ARN_EU : process.env.SNS_TOPIC_ARN_US;
        
        await regionalSns.send(new PublishCommand({
            TopicArn: topicArn,
            Subject: "🩺 NEW DOCTOR REGISTRATION",
            Message: `A new doctor (${email}) has registered on the platform.\nName: ${name}\nSpecialization: ${specialization || 'N/A'}\n\nThey have consented to terms and are currently UNVERIFIED. Awaiting credential upload.`
        }));
    } catch (snsErr) {
        console.error("Failed to alert admin of new doctor", snsErr);
    }

    res.status(201).json({ message: "Doctor profile created", profile: item });
});

export const verifyDoctorIdentity = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req) as string;
    const authUser = (req as any).user;
    
    const { selfieImage, idImage, gender } = req.body;
    if (!authUser?.sub || !selfieImage) return res.status(400).json({ error: "Missing identity data" });

    const userId = authUser.sub;
    const docClient = getRegionalClient(region); 

    const userCheck = await docClient.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: userId }
    }));

    if (!userCheck.Item) {
        return res.status(401).json({ error: "Security Alert: Doctor account no longer exists." });
    }

    const idCardKey = `doctor/${userId}/id_card.jpg`;
    const regionalS3 = getRegionalS3Client(region);
    const regionalRek = getRegionalRekognitionClient(region);
    
    const baseBucket = process.env.BUCKET_NAME || 'mediconnect-doctor-data';
const isEU = region.toUpperCase() === 'EU';
const bucketName = (isEU && !baseBucket.endsWith('-eu')) ? `${baseBucket}-eu` : baseBucket;

    if (idImage) {
        await regionalS3.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: idCardKey,
            Body: Buffer.from(idImage, 'base64'),
            ContentType: 'image/jpeg'
        }));
    }

    const compareCmd = new CompareFacesCommand({
        SourceImage: { S3Object: { Bucket: bucketName, Name: idCardKey } },
        TargetImage: { Bytes: Buffer.from(selfieImage, 'base64') },
        SimilarityThreshold: 80
    });
    
    const aiResponse = await regionalRek.send(compareCmd);
    if (!aiResponse.FaceMatches || aiResponse.FaceMatches.length === 0) {
        return res.json({ verified: false, message: "Face does not match Medical ID card." });
    }

    const selfieKey = `doctor/${userId}/selfie_verified.jpg`;
    await regionalS3.send(new PutObjectCommand({
        Bucket: bucketName, Key: selfieKey,
        Body: Buffer.from(selfieImage, 'base64'), ContentType: 'image/jpeg'
    }));

    await docClient.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: userId },
        UpdateExpression: "set avatar = :a, isIdentityVerified = :v, identityStatus = :s, #g = :g, #res.#gen = :g",
    ExpressionAttributeNames: { 
        "#g": "gender",
        "#res": "resource",
        "#gen": "gender"
    },
    ExpressionAttributeValues: { 
        ':a': selfieKey, ':v': true, ':s': "VERIFIED", ':g': gender }
    }));

    await writeAuditLog(userId, userId, "IDENTITY_VERIFIED", "Doctor AI facial biometric match successful", {
        region, ipAddress: req.ip
    });

    return res.json({ verified: true, message: "Doctor Identity Verified" });
});

export const getDoctor = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req) as string;
    const docClient = getRegionalClient(region);
    const id = req.params.id || req.query.id;

    if (!id) return res.status(400).json({ error: 'Missing Doctor ID' });

    const result = await docClient.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: String(id) }
    }));

    if (!result.Item) return res.status(404).json({ error: 'Doctor not found' });

    const doctor = result.Item;

    doctor.avatar = await signAvatarUrl(doctor.avatar, region);

    await writeAuditLog((req as any).user?.sub || "SYSTEM", String(id), "READ_DOCTOR", "Profile viewed", { 
        region: region, 
        ipAddress: req.ip 
    });
    
    res.status(200).json(doctor);
});

export const updateDoctor = catchAsync(async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req) as string);
    const { id } = req.params;
    const updates = req.body;
    const authUser = (req as any).user;

    if (!id) return res.status(400).json({ error: 'Missing ID' });
    if (!authUser || authUser.sub !== id) return res.status(403).json({ error: "HIPAA Violation: Unauthorized." });

    if (updates.avatar && typeof updates.avatar === 'string') {
        if (!updates.avatar.includes(id)) {
            await writeAuditLog(authUser.sub, id, "SPOOF_ATTEMPT", "Attempted to link external S3 asset", { region: extractRegion(req), ipAddress: req.ip });
            return res.status(403).json({ error: "Security Violation: Cannot link to another user's avatar." });
        }
        const match = updates.avatar.match(/(patient|doctor)\/[a-zA-Z0-9-]+\/[^?]+/);
        if (match) updates.avatar = match[0];
    }

    const parts: string[] =[];
    const names: any = {};
    const values: any = {};

    const allowed =['name', 'specialization', 'bio', 'avatar', 'phone', 'address', 'preferences'];

    let requiresReverification = false;

    Object.keys(updates).forEach(key => {
        if (allowed.includes(key)) {
            // 🟢 COMPLIANCE FIX: Detect core identity changes
            if (key === 'name' || key === 'specialization') {
                requiresReverification = true;
            }
            parts.push(`#${key} = :${key}`);
            names[`#${key}`] = key;
            values[`:${key}`] = updates[key];
        }
    });

    if (parts.length === 0) return res.status(400).json({ error: "No valid fields to update" });

    if (requiresReverification) {
        parts.push("verificationStatus = :pending", "isOfficerApproved = :officer");
        values[":pending"] = "PENDING_OFFICER_APPROVAL";
        values[":officer"] = false;
    }

    names["#res"] = "resource"; 
    
    if (updates.name) {
        parts.push("#res.#nm = :fhirNameArr");
        names["#nm"] = "name";
        values[":fhirNameArr"] = [{ use: "official", text: updates.name }];
    }
    
    if (updates.specialization) {
        parts.push("#res.#qual = :fhirQualArr");
        names["#qual"] = "qualification";
        values[":fhirQualArr"] = [{ code: { text: updates.specialization } }];
    }

    parts.push("#res.#meta = :metaObj");
    names["#meta"] = "meta";
    values[":metaObj"] = { lastUpdated: new Date().toISOString() };

    parts.push("#updatedAt = :now");
    names["#updatedAt"] = "updatedAt";
    values[":now"] = new Date().toISOString();

    try {
        const response = await docClient.send(new UpdateCommand({
            TableName: CONFIG.DYNAMO_TABLE, 
            Key: { doctorId: id },
            UpdateExpression: "SET " + parts.join(", "),
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: "ALL_NEW"
        }));

        await writeAuditLog(authUser.sub, id, "UPDATE_DOCTOR", `Profile updated. Re-verification required: ${requiresReverification}`, { 
            region: extractRegion(req), 
            ipAddress: req.ip 
        });

        if (requiresReverification) {
            const regionalSns = getRegionalSNSClient(extractRegion(req));
            const topicArn = extractRegion(req).toUpperCase() === 'EU' ? process.env.SNS_TOPIC_ARN_EU : process.env.SNS_TOPIC_ARN_US;
            await regionalSns.send(new PublishCommand({
                TopicArn: topicArn,
                Subject: "⚠️ COMPLIANCE ALERT: Doctor Credentials Altered",
                Message: `Doctor ${id} updated their Core Clinical Identity (Name or Specialization).\nTheir account has been automatically suspended pending administrative officer review.\nIP: ${req.ip}`
            }));
        }
        
        res.status(200).json({ 
            message: requiresReverification ? "Profile updated. Your account is suspended pending Admin review." : "Doctor profile updated", 
            profile: response.Attributes 
        });
    } catch (dbError: any) {
        console.error("DynamoDB Update Error:", dbError.message);
        res.status(500).json({ error: "Database update failed", details: dbError.message });
    }
});

export const getDoctors = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req) as string;
    const docClient = getRegionalClient(region);
    
    const response = await docClient.send(new ScanCommand({ 
        TableName: CONFIG.DYNAMO_TABLE, 
        FilterExpression: "verificationStatus <> :unverified AND verificationStatus <> :rejected",
        ExpressionAttributeValues: {
            ":unverified": "UNVERIFIED",
            ":rejected": "REJECTED_AUTO"
        }
    }));

    const safeDoctors = await Promise.all((response.Items ||[]).map(async (doc: any) => ({
        doctorId: doc.doctorId,
        name: doc.name,
        specialization: doc.specialization,
        avatar: await signAvatarUrl(doc.avatar, region), 
        bio: doc.bio,
        consultationFee: doc.consultationFee,
        verificationStatus: doc.verificationStatus,
        schedule: doc.schedule 
    })));

    res.status(200).json({ doctors: safeDoctors });
});

// =============================================================================
// 2. SCHEDULE MANAGEMENT
// =============================================================================

export const getSchedule = catchAsync(async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req) as string);
    const { id } = req.params;

    const result = await docClient.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: id },
        ProjectionExpression: "#sch, #tz",
        ExpressionAttributeNames: { "#sch": "schedule", "#tz": "timezone" }
    }));

    if (!result.Item) return res.status(404).json({ error: 'Doctor not found' });
    res.status(200).json({ id: id, schedule: result.Item.schedule || {}, timezone: result.Item.timezone || 'UTC' });
});

export const updateSchedule = catchAsync(async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req) as string);
    const { id } = req.params;
    const { schedule, timezone } = req.body;
    const authUser = (req as any).user;

    if (!authUser || authUser.sub !== id) return res.status(403).json({ error: "Unauthorized" });
    if (!schedule || typeof schedule !== 'object') return res.status(400).json({ error: 'Invalid schedule format.' });

    try {
        await docClient.send(new UpdateCommand({
            TableName: CONFIG.DYNAMO_TABLE, 
            Key: { doctorId: id },
            UpdateExpression: "SET #sch = :s, #tz = :t",
            ExpressionAttributeNames: { "#sch": "schedule", "#tz": "timezone" },
            ExpressionAttributeValues: { ":s": schedule, ":t": timezone || 'UTC' },
            ReturnValues: "UPDATED_NEW"
        }));

        res.status(200).json({ message: 'Schedule updated successfully', schedule });
    } catch (dbError: any) {
        console.error("Schedule Update Error:", dbError.message);
        res.status(500).json({ error: "Schedule update failed", details: dbError.message });
    }
});

// =============================================================================
// 3. VERIFICATION (AI TEXTRACT -> DYNAMODB)
// =============================================================================

export const verifyDiploma = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req) as string;
    const docClient = getRegionalClient(region);
    
    // 🟢 KEYLESS FIX: AWS WIF automatically provides credentials to this client
    const regionalTextract = new TextractClient({ 
        region: region.toUpperCase() === 'EU' ? 'eu-central-1' : 'us-east-1'
    });

    const { id } = req.params;
    const { s3Key, bucketName, expectedName } = req.body;
    const authUser = (req as any).user;

    if (!authUser || authUser.sub !== id) return res.status(403).json({ error: "Unauthorized" });

    const userCheck = await docClient.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: id }
    }));

    if (!userCheck.Item) {
         return res.status(401).json({ error: "Security Alert: Doctor account no longer exists." });
    }
    if (!s3Key || !bucketName) return res.status(400).json({ error: "Missing file data" });

    const command = new AnalyzeDocumentCommand({
        Document: { S3Object: { Bucket: bucketName, Name: s3Key } },
        FeatureTypes:["QUERIES"],
        QueriesConfig: {
            Queries:[
                { Text: "What is the full name of the graduate or person on this document?", Alias: "GRADUATE_NAME" },
                { Text: "What is the name of the medical school or institution?", Alias: "INSTITUTION" },
                { Text: "What is the degree type or license number?", Alias: "DEGREE" }
            ]
        }
    });

    try {
        const response = await regionalTextract.send(command);

        const fullOcrText = response.Blocks?.filter((b: any) => b.BlockType === 'LINE').map((b: any) => b.Text).join(" ") || "";
        const nameMatched = fullOcrText.toLowerCase().includes(expectedName.toLowerCase().split(' ')[0]);

        const medicalKeywords =["Doctor", "Medicine", "Surgeon", "Medical", "Physician", "MD", "License"];
        const hasMedicalContext = medicalKeywords.some(k => fullOcrText.includes(k));

        const isLegit = nameMatched && hasMedicalContext;
        const status = isLegit ? "PENDING_OFFICER_APPROVAL" : "REJECTED_AUTO";

        await docClient.send(new UpdateCommand({
            TableName: CONFIG.DYNAMO_TABLE, 
            Key: { doctorId: id },
            UpdateExpression: "SET isDiplomaAutoVerified = :v, isOfficerApproved = :o, verificationStatus = :s, diplomaUrl = :u, aiExtractedText = :txt",
            ExpressionAttributeValues: { 
                ":v": isLegit, 
                ":o": false,
                ":s": status, 
                ":u": `s3://${bucketName}/${s3Key}`, 
                ":txt": fullOcrText.substring(0, 500) 
            }
        }));

        if (isLegit) {
            const maskedId = `${String(id).substring(0, 4)}****`;
            
            // 🟢 KEYLESS FIX: Use Shared Factory for SNS
            const regionalSns = getRegionalSNSClient(region);
            
            logDoctorOnboarding(id, "AI_VERIFICATION", "PENDING_OFFICER_APPROVAL", region).catch(console.error);
            
            const topicArn = region.toUpperCase() === 'EU' ? process.env.SNS_TOPIC_ARN_EU : process.env.SNS_TOPIC_ARN_US;
            
            await regionalSns.send(new PublishCommand({
                TopicArn: topicArn,
                Message: `STRICT VERIFICATION: A Doctor (ID: ${maskedId}) uploaded a diploma. AI Confidence: HIGH. Awaiting human officer approval.`,
                Subject: "Doctor Credential Alert"
            }));
        }

        return res.json({ verified: isLegit, status, message: isLegit ? "AI Verification Successful." : "AI could not match your name." });

    } catch (e: any) {
        console.error("Textract Error:", e);
        return res.status(500).json({ error: "AI Processing Failed" });
    }
});

// =============================================================================
// 4. GOOGLE CALENDAR
// =============================================================================

export const getCalendarStatus = catchAsync(async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req) as string);
    const { id } = req.params;
    const result = await docClient.send(new GetCommand({ TableName: CONFIG.DYNAMO_TABLE, Key: { doctorId: id }, ProjectionExpression: "googleRefreshToken" })); // ✅ FIXED
    if (!result.Item) return res.status(404).json({ error: 'Doctor not found' });
    res.json({ connected: !!result.Item.googleRefreshToken });
});

export const connectGoogleCalendar = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.query; 

    const doctorBase = process.env.API_PUBLIC_URL || "http://localhost:8082";
    const redirectUri = `${doctorBase.replace(/\/$/, '')}/doctors/auth/google/callback`;

    const secret = process.env.GOOGLE_CLIENT_SECRET || 'fallback_secret';
    const secureState = jwt.sign({ doctorId: id }, secret, { expiresIn: '15m' });

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri // ✅ Uses the dynamic URL
    );
    
    const url = oauth2Client.generateAuthUrl({ 
        access_type: 'offline', 
        scope: ['https://www.googleapis.com/auth/calendar'], 
        state: secureState
    });

    res.json({ url });
});

export const googleCallback = catchAsync(async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req) as string);
    const { code, state } = req.query; 

    if (!code || !state) return res.status(400).json({ error: "Invalid callback data" });

    // 🟢 1. Re-construct the EXACT same dynamic URI (Google requires a perfect match)
    const doctorBase = process.env.API_PUBLIC_URL || "http://localhost:8082";
    const redirectUri = `${doctorBase.replace(/\/$/, '')}/doctors/auth/google/callback`;

    let targetDoctorId = "";
    try {
        const secret = process.env.GOOGLE_CLIENT_SECRET || 'fallback_secret';
        const decoded = jwt.verify(state as string, secret) as any;
        targetDoctorId = decoded.doctorId;
    } catch (err) { return res.status(403).json({ error: "Security Violation: Invalid state." }); }

    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri // ✅ Uses the dynamic URL
    );
    
    const { tokens } = await oauth2Client.getToken(code as string);

    if (tokens.refresh_token) {
        await docClient.send(new UpdateCommand({
            TableName: CONFIG.DYNAMO_TABLE,
            Key: { doctorId: targetDoctorId },
            UpdateExpression: "SET googleRefreshToken = :token", ExpressionAttributeValues: { ":token": tokens.refresh_token }
        }));
    }
    const origins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:8080'];
    const redirectBase = origins[0].trim(); 
    
    res.redirect(`${redirectBase}/settings?calendar=connected`);
});

export const disconnectGoogleCalendar = catchAsync(async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req) as string);
    const { id } = req.params;
    const authUser = (req as any).user;

    if (!authUser || authUser.sub !== id) return res.status(403).json({ error: "Unauthorized" });

    await docClient.send(new UpdateCommand({ TableName: CONFIG.DYNAMO_TABLE, Key: { doctorId: id }, UpdateExpression: "REMOVE googleRefreshToken" })); // ✅ FIXED
    res.json({ connected: false, message: "Calendar disconnected" });
});

// =============================================================================
// 5. GDPR RIGHT TO ERASURE & UTILS
// =============================================================================

export const requestDoctorClosure = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);

    const userCheck = await docClient.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { doctorId: id }
    }));

    if (!userCheck.Item) return res.status(404).json({ error: "Doctor not found" });

    await docClient.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { doctorId: id },
        UpdateExpression: "SET closureStatus = :p, verificationStatus = :s",
        ExpressionAttributeValues: { ":p": "PENDING_CLOSURE", ":s": "SUSPENDED" }
    }));

    try {
        const regionalSns = getRegionalSNSClient(region);
        const topicArn = region.toUpperCase() === 'EU' ? process.env.SNS_TOPIC_ARN_EU : process.env.SNS_TOPIC_ARN_US;

        await regionalSns.send(new PublishCommand({
            TopicArn: topicArn,
            Subject: "💼 ACTION REQUIRED: Doctor Requesting Closure",
            Message: `HIGH PRIORITY: Doctor ${id} (${userCheck.Item.email}) has requested to close their account. \n\nPlease review pending clinical appointments and legal obligations before finalizing the deletion via the Admin Panel. \n\nRegion: ${region}\nIP Address: ${req.ip}`
        }));
    } catch (e) {
        console.error("SNS Admin alert failed", e);
    }

    res.json({ message: "Closure request sent to administration for review." });
});

export const deleteDoctor = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const authUser = (req as any).user;

    const userCheck = await docClient.send(new GetCommand({
        TableName: CONFIG.DYNAMO_TABLE,
        Key: { doctorId: id }
    }));

    if (!userCheck.Item) return res.status(404).json({ error: "Doctor not found" });

    try {
        const apptQuery = await docClient.send(new QueryCommand({
            TableName: process.env.TABLE_APPOINTMENTS || "mediconnect-appointments",
            IndexName: "DoctorIndex",
            KeyConditionExpression: "doctorId = :did",
            ExpressionAttributeValues: { ":did": id }
        }));

        const doctorAppointments = apptQuery.Items || [];
        for (const apt of doctorAppointments) {
            // Anonymize the FHIR resource participant name
            let fhirResource = apt.resource || {};
            if (Array.isArray(fhirResource.participant)) {
                fhirResource.participant.forEach((p: any) => {
                    if (p.actor?.reference === `Practitioner/${id}`) {
                        p.actor.display = "ANONYMIZED_PRACTITIONER";
                    }
                });
            }

            await docClient.send(new UpdateCommand({
                TableName: process.env.TABLE_APPOINTMENTS || "mediconnect-appointments",
                Key: { appointmentId: apt.appointmentId },
                UpdateExpression: "SET doctorName = :anon, doctorAvatar = :null, #res = :resource, lastUpdated = :now",
                ExpressionAttributeNames: { "#res": "resource" },
                ExpressionAttributeValues: { 
                    ":anon": "ANONYMIZED_PRACTITIONER", 
                    ":null": null,
                    ":resource": fhirResource, 
                    ":now": new Date().toISOString()
                }
            }));
            const doctorAppointments = apptQuery.Items ||[];
        for (const apt of doctorAppointments) {
            // Anonymize the FHIR resource participant name
            let fhirResource = apt.resource || {};
            if (Array.isArray(fhirResource.participant)) {
                fhirResource.participant.forEach((p: any) => {
                    if (p.actor?.reference === `Practitioner/${id}`) {
                        p.actor.display = "ANONYMIZED_PRACTITIONER";
                    }
                });
            }

            await docClient.send(new UpdateCommand({
                TableName: process.env.TABLE_APPOINTMENTS || "mediconnect-appointments",
                Key: { appointmentId: apt.appointmentId },
                UpdateExpression: "SET doctorName = :anon, doctorAvatar = :null, #res = :resource, lastUpdated = :now",
                ExpressionAttributeNames: { "#res": "resource" },
                ExpressionAttributeValues: { 
                    ":anon": "ANONYMIZED_PRACTITIONER", 
                    ":null": null,
                    ":resource": fhirResource, 
                    ":now": new Date().toISOString()
                }
            }));

            // 🟢 PASTE IT HERE (Inside the loop)
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
                            doctor_id: "ANONYMIZED_PRACTITIONER", 
                            patient_id: apt.patientId, 
                            status: "DOCTOR_DELETED",
                            timestamp: new Date().toISOString()
                        }}]
                    })
                });
            } catch (bqErr) { console.error("BQ Doctor Anonymization Failed", bqErr); }
            }
        }
        console.log(`[GDPR] Scrubbed Doctor Identity from ${doctorAppointments.length} appointment records.`);
    } catch (sweepErr) {
        console.error("Doctor Appointment Sweep Failed:", sweepErr);
        // We continue because we don't want to block the primary deletion if one record fails
    }

    try {
        const txQuery = await docClient.send(new QueryCommand({
            TableName: process.env.TABLE_TRANSACTIONS || "mediconnect-transactions",
            IndexName: "DoctorIndex",
            KeyConditionExpression: "doctorId = :did",
            ExpressionAttributeValues: { ":did": id }
        }));

        const transactions = txQuery.Items || [];
        for (const tx of transactions) {
            let newDesc = tx.description || "";
            // Replace the doctor's name if it exists in the description
            if (newDesc.includes("Consultation with")) {
                newDesc = "Consultation (Provider Anonymized)";
            }

            await docClient.send(new UpdateCommand({
                TableName: process.env.TABLE_TRANSACTIONS || "mediconnect-transactions",
                Key: { billId: tx.billId },
                UpdateExpression: "SET description = :desc, lastUpdated = :now",
                ExpressionAttributeValues: { 
                    ":desc": newDesc,
                    ":now": new Date().toISOString()
                }
            }));
        }
        console.log(`[GDPR] Anonymized ${transactions.length} financial transaction records.`);
    } catch (txErr) {
        console.error("Transaction Anonymization Failed:", txErr);
    }

    if (userCheck.Item.closureStatus !== "PENDING_CLOSURE") {
        await writeAuditLog(authUser.id, id, "ILLEGAL_DELETE_ATTEMPT", "Doctor tried to bypass closure review via API", { region, ipAddress: req.ip });
        return res.status(403).json({ 
            error: "Security Violation: You cannot delete an active account. You must first 'Request Account Closure' and wait for Admin review." 
        });
    }

    const regionalS3 = getRegionalS3Client(region);
    const baseBucket = process.env.BUCKET_NAME || 'mediconnect-doctor-data';
    const isEU = region.toUpperCase() === 'EU';
    const bucketName = (isEU && !baseBucket.endsWith('-eu')) ? `${baseBucket}-eu` : baseBucket;

    const fhirResource = userCheck.Item.resource || {};
    fhirResource.active = false; // Legally mark doctor as no longer practicing here
    fhirResource.name =[{ use: "official", text: "ANONYMIZED_GDPR" }]; // Wipe PII
  
    await docClient.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: id },
        UpdateExpression: "SET #n = :del, #e = :del, #a = :null, #v = :status, #res = :safeFhir, bio = :null, phone = :null, address = :null, aiExtractedText = :null, licenseNumber = :null, googleRefreshToken = :null",
        ExpressionAttributeNames: { 
            "#n": "name",
            "#e": "email",
            "#a": "avatar",
            "#v": "verificationStatus",
            "#res": "resource" // Safely mapped
        },
        ExpressionAttributeValues: { 
            ":del": "ANONYMIZED_GDPR", 
            ":status": "DELETED", 
            ":null": null,
            ":safeFhir": fhirResource // Saves the preserved qualifications!
        }
    }));

    // 3. TAG S3 FILES FOR 7-YEAR PURGE (Law 2026)
    const retentionTags = {
        Tagging: {
            TagSet: [
                { Key: "Status", Value: "Deleted" },
                { Key: "RetentionPeriod", Value: "7Years" }
            ]
        }
    };

    try {

        const legalRecords =[`doctor/${id}/id_card.jpg`];
        
        if (userCheck.Item.diplomaUrl) {

            const exactDiplomaKey = userCheck.Item.diplomaUrl.split('/').slice(3).join('/');
            if (exactDiplomaKey) legalRecords.push(exactDiplomaKey);
        }

        for (const key of legalRecords) {
            await regionalS3.send(new PutObjectTaggingCommand({
                Bucket: bucketName,
                Key: key,
                ...retentionTags
            }));
        }
    } catch (e) { console.warn("Credential tagging failed"); }

    // 4. DELETE BIOMETRIC DATA (Face Photos) IMMEDIATELY
    try {
        // 🟢 PROFESSIONAL FIX: Tag as Biometric so your 1-day rule also catches them
        const biometricTags = { Tagging: { TagSet: [{ Key: "DataType", Value: "Biometric" }] } };
        
        const photos = [`doctor/${id}/profile_picture.jpg`, `doctor/${id}/profile_picture.png`, `doctor/${id}/selfie_verified.jpg`, `doctor/${id}/selfie_verified.png` ];
        for (const key of photos) {
            // First tag it as biometric (extra safety) then delete
            await regionalS3.send(new PutObjectTaggingCommand({ Bucket: bucketName, Key: key, ...biometricTags }));
            await regionalS3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
        }
    } catch (e) { console.warn("Biometric deletion failed"); }

    try {
        const regionalSns = getRegionalSNSClient(region);
        const regionalSes = getRegionalSESClient(region);
        const topicArn = region.toUpperCase() === 'EU' ? process.env.SNS_TOPIC_ARN_EU : process.env.SNS_TOPIC_ARN_US;

        // 1. Alert Admin via SNS
        await regionalSns.send(new PublishCommand({
            TopicArn: topicArn,
            Subject: "⚠️ SECURITY ALERT: Doctor Account Closure Finalized",
            Message: `CRITICAL: Doctor account ${id} has been fully anonymized. Biometric photos purged. Credentials (ID/Diploma) tagged for 7-year legal retention. \nRegion: ${region}\nRequest IP: ${req.ip}`
        }));

        // 2. Alert Doctor via SES
        if (userCheck.Item?.email) {
            await regionalSes.send(new SendEmailCommand({
                Source: process.env.SYSTEM_EMAIL || "noreply@yourdomain.com", // 🟢 Must be verified in AWS SES
                Destination: { ToAddresses: [userCheck.Item.email] },
                Message: {
                    Subject: { Data: "MediConnect - Account Closed Successfully" },
                    Body: { 
                        Text: { 
                            Data: `Hello Dr. ${userCheck.Item.name || id}, \n\nYour professional account with MediConnect has been closed. Your medical identity has been anonymized and biometric data has been destroyed. \n\nIn accordance with medical record laws, your board credentials will be retained for the legal 7-year period to satisfy audit requirements. \n\nThank you for your service.` 
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
                Username: id
            }));
            console.log(`[COMPLIANCE] Doctor Identity ${id} permanently erased from Cognito.`);
        }
    } catch (cognitoErr) {
        console.error("Failed to remove doctor from Cognito Pool", cognitoErr);
    }

    await writeAuditLog(id, id, "DELETE_PROFILE", "User invoked GDPR Right to be Forgotten", {
        region,
        ipAddress: req.ip,
        lastKnownContact: { 
            email: userCheck.Item.email, 
            phone: userCheck.Item.phone || "N/A" 
        }
    });
    logDoctorOnboarding(id, "ACCOUNT_DELETION", "DELETED", region).catch(console.error);

    res.status(200).json({ message: "Identity erased. Credentials tagged for legal audit." });
});

const logDoctorOnboarding = async (doctorId: string, eventType: string, status: string, region: string) => {
    try {
        // 🟢 PROFESSIONAL FIX: Keyless WIF Authentication
        const auth = new GoogleAuth({
            scopes:['https://www.googleapis.com/auth/cloud-platform']
        });
        
        const client = await auth.getClient();
        const accessToken = (await client.getAccessToken()).token;
        const projectId = await auth.getProjectId();

        const dataset = region.toUpperCase() === 'EU' ? "mediconnect_analytics_eu" : "mediconnect_analytics";
        const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}/tables/doctor_onboarding_logs/insertAll`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                kind: "bigquery#tableDataInsertAllRequest",
                rows:[{
                    json: {
                        doctor_id: doctorId,
                        event_type: eventType,
                        status: status,
                        timestamp: new Date().toISOString()
                    }
                }]
            })
        });
        if (!response.ok) {
            const errText = await response.text();
            console.error(`❌ BQ REJECTED ONBOARDING LOG [${response.status}]:`, errText);
        } else {
            console.log(`✅ BQ APPOINTMENT STREAM SUCCESS!`);
        }
    } catch (e: any) { 
        console.error("BigQuery Onboarding Log Failed", e.message); 
    }
};

export const approveDoctorByOfficer = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const { id } = req.params; 
    const authUser = (req as any).user;

    if (authUser.sub === id) {
        return res.status(403).json({ error: "Conflict of Interest: Doctors cannot approve their own credentials." });
    }

    await docClient.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: id },
        UpdateExpression: "SET isOfficerApproved = :t, verificationStatus = :s, #res.active = :t",
        ExpressionAttributeNames: { "#res": "resource" },
        ExpressionAttributeValues: { 
            ":t": true, 
            ":s": "APPROVED" 
        }
    }));

    await writeAuditLog(authUser.sub, id, "OFFICER_APPROVAL", "Human Medical Officer manually verified AI data and diploma", { 
        region, 
        ipAddress: req.ip 
    });
    logDoctorOnboarding(id, "OFFICER_APPROVAL", "APPROVED", region).catch(console.error);

    res.json({ message: "Doctor officially board-certified and approved for practice." });
});

export async function syncToGoogleCalendar(doctorId: string, timeSlot: string, patientName: string, reason: string, region: string) {
    try {
        const docClient = getRegionalClient(region);
        
        const res = await docClient.send(new GetCommand({ 
            TableName: CONFIG.DYNAMO_TABLE, 
            Key: { doctorId },
            ProjectionExpression: "googleRefreshToken"
        }));
        
        const refreshToken = res.Item?.googleRefreshToken;

        if (!refreshToken) {
            console.log(`[Calendar] No Google Token found for doctor ${doctorId}`);
            return;
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            `${process.env.API_PUBLIC_URL}/doctors/auth/google/callback` 
        );
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const startTime = new Date(timeSlot);
        const endTime = new Date(startTime.getTime() + 30 * 60000); 

        await calendar.events.insert({
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

    } catch (error: any) {
        console.error("[Calendar Sync Failed]:", error.message);
    }
}