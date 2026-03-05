import { ChimeSDKMediaPipelinesClient, ListMediaCapturePipelinesCommand, DeleteMediaCapturePipelineCommand } from "@aws-sdk/client-chime-sdk-media-pipelines";

// Initialize Client (Uses the region the Lambda is running in)
const client = new ChimeSDKMediaPipelinesClient({});

export const handler = async (event) => {
    console.log("Received Chime Event:", JSON.stringify(event));

    // 1. Validate the Event
    const detail = event.detail;
    if (!detail || detail.eventType !== "MeetingEnded") {
        console.log("Ignored event type:", detail?.eventType);
        return;
    }

    const meetingId = detail.meetingId;
    if (!meetingId) {
        console.error("No Meeting ID found in event");
        return;
    }

    try {
        console.log(`🔍 Hunting for pipelines attached to Meeting: ${meetingId}`);
        
        // Let's connect to DynamoDB to get the Pipeline ID.
        const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
        const { DynamoDBDocumentClient, ScanCommand } = await import("@aws-sdk/lib-dynamodb");
        
        const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
        
        // ⚠️ Scanning is not efficient for millions of rows, but for active sessions it's fine.
        // Ideally, you should add a GSI on 'meeting.MeetingId'.
        const scanRes = await ddb.send(new ScanCommand({
            TableName: process.env.TABLE_SESSIONS || "mediconnect-video-sessions",
            FilterExpression: "meeting.MeetingId = :mid",
            ExpressionAttributeValues: { ":mid": meetingId }
        }));
        
        if (!scanRes.Items || scanRes.Items.length === 0) {
            console.log("No active session found in DB for this meeting. Already cleaned?");
            return;
        }
        
        const session = scanRes.Items[0];
        const pipelineId = session.pipelineId;
        
        if (!pipelineId) {
            console.log("Session found, but no Pipeline ID recorded.");
            return;
        }

        // 3. DELETE THE PIPELINE
        console.log(`🚨 KILLING PIPELINE: ${pipelineId}`);
        await client.send(new DeleteMediaCapturePipelineCommand({
            MediaPipelineId: pipelineId
        }));
        
        console.log("✅ Pipeline deleted. Billing stopped.");

    } catch (error) {
        console.error("❌ Cleanup Failed:", error);
        // Don't throw, or EventBridge will retry endlessly. Just log error.
    }
};