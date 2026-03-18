// backend_v2/cleanup-recordings/index.mjs
// EventBridge Trigger — Cleans up Chime media pipelines when meetings end
// Deployed per-region: US (us-east-1) and EU (eu-central-1)

import { ChimeSDKMediaPipelinesClient, DeleteMediaCapturePipelineCommand } from "@aws-sdk/client-chime-sdk-media-pipelines";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

// AWS_REGION set automatically by Lambda runtime
const REGION = process.env.AWS_REGION || "us-east-1";

// Regional clients (matches shared/aws-config.ts factory pattern)
const chimeClient = new ChimeSDKMediaPipelinesClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: REGION }),
    { marshallOptions: { removeUndefinedValues: true, convertEmptyValues: true } }
);

const TABLE_SESSIONS = process.env.TABLE_SESSIONS || "mediconnect-video-sessions";

export const handler = async (event) => {
    const detail = event.detail;
    if (!detail || detail.eventType !== "MeetingEnded") {
        console.log(`[cleanup-recordings][${REGION}] Ignored event: ${detail?.eventType}`);
        return;
    }

    const meetingId = detail.meetingId;
    if (!meetingId) {
        console.error(`[cleanup-recordings][${REGION}] No Meeting ID in event`);
        return;
    }

    try {
        console.log(`[cleanup-recordings][${REGION}] Looking up pipelines for meeting: ${meetingId}`);

        const scanRes = await ddb.send(new ScanCommand({
            TableName: TABLE_SESSIONS,
            FilterExpression: "meeting.MeetingId = :mid",
            ExpressionAttributeValues: { ":mid": meetingId },
        }));

        if (!scanRes.Items?.length) {
            console.log(`[cleanup-recordings][${REGION}] No active session found — already cleaned`);
            return;
        }

        const session = scanRes.Items[0];
        const pipelineId = session.pipelineId;

        if (!pipelineId) {
            console.log(`[cleanup-recordings][${REGION}] Session found but no pipeline ID recorded`);
            return;
        }

        console.log(`[cleanup-recordings][${REGION}] Deleting pipeline: ${pipelineId}`);
        await chimeClient.send(new DeleteMediaCapturePipelineCommand({
            MediaPipelineId: pipelineId,
        }));

        console.log(`[cleanup-recordings][${REGION}] Pipeline deleted — billing stopped`);
    } catch (error) {
        // Don't throw — EventBridge would retry endlessly
        console.error(`[cleanup-recordings][${REGION}] Cleanup failed:`, error.message);
    }
};
