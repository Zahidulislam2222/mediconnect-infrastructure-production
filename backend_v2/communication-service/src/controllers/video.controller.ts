import { Request, Response, NextFunction } from "express";
import { ChimeSDKMeetingsClient, CreateMeetingCommand, CreateAttendeeCommand, DeleteMeetingCommand } from "@aws-sdk/client-chime-sdk-meetings";
import { ChimeSDKMediaPipelinesClient, CreateMediaCapturePipelineCommand, DeleteMediaCapturePipelineCommand } from "@aws-sdk/client-chime-sdk-media-pipelines";
import { getRegionalClient } from '../../../shared/aws-config';
import { PutCommand, GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { writeAuditLog } from "../../../shared/audit";
import { logger } from "../../../shared/logger";

const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const TABLE_SESSIONS = process.env.TABLE_SESSIONS || "mediconnect-video-sessions";
const BASE_RECORDING_BUCKET = process.env.RECORDING_BUCKET || "mediconnect-consultation-recordings";

// 🟢 GDPR FIX: Extract region
export const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

// POST /video/session - Create or Join a meeting
export const createOrJoinSession = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const regionalDb = getRegionalClient(region);
    
    // 🟢 GDPR/Schrems II FIX: Force Chime and Recordings into the correct legal zone
    const targetAwsRegion = region.toUpperCase() === 'EU' ? 'eu-central-1' : 'us-east-1';
    const targetBucket = region.toUpperCase() === 'EU' ? `${BASE_RECORDING_BUCKET}-eu` : BASE_RECORDING_BUCKET;

    const chimeClient = new ChimeSDKMeetingsClient({ region: targetAwsRegion });
    const pipelineClient = new ChimeSDKMediaPipelinesClient({ region: targetAwsRegion });

    const { appointmentId, consentToRecord } = req.body;
    const userId = (req as any).user?.sub; 

    if (!appointmentId || !userId) return res.status(400).json({ error: "Missing appointmentId or User ID" });

    try {
        const aptRes = await regionalDb.send(new GetCommand({
            TableName: "mediconnect-appointments",
            Key: { appointmentId }
        }));

        const apt = aptRes.Item;
        if (!apt || (apt.patientId !== userId && apt.doctorId !== userId)) {
            return res.status(403).json({ error: "Unauthorized: You are not a participant" });
        }

        const dbRes = await regionalDb.send(new GetCommand({
            TableName: TABLE_SESSIONS, Key: { appointmentId }
        }));

        let meeting = dbRes.Item?.meeting;

        if (!meeting) {
            // 1. Create Meeting in correct Region
            const chimeRes = await chimeClient.send(new CreateMeetingCommand({
                ClientRequestToken: uuidv4(),
                MediaRegion: targetAwsRegion, // 🟢 Forces data to stay local
                ExternalMeetingId: appointmentId,
                MeetingFeatures: { Audio: { EchoReduction: "AVAILABLE" } }
            } as any));
            meeting = chimeRes.Meeting;

            let pipelineId = null;

    if (meeting?.MeetingArn && consentToRecord === true) {
        try {
            const pipelineRes = await pipelineClient.send(new CreateMediaCapturePipelineCommand({
                        SourceType: "ChimeSdkMeeting",
                        SourceArn: meeting.MeetingArn,
                        SinkType: "S3Bucket",
                        SinkArn: `arn:aws:s3:::${targetBucket}/recordings/${appointmentId}`, // 🟢 Save to local EU/US bucket
                        ChimeSdkMeetingConfiguration: {
                            ArtifactsConfiguration: {
                                Audio: { MuxType: "AudioOnly" }, 
                                Video: { State: "Enabled", MuxType: "VideoOnly" },
                                Content: { State: "Enabled", MuxType: "ContentOnly" }
                            }
                        }
                    }));
                    pipelineId = pipelineRes.MediaCapturePipeline?.MediaPipelineId;
            await writeAuditLog(userId, apt.patientId, "RECORDING_STARTED", "Patient consented to video recording", { region });
        } catch (recErr: any) {
            logger.error("[VIDEO] Failed to start recording", { error: recErr.message });
                }
            }

            await regionalDb.send(new PutCommand({
                TableName: TABLE_SESSIONS,
                Item: {
                    appointmentId, meeting, pipelineId, 
                    createdAt: new Date().toISOString(),
                    ttl: Math.floor(Date.now() / 1000) + 86400
                }
            }));
        }

        const attendeeRes = await chimeClient.send(new CreateAttendeeCommand({
            MeetingId: meeting.MeetingId, ExternalUserId: userId
        }));

        try {
            await regionalDb.send(new UpdateCommand({
                TableName: "mediconnect-appointments",
                Key: { appointmentId },
                UpdateExpression: "SET #res.#stat = :s, patientArrived = :arrived",
                ExpressionAttributeNames: { "#res": "resource", "#stat": "status" },
                ExpressionAttributeValues: { ":s": "arrived", ":arrived": true }
            }));
        } catch (e: any) { logger.warn("[VIDEO] Could not update FHIR status", { error: e.message }); }

        await writeAuditLog(userId, userId, "VIDEO_SESSION_JOINED", `Joined appointment ${appointmentId}`, { region, ipAddress: req.ip });

        res.json({ Meeting: meeting, Attendee: attendeeRes.Attendee });
    } catch (error: any) {
        logger.error("[VIDEO] Video session error", { error: error.message });
        res.status(500).json({ error: "Video session failed" });
    }
});

export const endSession = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const regionalDb = getRegionalClient(region);
    const targetAwsRegion = region.toUpperCase() === 'EU' ? 'eu-central-1' : 'us-east-1';

    const chimeClient = new ChimeSDKMeetingsClient({ region: targetAwsRegion });
    const pipelineClient = new ChimeSDKMediaPipelinesClient({ region: targetAwsRegion });

    const appointmentId = req.query.appointmentId as string;
    const userId = (req as any).user?.sub;
    const isDoctor = (req as any).user?.isDoctor; 

    try {

        const aptRes = await regionalDb.send(new GetCommand({
            TableName: "mediconnect-appointments",
            Key: { appointmentId }
        }));

        if (!aptRes.Item || (aptRes.Item.patientId !== userId && aptRes.Item.doctorId !== userId)) {
            return res.status(403).json({ error: "Unauthorized to end this session." });
        }

        if (!isDoctor) {
            await writeAuditLog(userId, aptRes.Item.patientId, "ILLEGAL_MEETING_TERMINATION", "Patient attempted to destroy Chime meeting", { region, ipAddress: req.ip });
            return res.status(403).json({ error: "Only the presiding physician can end the consultation session." });
        }

        const dbRes = await regionalDb.send(new GetCommand({
            TableName: TABLE_SESSIONS, Key: { appointmentId }
        }));
        const session = dbRes.Item;

        if (session?.pipelineId) {
            try { await pipelineClient.send(new DeleteMediaCapturePipelineCommand({ MediaPipelineId: session.pipelineId })); } catch (e) { }
        }

        if (session?.meeting?.MeetingId) {
            try { await chimeClient.send(new DeleteMeetingCommand({ MeetingId: session.meeting.MeetingId })); } catch (e) { }
            await regionalDb.send(new DeleteCommand({ TableName: TABLE_SESSIONS, Key: { appointmentId } }));
            
            await regionalDb.send(new UpdateCommand({
                TableName: "mediconnect-appointments", Key: { appointmentId },
                UpdateExpression: "SET #res.#stat = :s, #s = :legacyStatus",
                ExpressionAttributeNames: { "#res": "resource", "#stat": "status", "#s": "status" },
                ExpressionAttributeValues: { ":s": "fulfilled", ":legacyStatus": "COMPLETED" }
            }));

            await writeAuditLog(userId, userId, "VIDEO_SESSION_ENDED", `Meeting ${appointmentId} ended`, { region, ipAddress: req.ip });
        }

        res.json({ success: true, message: "Meeting ended successfully" });
    } catch (error: any) {
        logger.error("[VIDEO] Failed to end session", { error: error.message });
        res.status(500).json({ error: "Failed to end session" });
    }
});