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
