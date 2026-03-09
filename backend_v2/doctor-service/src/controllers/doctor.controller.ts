// C:\Dev\mediconnect-project\mediconnect-infrastructure-develop\backend_v2\doctor-service\src\controllers\doctor.controller.ts

import { NextFunction, Request, Response } from 'express';
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { CompareFacesCommand } from "@aws-sdk/client-rekognition";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TextractClient, AnalyzeDocumentCommand } from "@aws-sdk/client-textract";
import { PublishCommand } from "@aws-sdk/client-sns";
import { google } from 'googleapis';
import { PutCommand, GetCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getRegionalClient, getRegionalS3Client, getRegionalRekognitionClient, getRegionalSNSClient } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';
import jwt from 'jsonwebtoken';
import { GoogleAuth } from "google-auth-library";

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
        const baseBucket = process.env.BUCKET_NAME || 'mediconnect-identity-verification';
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
    res.status(201).json({ message: "Doctor profile created", profile: item });
});

export const verifyDoctorIdentity = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req) as string;
    const authUser = (req as any).user;
    
    const { selfieImage, idImage } = req.body;
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
    
    const baseBucket = process.env.BUCKET_NAME || 'mediconnect-identity-verification';
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
        UpdateExpression: "set avatar = :a, isIdentityVerified = :v, identityStatus = :s",
        ExpressionAttributeValues: { ':a': selfieKey, ':v': true, ':s': "VERIFIED" }
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

    const parts: string[] =[];
    const names: any = {};
    const values: any = {};
    const allowed = ['name', 'specialization', 'bio', 'avatar', 'isEmailVerified'];

    Object.keys(updates).forEach(key => {
        if (allowed.includes(key) || key === 'schedule') {
            parts.push(`#${key} = :${key}`);
            names[`#${key}`] = key;
            values[`:${key}`] = updates[key];
        }
    });

    if (parts.length === 0) return res.status(400).json({ error: "No valid fields to update" });

    if (updates.name) {
        parts.push("#res.#nm[0].#txt = :fhirName");
        names["#res"] = "resource";
        names["#nm"] = "name";
        names["#txt"] = "text";
        values[":fhirName"] = updates.name;
    }
    if (updates.specialization) {
        parts.push("#res.#qual[0].#cd.#txt = :fhirSpec");
        names["#res"] = "resource";
        names["#qual"] = "qualification";
        names["#cd"] = "code";
        names["#txt"] = "text";
        values[":fhirSpec"] = updates.specialization;
    }

    parts.push("#res.#meta.#lu = :now");
    names["#meta"] = "meta";
    names["#lu"] = "lastUpdated";
    values[":now"] = new Date().toISOString();

    const response = await docClient.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: id },
        UpdateExpression: "SET " + parts.join(", "),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW"
    }));

    await writeAuditLog(authUser.sub, id, "UPDATE_DOCTOR", "Profile updated", { region: extractRegion(req), ipAddress: req.ip });
    res.status(200).json({ message: "Doctor profile updated", attributes: response.Attributes });
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

    await docClient.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: id },
        UpdateExpression: "SET #sch = :s, #tz = :t",
        ExpressionAttributeNames: { "#sch": "schedule", "#tz": "timezone" },
        ExpressionAttributeValues: { ":s": schedule, ":t": timezone || 'UTC' },
        ReturnValues: "UPDATED_NEW"
    }));

    res.status(200).json({ message: 'Schedule updated successfully', schedule });
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

    const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = req.get('host'); 
    
    // 🟢 2. Construct the Redirect URI dynamically
    const redirectUri = `${protocol}://${host}/doctors/auth/google/callback`;

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
    const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/doctors/auth/google/callback`;

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
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:8080'}/settings?calendar=connected`);
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

export const deleteDoctor = catchAsync(async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req) as string);
    const { id } = req.params;
    const authUser = (req as any).user;

    if (!authUser || authUser.sub !== id) return res.status(403).json({ error: "Unauthorized" });

    await docClient.send(new UpdateCommand({
        TableName: CONFIG.DYNAMO_TABLE, 
        Key: { doctorId: id },
        UpdateExpression: "SET #name = :deleted, email = :deleted, verificationStatus = :status, #res = :empty",
        ExpressionAttributeNames: { "#name": "name", "#res": "resource" },
        ExpressionAttributeValues: { ":deleted": "ANONYMIZED_GDPR", ":status": "DELETED", ":empty": {} }
    }));

    await writeAuditLog(authUser.sub, id, "DELETE_PROFILE", "Account anonymized per GDPR Right to be Forgotten", { 
        region: extractRegion(req), 
        ipAddress: req.ip 
    });
    res.status(200).json({ message: "Profile successfully anonymized/deleted." });
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

        await fetch(url, {
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