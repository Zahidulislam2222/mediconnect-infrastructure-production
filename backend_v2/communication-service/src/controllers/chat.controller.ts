import { requestJurisdiction } from '../../../shared/region-context';
import { Request, Response, NextFunction } from "express";
import {
    ApiGatewayManagementApi,
    PostToConnectionCommand
} from "@aws-sdk/client-apigatewaymanagementapi";
import { PutCommand, QueryCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { getRegionalClient } from '../../../shared/aws-config';
import { mapToFHIRCommunication, scrubPII } from "../utils/fhir-mapper";
import { writeAuditLog } from "../../../shared/audit";
import { safeLog, safeError } from "../../../shared/logger";
import { encryptPHI, decryptPHI } from '../../../shared/kms-crypto';
import { TABLE_NAMES, setting } from '../../../shared/settings';

const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const DB_TABLES = {
    get HISTORY() { return TABLE_NAMES.chatHistory; },
    get CONNECTIONS() { return TABLE_NAMES.chatConnections; },
    GRAPH: "mediconnect-graph-data"
};

const generateConversationId = (userA: string, userB: string): string => {
    const sorted = [userA, userB].sort();
    return `CONV#${sorted[0]}#${sorted[1]}`;
};

// Use only the authenticated regional context.
export const extractRegion = (req: Request): string => requestJurisdiction(req);

export const getChatHistory = catchAsync(async (req: Request, res: Response) => {
    try {
        const region = extractRegion(req);
        const regionalDb = getRegionalClient(region);
        
        const { recipientId } = req.query;
        const requesterId = (req as any).user?.sub;

        if (!requesterId || !recipientId) return res.status(400).json({ error: "Missing recipientId or authentication." });

        const conversationId = generateConversationId(requesterId, String(recipientId));
        const isDoctor = (req as any).user?.role === 'doctor';
        
        const pk = isDoctor ? `DOCTOR#${requesterId}` : `PATIENT#${requesterId}`;
        const sk = isDoctor ? `PATIENT#${recipientId}` : `DOCTOR#${recipientId}`;

        const relationship = await regionalDb.send(new GetCommand({
            TableName: DB_TABLES.GRAPH,
            Key: { PK: pk, SK: sk }
        }));

        if (!relationship.Item) {
            await writeAuditLog(requesterId, "SYSTEM", "UNAUTHORIZED_HISTORY_ACCESS", "No Care Network Link", { target: recipientId, region, ipAddress: req.ip });
            return res.status(403).json({ error: "Unauthorized to view this conversation." });
        }

        const history = await regionalDb.send(new QueryCommand({
            TableName: DB_TABLES.HISTORY,
            KeyConditionExpression: "conversationId = :cid",
            ExpressionAttributeValues: { ":cid": conversationId },
            Limit: 50,
            ScanIndexForward: false
        }));

        await writeAuditLog(requesterId, String(recipientId), "READ_CHAT_HISTORY", "History accessed", { region, ipAddress: req.ip });

        // Decrypt PHI-encrypted message text (migration-safe: plaintext passes through)
        const items = (history.Items || []).reverse();
        const decryptedItems = await Promise.all(items.map(async (item: any) => {
            if (item.text) {
                try {
                    const decrypted = await decryptPHI({ text: item.text }, region);
                    return { ...item, text: decrypted.text };
                } catch {
                    // Migration safety: return plaintext if decryption fails
                    return item;
                }
            }
            return item;
        }));

        res.json(decryptedItems);

    } catch (error: any) {
        safeError("[CHAT] Failed to fetch chat history", { error: error.message });
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

export const handleWsEventHttp = catchAsync(async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user?.sub) return res.status(401).json({ message: "Unauthorized" });
        // HTTP callers cannot supply gateway identity or connection lifecycle events.
        if (req.body.type !== 'message') {
            return res.status(501).json({ code: 'CHAT_ACTION_NOT_IMPLEMENTED' });
        }
        const result = await handleWebSocketEvent({
            routeKey: 'sendMessage', userId: user.sub, userRole: user.role,
            region: requestJurisdiction(req),
            body: { recipientId: req.body.recipientId, text: req.body.content },
        });
        res.status(result.statusCode).json(result.body);
    } catch (error: any) {
        safeError("[CHAT] WebSocket event handling failed", { error: error.message });
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export const handleWebSocketEvent = async (event: any) => {
    const { routeKey, connectionId, userId, userRole, body, region } = event;
    const regionalDb = getRegionalClient(region);

    const isEU = region.toUpperCase() === 'EU' || region === 'eu-central-1';
    const awsRegionTarget = isEU ? 'eu-central-1' : 'us-east-1';

    const endpoint = isEU 
        ? process.env.AWS_WS_GATEWAY_ENDPOINT_EU 
        : process.env.AWS_WS_GATEWAY_ENDPOINT_US;

    if (!endpoint) {
        safeError("[CHAT] CRITICAL: WebSocket Gateway Endpoint missing for region", { region: awsRegionTarget });
    }

    const apigw = new ApiGatewayManagementApi({ endpoint, region: awsRegionTarget });

    switch (routeKey) {
        case "$connect":
            if (!connectionId) return { statusCode: 200, body: { message: "REST Bridge Active" } };

            try {
                await writeAuditLog(userId, "SYSTEM", "WS_CONNECT", "Secure Session", { region });
            } catch (auditErr) {
                safeError("[CHAT] Audit log failed for WS_CONNECT", auditErr);
            }
            try {
                await regionalDb.send(new PutCommand({
                    TableName: DB_TABLES.CONNECTIONS,
                    Item: { connectionId, userId, ttl: Math.floor(Date.now() / 1000) + 7200 }
                }));
            } catch (connErr) {
                safeError("[CHAT] Failed to write connection record", connErr);
            }
            return { statusCode: 200, body: {} };

        case "sendMessage":{
            const data = body.body || body; 
            const { recipientId, text } = data;

            if (!recipientId || !text) return { statusCode: 400, body: { error: "Missing data" } };

            const conversationId = generateConversationId(userId, recipientId);

            const relations = await Promise.all([
                regionalDb.send(new GetCommand({ TableName: DB_TABLES.GRAPH, Key: { PK: `PATIENT#${userId}`, SK: `DOCTOR#${recipientId}` } })),
                regionalDb.send(new GetCommand({ TableName: DB_TABLES.GRAPH, Key: { PK: `DOCTOR#${userId}`, SK: `PATIENT#${recipientId}` } })),
                regionalDb.send(new GetCommand({ TableName: DB_TABLES.GRAPH, Key: { PK: `PATIENT#${recipientId}`, SK: `DOCTOR#${userId}` } })),
                regionalDb.send(new GetCommand({ TableName: DB_TABLES.GRAPH, Key: { PK: `DOCTOR#${recipientId}`, SK: `PATIENT#${userId}` } }))
            ]);

            if (!relations.some(r => !!r.Item)) {
                await writeAuditLog(userId, "SYSTEM", "UNAUTHORIZED_MESSAGE", "Blocked: No Graph Link", { region });
                return { statusCode: 403, body: { error: "Blocked: No established care relationship." } };
            }

            const senderType = userRole === 'doctor' ? "Practitioner" : "Patient";
            const recipientType = userRole === 'doctor' ? "Patient" : "Practitioner";

            const fhirResource = mapToFHIRCommunication(userId, senderType, recipientId, recipientType, text);
            const timestamp = new Date().toISOString();

            // Encrypt message text as PHI before storage
            const scrubbedText = scrubPII(text);
            let encryptedText: string;
            try {
                const encrypted = await encryptPHI({ text: scrubbedText }, region);
                encryptedText = encrypted.text;
            } catch {
                return { statusCode: 503, body: { code: 'PHI_ENCRYPTION_UNAVAILABLE' } };
            }

            // Idempotency: use client-provided messageId to prevent duplicate storage
            const messageId = data.messageId || `${conversationId}:${timestamp}`;
            try {
                await regionalDb.send(new PutCommand({
                    TableName: DB_TABLES.HISTORY,
                    Item: {
                        conversationId, timestamp, senderId: userId, recipientId,
                        text: encryptedText, resource: { ...fhirResource, payload: [{ contentString: encryptedText }] }, isRead: false,
                        messageId
                    },
                    ConditionExpression: "attribute_not_exists(conversationId) AND attribute_not_exists(#ts)",
                    ExpressionAttributeNames: { "#ts": "timestamp" }
                }));
            } catch (dedup: any) {
                if (dedup.name === 'ConditionalCheckFailedException') {
                    return { statusCode: 200, body: { status: "Already sent", conversationId, deduplicated: true } };
                }
                throw dedup;
            }

            // Audit log for message creation
            writeAuditLog(userId, recipientId, "CREATE_MESSAGE", "Chat message sent", { region }).catch(() => {});

            const connections = await regionalDb.send(new QueryCommand({
                TableName: DB_TABLES.CONNECTIONS,
                IndexName: "UserIdIndex",
                KeyConditionExpression: "userId = :uid",
                ExpressionAttributeValues: { ":uid": recipientId }
            }));

            const deliveryPromises = (connections.Items || []).map(async (conn) => {
                try {
                    await apigw.send(new PostToConnectionCommand({
                        ConnectionId: conn.connectionId,
                        Data: JSON.stringify({ type: "message", senderId: userId, text: scrubPII(text), conversationId, timestamp })
                    }));
                } catch (e: any) {
                    if (e.name === 'GoneException' || e.statusCode === 410) {
                        await regionalDb.send(new DeleteCommand({ TableName: DB_TABLES.CONNECTIONS, Key: { connectionId: conn.connectionId } }));
                    }
                }
            });

            await Promise.all(deliveryPromises);
            return { statusCode: 200, body: { status: "Sent", conversationId } };
}

        case "$disconnect":
            await regionalDb.send(new DeleteCommand({ TableName: DB_TABLES.CONNECTIONS, Key: { connectionId } }));
            try {
                await writeAuditLog(userId || "unknown", "SYSTEM", "WS_DISCONNECT", `WebSocket disconnected: ${connectionId}`, { region, connectionId });
            } catch { /* Non-blocking audit */ }
            return { statusCode: 200, body: {} };

        default:
            return { statusCode: 400, body: { error: "Unknown Route" } };
    }
};
