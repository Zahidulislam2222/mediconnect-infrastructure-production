/**
 * Staff Controller
 * =================
 * Handles shift scheduling, task management, staff directory,
 * and internal announcements.
 *
 * Pattern: Matches booking-service/controllers with catchAsync, extractRegion, writeAuditLog.
 */

import { Request, Response, NextFunction } from 'express';
import { getRegionalClient } from '../../../shared/aws-config';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { writeAuditLog } from '../../../shared/audit';
import { sendNotification } from '../../../shared/notifications';
import { randomUUID } from 'crypto';

// ─── Configuration ──────────────────────────────────────────────────────
const TABLE_SHIFTS = process.env.TABLE_SHIFTS || "mediconnect-staff-shifts";
const TABLE_TASKS = process.env.TABLE_TASKS || "mediconnect-staff-tasks";
const TABLE_ANNOUNCEMENTS = process.env.TABLE_ANNOUNCEMENTS || "mediconnect-staff-announcements";
const TABLE_DOCTORS = process.env.TABLE_DOCTORS || "mediconnect-doctors";

const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

export const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

// ─── SHIFT MANAGEMENT ───────────────────────────────────────────────────

export const createShift = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { staffId, startTime, endTime, department, role, notes } = req.body;

    if (!staffId || !startTime || !endTime || !department) {
        return res.status(400).json({ error: "Missing required shift fields: staffId, startTime, endTime, department" });
    }

    const shiftId = randomUUID();
    const timestamp = new Date().toISOString();

    await docClient.send(new PutCommand({
        TableName: TABLE_SHIFTS,
        Item: {
            shiftId,
            staffId,
            startTime,
            endTime,
            department,
            role: role || "General",
            notes: notes || "",
            status: "SCHEDULED",
            createdBy: user.id,
            createdAt: timestamp,
        }
    }));

    await writeAuditLog(user.id, staffId, "CREATE_SHIFT", `Shift ${shiftId} created`, { region, ipAddress: req.ip });

    // Fire-and-forget shift assignment notification
    (async () => {
        try {
            const staffRecord = await docClient.send(new GetCommand({
                TableName: TABLE_DOCTORS,
                Key: { doctorId: staffId }
            }));
            sendNotification({
                region,
                recipientEmail: staffRecord.Item?.email,
                subject: 'New Shift Assigned',
                message: `You have been assigned a new shift in ${department} from ${startTime} to ${endTime}.`,
                type: 'SHIFT_ASSIGNED',
                metadata: { shiftId, staffId, department }
            }).catch(() => {});
        } catch { /* Staff email lookup failed — notification skipped */ }
    })();

    res.status(201).json({ message: "Shift created", shiftId });
});

export const getShifts = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { staffId, department } = req.query;

    if (staffId) {
        const response = await docClient.send(new QueryCommand({
            TableName: TABLE_SHIFTS,
            IndexName: "StaffIndex",
            KeyConditionExpression: "staffId = :sid",
            ExpressionAttributeValues: { ":sid": staffId },
            ScanIndexForward: false,
            Limit: 50,
        }));

        return res.json({ shifts: response.Items || [] });
    }

    // Scan with optional department filter
    const scanParams: any = { TableName: TABLE_SHIFTS, Limit: 100 };
    if (department) {
        scanParams.FilterExpression = "department = :dept";
        scanParams.ExpressionAttributeValues = { ":dept": department };
    }

    const response = await docClient.send(new ScanCommand(scanParams));
    res.json({ shifts: response.Items || [] });
});

export const updateShift = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { shiftId, status, startTime, endTime, notes } = req.body;

    if (!shiftId) return res.status(400).json({ error: "Missing shiftId" });

    const existing = await docClient.send(new GetCommand({ TableName: TABLE_SHIFTS, Key: { shiftId } }));
    if (!existing.Item) return res.status(404).json({ error: "Shift not found" });

    let updateExpression = "SET lastUpdated = :now";
    const expressionAttributeValues: any = { ":now": new Date().toISOString() };
    const expressionAttributeNames: any = {};

    if (status) {
        updateExpression += ", #s = :s";
        expressionAttributeNames["#s"] = "status";
        expressionAttributeValues[":s"] = status;
    }
    if (startTime) {
        updateExpression += ", startTime = :st";
        expressionAttributeValues[":st"] = startTime;
    }
    if (endTime) {
        updateExpression += ", endTime = :et";
        expressionAttributeValues[":et"] = endTime;
    }
    if (notes !== undefined) {
        updateExpression += ", notes = :n";
        expressionAttributeValues[":n"] = notes;
    }

    await docClient.send(new UpdateCommand({
        TableName: TABLE_SHIFTS, Key: { shiftId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
    }));

    await writeAuditLog(user.id, existing.Item.staffId, "UPDATE_SHIFT", `Shift ${shiftId} updated`, { region, ipAddress: req.ip });

    res.json({ message: "Shift updated", shiftId });
});

export const deleteShift = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { shiftId } = req.params;

    const existing = await docClient.send(new GetCommand({ TableName: TABLE_SHIFTS, Key: { shiftId } }));
    if (!existing.Item) return res.status(404).json({ error: "Shift not found" });

    await docClient.send(new DeleteCommand({ TableName: TABLE_SHIFTS, Key: { shiftId } }));

    await writeAuditLog(user.id, existing.Item.staffId, "DELETE_SHIFT", `Shift ${shiftId} deleted`, { region, ipAddress: req.ip });

    // Fire-and-forget shift cancellation notification
    if (existing.Item.staffId) {
        (async () => {
            try {
                const staffRecord = await docClient.send(new GetCommand({
                    TableName: TABLE_DOCTORS,
                    Key: { doctorId: existing.Item!.staffId }
                }));
                sendNotification({
                    region,
                    recipientEmail: staffRecord.Item?.email,
                    subject: 'Shift Cancelled',
                    message: `Your shift on ${existing.Item!.startTime || 'N/A'} has been cancelled.`,
                    type: 'SHIFT_CANCELLED',
                    metadata: { shiftId, staffId: existing.Item!.staffId }
                }).catch(() => {});
            } catch { /* Staff email lookup failed — notification skipped */ }
        })();
    }

    res.json({ message: "Shift deleted", shiftId });
});

// ─── TASK MANAGEMENT ────────────────────────────────────────────────────

export const createTask = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { title, description, assignedTo, priority = "Medium", dueDate, department } = req.body;

    if (!title || !assignedTo) {
        return res.status(400).json({ error: "Missing required fields: title, assignedTo" });
    }

    const taskId = randomUUID();
    const timestamp = new Date().toISOString();

    await docClient.send(new PutCommand({
        TableName: TABLE_TASKS,
        Item: {
            taskId,
            title,
            description: description || "",
            assignedTo,
            assignedBy: user.id,
            priority,
            status: "OPEN",
            department: department || "General",
            dueDate: dueDate || null,
            createdAt: timestamp,
        }
    }));

    await writeAuditLog(user.id, assignedTo, "CREATE_TASK", `Task ${taskId}: ${title}`, { region, ipAddress: req.ip });

    // Fire-and-forget task assignment notification
    (async () => {
        try {
            const staffRecord = await docClient.send(new GetCommand({
                TableName: TABLE_DOCTORS,
                Key: { doctorId: assignedTo }
            }));
            sendNotification({
                region,
                recipientEmail: staffRecord.Item?.email,
                subject: 'New Task Assigned',
                message: `You have been assigned a new task: "${title}" (Priority: ${priority}). ${dueDate ? `Due: ${dueDate}` : ''}`.trim(),
                type: 'TASK_ASSIGNED',
                metadata: { taskId, assignedTo, priority }
            }).catch(() => {});
        } catch { /* Staff email lookup failed — notification skipped */ }
    })();

    res.status(201).json({ message: "Task created", taskId });
});

export const getTasks = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);

    const { assignedTo, status } = req.query;

    if (assignedTo) {
        const response = await docClient.send(new QueryCommand({
            TableName: TABLE_TASKS,
            IndexName: "AssigneeIndex",
            KeyConditionExpression: "assignedTo = :aid",
            ExpressionAttributeValues: { ":aid": assignedTo },
            ScanIndexForward: false,
            Limit: 50,
        }));

        return res.json({ tasks: response.Items || [] });
    }

    const scanParams: any = { TableName: TABLE_TASKS, Limit: 100 };
    if (status) {
        scanParams.FilterExpression = "#s = :s";
        scanParams.ExpressionAttributeNames = { "#s": "status" };
        scanParams.ExpressionAttributeValues = { ":s": status };
    }

    const response = await docClient.send(new ScanCommand(scanParams));
    res.json({ tasks: response.Items || [] });
});

export const updateTask = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { taskId, status, priority, notes } = req.body;

    if (!taskId) return res.status(400).json({ error: "Missing taskId" });

    const existing = await docClient.send(new GetCommand({ TableName: TABLE_TASKS, Key: { taskId } }));
    if (!existing.Item) return res.status(404).json({ error: "Task not found" });

    let updateExpression = "SET lastUpdated = :now";
    const expressionAttributeValues: any = { ":now": new Date().toISOString() };
    const expressionAttributeNames: any = {};

    if (status) {
        updateExpression += ", #s = :s";
        expressionAttributeNames["#s"] = "status";
        expressionAttributeValues[":s"] = status;

        if (status === "COMPLETED") {
            updateExpression += ", completedAt = :ca, completedBy = :cb";
            expressionAttributeValues[":ca"] = new Date().toISOString();
            expressionAttributeValues[":cb"] = user.id;
        }
    }
    if (priority) {
        updateExpression += ", priority = :p";
        expressionAttributeValues[":p"] = priority;
    }
    if (notes !== undefined) {
        updateExpression += ", notes = :n";
        expressionAttributeValues[":n"] = notes;
    }

    await docClient.send(new UpdateCommand({
        TableName: TABLE_TASKS, Key: { taskId },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues,
    }));

    await writeAuditLog(user.id, existing.Item.assignedTo, "UPDATE_TASK", `Task ${taskId} status: ${status || 'updated'}`, { region, ipAddress: req.ip });

    res.json({ message: "Task updated", taskId });
});

// ─── ANNOUNCEMENTS ──────────────────────────────────────────────────────

export const createAnnouncement = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { title, content, priority = "Normal", department } = req.body;

    if (!title || !content) {
        return res.status(400).json({ error: "Missing required fields: title, content" });
    }

    const announcementId = randomUUID();

    await docClient.send(new PutCommand({
        TableName: TABLE_ANNOUNCEMENTS,
        Item: {
            announcementId,
            title,
            content,
            priority,
            department: department || "ALL",
            authorId: user.id,
            authorEmail: user.email,
            createdAt: new Date().toISOString(),
            isActive: true,
        }
    }));

    await writeAuditLog(user.id, "STAFF", "CREATE_ANNOUNCEMENT", `Announcement: ${title}`, { region, ipAddress: req.ip });

    res.status(201).json({ message: "Announcement published", announcementId });
});

export const getAnnouncements = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);

    const response = await docClient.send(new ScanCommand({
        TableName: TABLE_ANNOUNCEMENTS,
        FilterExpression: "isActive = :active",
        ExpressionAttributeValues: { ":active": true },
        Limit: 50,
    }));

    const items = (response.Items || []).sort((a: any, b: any) =>
        (b.createdAt || "").localeCompare(a.createdAt || "")
    );

    res.json({ announcements: items });
});

export const deleteTask = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { taskId } = req.params;

    const existing = await docClient.send(new GetCommand({ TableName: TABLE_TASKS, Key: { taskId } }));
    if (!existing.Item) return res.status(404).json({ error: "Task not found" });

    await docClient.send(new DeleteCommand({ TableName: TABLE_TASKS, Key: { taskId } }));

    await writeAuditLog(user.id, existing.Item.assignedTo, "DELETE_TASK", `Task ${taskId} deleted`, { region, ipAddress: req.ip });

    // Fire-and-forget task cancellation notification
    if (existing.Item.assignedTo) {
        (async () => {
            try {
                const staffRecord = await docClient.send(new GetCommand({
                    TableName: TABLE_DOCTORS,
                    Key: { doctorId: existing.Item!.assignedTo }
                }));
                sendNotification({
                    region,
                    recipientEmail: staffRecord.Item?.email,
                    subject: 'Task Removed',
                    message: `A task assigned to you has been removed: "${existing.Item!.title || 'N/A'}".`,
                    type: 'TASK_CANCELLED',
                    metadata: { taskId, assignedTo: existing.Item!.assignedTo }
                }).catch(() => {});
            } catch { /* Staff email lookup failed — notification skipped */ }
        })();
    }

    res.json({ message: "Task deleted", taskId });
});

// ─── ANNOUNCEMENT MANAGEMENT ─────────────────────────────────────────────

export const updateAnnouncement = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { announcementId } = req.params;
    const { title, content, priority, category } = req.body;

    const existing = await docClient.send(new GetCommand({ TableName: TABLE_ANNOUNCEMENTS, Key: { announcementId } }));
    if (!existing.Item) return res.status(404).json({ error: "Announcement not found" });

    const updates: string[] = [];
    const values: Record<string, any> = {};
    const names: Record<string, string> = {};

    if (title) { updates.push("#t = :t"); values[":t"] = title; names["#t"] = "title"; }
    if (content) { updates.push("#c = :c"); values[":c"] = content; names["#c"] = "content"; }
    if (priority) { updates.push("priority = :p"); values[":p"] = priority; }
    if (category) { updates.push("category = :cat"); values[":cat"] = category; }

    updates.push("updatedAt = :u"); values[":u"] = new Date().toISOString();

    await docClient.send(new UpdateCommand({
        TableName: TABLE_ANNOUNCEMENTS,
        Key: { announcementId },
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeValues: values,
        ...(Object.keys(names).length > 0 && { ExpressionAttributeNames: names }),
    }));

    await writeAuditLog(user.id, "STAFF", "UPDATE_ANNOUNCEMENT", `Announcement ${announcementId} updated`, { region, ipAddress: req.ip });

    res.json({ message: "Announcement updated", announcementId });
});

export const deleteAnnouncement = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const user = (req as any).user;

    const { announcementId } = req.params;

    const existing = await docClient.send(new GetCommand({ TableName: TABLE_ANNOUNCEMENTS, Key: { announcementId } }));
    if (!existing.Item) return res.status(404).json({ error: "Announcement not found" });

    await docClient.send(new DeleteCommand({ TableName: TABLE_ANNOUNCEMENTS, Key: { announcementId } }));

    await writeAuditLog(user.id, "STAFF", "DELETE_ANNOUNCEMENT", `Announcement ${announcementId} deleted`, { region, ipAddress: req.ip });

    res.json({ message: "Announcement deleted", announcementId });
});

// ─── STAFF DIRECTORY ────────────────────────────────────────────────────

export const getStaffDirectory = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);

    // Staff directory pulls from doctors table (doctors are clinical staff)
    const response = await docClient.send(new ScanCommand({
        TableName: TABLE_DOCTORS,
        ProjectionExpression: "doctorId, #n, specialization, verificationStatus",
        ExpressionAttributeNames: { "#n": "name" },
        Limit: 100,
    }));

    const staff = (response.Items || []).map((doc: any) => ({
        id: doc.doctorId,
        name: doc.name,
        department: doc.specialization || "General",
        status: doc.verificationStatus,
    }));

    res.json({ staff, count: staff.length });
});
