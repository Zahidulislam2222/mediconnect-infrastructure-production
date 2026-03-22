// ─── FEATURE #18: Appointment Reminders (SNS) ──────────────────────────────
// SMS/email reminders via AWS SNS for upcoming appointments.
// Reminder scheduling: 24h before, 1h before.
// Uses existing SNS pattern from breach detection.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PublishCommand } from '@aws-sdk/client-sns';
import { QueryCommand, ScanCommand, UpdateCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient, getRegionalSNSClient } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';
import { safeLog, safeError } from '../../../shared/logger';
import { publishEvent, EventType } from '../../../shared/event-bus';

const TABLE_APPOINTMENTS = process.env.TABLE_APPOINTMENTS || 'mediconnect-appointments';
const TABLE_REMINDERS = process.env.TABLE_REMINDERS || 'mediconnect-reminders';
const TABLE_PATIENTS = process.env.DYNAMO_TABLE || 'mediconnect-patients';
const TABLE_DOCTORS = process.env.DYNAMO_TABLE_DOCTORS || 'mediconnect-doctors';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Reminder Templates ────────────────────────────────────────────────────

interface ReminderTemplate {
    type: '24h' | '1h' | 'custom';
    channel: 'sms' | 'email' | 'both';
    subject: string;
    bodyTemplate: string;
    smsTemplate: string;
}

const REMINDER_TEMPLATES: Record<string, ReminderTemplate> = {
    '24h': {
        type: '24h',
        channel: 'both',
        subject: 'Appointment Reminder - Tomorrow',
        bodyTemplate: 'Dear {{patientName}},\n\nThis is a reminder that you have an appointment scheduled for {{appointmentDate}} at {{appointmentTime}} with Dr. {{doctorName}}.\n\nReason: {{reason}}\n\nPlease arrive 10 minutes early. If you need to reschedule, please do so at least 2 hours before your appointment.\n\nBest regards,\nMediConnect Healthcare',
        smsTemplate: 'MediConnect: Reminder - Appt tomorrow at {{appointmentTime}} with Dr. {{doctorName}}. Reply HELP for info.',
    },
    '1h': {
        type: '1h',
        channel: 'sms',
        subject: 'Appointment Starting Soon',
        bodyTemplate: 'Dear {{patientName}},\n\nYour appointment with Dr. {{doctorName}} begins in approximately 1 hour at {{appointmentTime}}.\n\nPlease ensure you are ready.\n\nMediConnect Healthcare',
        smsTemplate: 'MediConnect: Your appt with Dr. {{doctorName}} starts in 1 hour ({{appointmentTime}}). Please be ready.',
    },
    'custom': {
        type: 'custom',
        channel: 'both',
        subject: 'Appointment Update',
        bodyTemplate: '{{customMessage}}',
        smsTemplate: 'MediConnect: {{customMessage}}',
    }
};

function fillTemplate(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return result;
}

// ─── Send via SNS ──────────────────────────────────────────────────────────

async function sendSNSNotification(
    region: string,
    topicArn: string | undefined,
    subject: string,
    message: string,
    smsMessage?: string,
    phoneNumber?: string,
    email?: string
): Promise<{ snsMessageId?: string; error?: string }> {
    try {
        const sns = getRegionalSNSClient(region);

        // Send to topic if available
        if (topicArn) {
            const result = await sns.send(new PublishCommand({
                TopicArn: topicArn,
                Subject: subject,
                Message: JSON.stringify({
                    default: message,
                    email: message,
                    sms: smsMessage || message.substring(0, 160),
                }),
                MessageStructure: 'json',
            }));
            return { snsMessageId: result.MessageId };
        }

        // Direct SMS if phone number provided
        if (phoneNumber && smsMessage) {
            const result = await sns.send(new PublishCommand({
                PhoneNumber: phoneNumber,
                Message: smsMessage.substring(0, 160),
                MessageAttributes: {
                    'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
                    'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: 'MediConnect' },
                }
            }));
            return { snsMessageId: result.MessageId };
        }

        return { error: 'No topic ARN or phone number provided' };
    } catch (error: any) {
        safeError('SNS send error:', { error: error.message });
        return { error: error.message };
    }
}

// ─── POST /appointments/:appointmentId/reminders ───────────────────────────

export const sendAppointmentReminder = async (req: Request, res: Response) => {
    try {
        const { appointmentId } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);
        const { type = '24h', customMessage, channel } = req.body;

        const db = getRegionalClient(region);

        // Find appointment
        const { Items: appts = [] } = await db.send(new ScanCommand({
            TableName: TABLE_APPOINTMENTS,
            FilterExpression: 'appointmentId = :aid',
            ExpressionAttributeValues: { ':aid': appointmentId },
            Limit: 1,
        }));

        if (appts.length === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        const appointment = appts[0] as any;

        // Get patient info
        let patientName = appointment.patientName || 'Patient';
        let patientPhone = '';
        let patientEmail = '';
        try {
            const { Item: patient } = await db.send(new GetCommand({
                TableName: TABLE_PATIENTS,
                Key: { id: appointment.patientId }
            }));
            if (patient) {
                patientName = patient.name || patientName;
                patientPhone = patient.phone || '';
                patientEmail = patient.email || '';
            }
        } catch { /* non-critical */ }

        // Get doctor info
        let doctorName = appointment.doctorName || 'your doctor';
        try {
            const { Item: doctor } = await db.send(new GetCommand({
                TableName: TABLE_DOCTORS,
                Key: { id: appointment.doctorId }
            }));
            if (doctor) doctorName = doctor.name || doctorName;
        } catch { /* non-critical */ }

        // Parse appointment time
        const apptDate = new Date(appointment.timeSlot || appointment.date);
        const appointmentDate = apptDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const appointmentTime = apptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        const template = REMINDER_TEMPLATES[type] || REMINDER_TEMPLATES['custom'];
        const vars = {
            patientName,
            doctorName,
            appointmentDate,
            appointmentTime,
            reason: appointment.reason || 'General Checkup',
            customMessage: customMessage || '',
        };

        const emailBody = fillTemplate(template.bodyTemplate, vars);
        const smsBody = fillTemplate(template.smsTemplate, vars);
        const subject = fillTemplate(template.subject, vars);

        // Determine channel
        const sendChannel = channel || template.channel;
        const topicArn = process.env.SNS_REMINDER_TOPIC_ARN;

        let snsResult: { snsMessageId?: string; error?: string } = {};

        if (sendChannel === 'sms' || sendChannel === 'both') {
            snsResult = await sendSNSNotification(region, topicArn, subject, emailBody, smsBody, patientPhone);
        } else if (sendChannel === 'email') {
            snsResult = await sendSNSNotification(region, topicArn, subject, emailBody);
        }

        // Store reminder record
        const reminderId = uuidv4();
        const now = new Date().toISOString();

        // Idempotency: prevent duplicate reminders of same type for same appointment
        try {
            await db.send(new PutCommand({
                TableName: TABLE_REMINDERS,
                Item: {
                    reminderId,
                    appointmentId,
                    patientId: appointment.patientId,
                    doctorId: appointment.doctorId,
                    type,
                    channel: sendChannel,
                    status: snsResult.error ? 'failed' : 'sent',
                    snsMessageId: snsResult.snsMessageId,
                    error: snsResult.error,
                    sentAt: now,
                    sentBy: user.id,
                    createdAt: now,
                    dedupKey: `${appointmentId}:${type}`
                },
                ConditionExpression: "attribute_not_exists(reminderId)"
            }));
        } catch (dedup: any) {
            if (dedup.name === 'ConditionalCheckFailedException') {
                return res.status(409).json({ error: 'Duplicate reminder', appointmentId, type });
            }
            throw dedup;
        }

        await writeAuditLog(user.id, appointment.patientId, 'SEND_REMINDER',
            `Appointment reminder sent: ${type} via ${sendChannel} for ${appointmentId}`,
            { region, reminderId, appointmentId, type, channel: sendChannel }
        );

        // Event bus: appointment reminder sent
        publishEvent(EventType.APPOINTMENT_REMINDER, { appointmentId, patientId: appointment.patientId, type, channel: sendChannel, reminderId }, region).catch(() => {});

        res.json({
            reminderId,
            status: snsResult.error ? 'failed' : 'sent',
            type,
            channel: sendChannel,
            appointmentId,
            message: snsResult.error
                ? `Reminder queued but delivery failed: ${snsResult.error}`
                : `Reminder sent successfully via ${sendChannel}`,
            snsMessageId: snsResult.snsMessageId,
        });
    } catch (error: any) {
        safeError('Send reminder error:', { error: error.message });
        res.status(500).json({ error: 'Failed to send appointment reminder' });
    }
};

// ─── GET /appointments/reminders/pending ───────────────────────────────────

export const getPendingReminders = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);

        const db = getRegionalClient(region);

        // Find appointments in the next 24 hours
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        // Scan for upcoming appointments (in production, use GSI on timeSlot)
        const { Items: appointments = [] } = await db.send(new ScanCommand({
            TableName: TABLE_APPOINTMENTS,
            FilterExpression: '#st = :confirmed',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: { ':confirmed': 'CONFIRMED' },
            Limit: 100,
        }));

        // Filter to next 24h
        const upcoming = appointments.filter((appt: any) => {
            const apptTime = new Date(appt.timeSlot || appt.date);
            return apptTime >= now && apptTime <= tomorrow;
        });

        // Check which ones already have reminders sent
        const needsReminder: any[] = [];
        for (const appt of upcoming) {
            const { Items: reminders = [] } = await db.send(new ScanCommand({
                TableName: TABLE_REMINDERS,
                FilterExpression: 'appointmentId = :aid AND #t = :type',
                ExpressionAttributeNames: { '#t': 'type' },
                ExpressionAttributeValues: {
                    ':aid': (appt as any).appointmentId,
                    ':type': '24h'
                },
                Limit: 1,
            }));

            if (reminders.length === 0) {
                needsReminder.push({
                    appointmentId: (appt as any).appointmentId,
                    patientId: (appt as any).patientId,
                    doctorId: (appt as any).doctorId,
                    timeSlot: (appt as any).timeSlot || (appt as any).date,
                    reason: (appt as any).reason,
                    reminderSent: false,
                });
            }
        }

        res.json({
            total: needsReminder.length,
            upcomingInNext24h: upcoming.length,
            pendingReminders: needsReminder,
        });
    } catch (error: any) {
        safeError('Get pending reminders error:', { error: error.message });
        res.status(500).json({ error: 'Failed to get pending reminders' });
    }
};

// ─── GET /appointments/:appointmentId/reminders ────────────────────────────

export const getAppointmentReminders = async (req: Request, res: Response) => {
    try {
        const { appointmentId } = req.params;
        const region = extractRegion(req);

        const db = getRegionalClient(region);
        const { Items = [] } = await db.send(new ScanCommand({
            TableName: TABLE_REMINDERS,
            FilterExpression: 'appointmentId = :aid',
            ExpressionAttributeValues: { ':aid': appointmentId },
        }));

        const sorted = Items.sort((a: any, b: any) =>
            new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
        );

        res.json({
            appointmentId,
            total: sorted.length,
            reminders: sorted.map((r: any) => ({
                reminderId: r.reminderId,
                type: r.type,
                channel: r.channel,
                status: r.status,
                sentAt: r.sentAt,
            }))
        });
    } catch (error: any) {
        safeError('Get appointment reminders error:', { error: error.message });
        res.status(500).json({ error: 'Failed to get reminders' });
    }
};
