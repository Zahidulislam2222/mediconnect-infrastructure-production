import { requestJurisdiction } from '../../../shared/region-context';
// ─── FEATURE #18: Appointment Reminders ────────────────────────────────────
// SMS goes directly to the patient's phone and email through the shared notifier, both read from the patient's
// KMS-encrypted profile. Nothing patient-specific is published to a shared topic. Only the appointment's doctor or
// patient may send or read its reminders; 24h and 1h reminders are claimed once per appointment before sending.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PublishCommand } from '@aws-sdk/client-sns';
import { QueryCommand, ScanCommand, UpdateCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient, getRegionalSNSClient } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';
import { safeError } from '../../../shared/logger';
import { publishEvent, EventType } from '../../../shared/event-bus';
import { decryptPHI } from '../../../shared/kms-crypto';
import { sendNotification } from '../../../shared/notifications';
import { setting } from '../../../shared/settings';
import {
    REMINDER_COPY, REMINDER_FALLBACKS, REMINDER_TEMPLATES, SMS_MAX_LENGTH, type ReminderChannel, type ReminderType
} from '../content/reminders';

const TABLE_APPOINTMENTS = setting("TABLE_APPOINTMENTS");
const TABLE_REMINDERS = setting("TABLE_REMINDERS");
const TABLE_PATIENTS = setting("TABLE_PATIENTS");
const TABLE_DOCTORS = setting("TABLE_DOCTORS");
const PENDING_WINDOW_MS = 24 * 60 * 60 * 1000;

type Db = ReturnType<typeof getRegionalClient>;
/** submitted: handed to the mailer, which does not report delivery. */
type Delivery = 'sent' | 'submitted' | 'failed' | 'no_contact';
interface PatientContact { patientName?: string; phone?: string; email?: string }

/** Single pass, so a value containing `{{name}}` or `$&` is inserted as written. */
function fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => vars[name] ?? '');
}

/** Plain text only: a missing value, or one still encrypted after decryption, counts as absent. */
const plain = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() && !value.startsWith('phi:') ? value : undefined;
const stored = (value: unknown): string => typeof value === 'string' ? value : '';
const errorName = (err: unknown): string => err instanceof Error ? err.name : 'UnknownError';

/** The requester's role on this appointment, or undefined when they have none. */
function participant(user: any, appointment: any): 'doctor' | 'patient' | undefined {
    if (typeof user?.id !== 'string' || !user.id) return undefined;
    if (user.isDoctor === true) return user.id === appointment.doctorId ? 'doctor' : undefined;
    return user.id === appointment.patientId ? 'patient' : undefined;
}

/** The patient's decrypted name, phone and email. A read or decrypt failure is thrown for the caller to record. */
async function patientContact(db: Db, patientId: unknown, region: string): Promise<PatientContact> {
    if (typeof patientId !== 'string' || !patientId) return {};
    const { Item } = await db.send(new GetCommand({
        TableName: TABLE_PATIENTS, Key: { patientId },
        ProjectionExpression: '#name, phone, email', ExpressionAttributeNames: { '#name': 'name' },
    }));
    const fields = await decryptPHI({ name: stored(Item?.name), phone: stored(Item?.phone), email: stored(Item?.email) }, region);
    return { patientName: plain(fields.name), phone: plain(fields.phone), email: plain(fields.email) };
}

/** The doctor's decrypted name; a failure only loses the name, so it is logged and the generic word used. */
async function doctorName(db: Db, doctorId: unknown, region: string): Promise<string | undefined> {
    if (typeof doctorId !== 'string' || !doctorId) return undefined;
    try {
        const { Item } = await db.send(new GetCommand({
            TableName: TABLE_DOCTORS, Key: { doctorId },
            ProjectionExpression: '#name', ExpressionAttributeNames: { '#name': 'name' },
        }));
        return plain((await decryptPHI({ name: stored(Item?.name) }, region)).name);
    } catch (err: unknown) {
        safeError(`[REMINDER] Doctor name for ${doctorId} unavailable`, { error: errorName(err) });
        return undefined;
    }
}

async function getAppointment(db: Db, appointmentId: string) {
    return (await db.send(new GetCommand({ TableName: TABLE_APPOINTMENTS, Key: { appointmentId } }))).Item;
}

// ─── POST /appointments/:appointmentId/reminders ───────────────────────────

export const sendAppointmentReminder = async (req: Request, res: Response) => {
    try {
        const { appointmentId } = req.params;
        const user = (req as any).user;
        const region = requestJurisdiction(req);
        const type: ReminderType = req.body?.type ?? '24h';
        const template = REMINDER_TEMPLATES[type];
        if (!template) return res.status(400).json({ error: 'Unknown reminder type' });
        const db = getRegionalClient(region);

        const appointment = await getAppointment(db, appointmentId);
        if (!appointment) return res.status(404).json({ error: REMINDER_COPY.notFound });
        const role = participant(user, appointment);
        if (!role) return res.status(403).json({ error: REMINDER_COPY.forbidden });
        if (type === 'custom' && role !== 'doctor') return res.status(403).json({ error: REMINDER_COPY.customForbidden });
        if (appointment.status !== 'CONFIRMED') return res.status(409).json({ error: REMINDER_COPY.notActive, appointmentId });

        // One 24h and one 1h reminder per appointment: claimed before anything is sent. A failed one may be claimed again.
        const channel: ReminderChannel = req.body?.channel ?? template.channel;
        const reminderId = type === 'custom' ? uuidv4() : `${appointmentId}#${type}`;
        const now = new Date().toISOString();
        try {
            await db.send(new PutCommand({
                TableName: TABLE_REMINDERS,
                Item: {
                    reminderId, appointmentId, patientId: appointment.patientId, doctorId: appointment.doctorId,
                    type, channel, status: 'sending', sentBy: user.id, createdAt: now,
                },
                ConditionExpression: 'attribute_not_exists(reminderId) OR #status = :failed',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: { ':failed': 'failed' },
            }));
        } catch (err: any) {
            if (err?.name === 'ConditionalCheckFailedException') {
                return res.status(409).json({ error: REMINDER_COPY.duplicate, appointmentId, type });
            }
            throw err;
        }

        let contact: PatientContact | undefined;
        try {
            contact = await patientContact(db, appointment.patientId, region);
        } catch (err: unknown) {
            safeError(`[REMINDER] Contact for appointment ${appointmentId} unavailable: patient not reminded`, { error: errorName(err) });
        }
        const when = new Date(appointment.timeSlot || appointment.date);
        const vars = {
            patientName: contact?.patientName ?? REMINDER_FALLBACKS.patientName,
            doctorName: (await doctorName(db, appointment.doctorId, region)) ?? REMINDER_FALLBACKS.doctorName,
            appointmentDate: when.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            appointmentTime: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            reason: plain(appointment.reason) ?? REMINDER_FALLBACKS.reason,
            customMessage: typeof req.body?.customMessage === 'string' ? req.body.customMessage : '',
        };

        // A channel is "failed" when the contact could not be read, and "no_contact" when the profile has none.
        const deliveries: Partial<Record<'sms' | 'email', Delivery>> = {};
        let snsMessageId: string | undefined;
        if (channel === 'sms' || channel === 'both') {
            if (!contact?.phone) {
                deliveries.sms = contact ? 'no_contact' : 'failed';
            } else {
                try {
                    const result = await getRegionalSNSClient(region).send(new PublishCommand({
                        PhoneNumber: contact.phone,
                        Message: fillTemplate(template.smsTemplate, vars).substring(0, SMS_MAX_LENGTH),
                        MessageAttributes: {
                            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
                            'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: 'MediConnect' },
                        },
                    }));
                    snsMessageId = result.MessageId;
                    deliveries.sms = result.MessageId ? 'sent' : 'failed';
                } catch (err: unknown) {
                    safeError(`[REMINDER] SMS for appointment ${appointmentId} failed`, { error: errorName(err) });
                    deliveries.sms = 'failed';
                }
            }
        }
        if (channel === 'email' || channel === 'both') {
            if (!contact?.email) {
                deliveries.email = contact ? 'no_contact' : 'failed';
            } else {
                sendNotification({
                    region, recipientEmail: contact.email, type: 'GENERAL', metadata: { appointmentId },
                    subject: fillTemplate(template.subject, vars), message: fillTemplate(template.bodyTemplate, vars),
                }).catch(() => {});
                deliveries.email = 'submitted';
            }
        }
        const attempted = Object.values(deliveries).some(d => d === 'sent' || d === 'submitted');
        const status = deliveries.sms === 'failed' || !attempted ? 'failed' : 'sent';

        // The claim is finished only by its own request; if this write fails the claim stays and blocks a duplicate.
        try {
            await db.send(new UpdateCommand({
                TableName: TABLE_REMINDERS, Key: { reminderId, appointmentId },
                UpdateExpression: `SET #status = :status, deliveries = :deliveries, sentAt = :sentAt${snsMessageId ? ', snsMessageId = :mid' : ''}`,
                ConditionExpression: '#status = :sending',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': status, ':deliveries': deliveries, ':sentAt': new Date().toISOString(), ':sending': 'sending',
                    ...(snsMessageId ? { ':mid': snsMessageId } : {}),
                },
            }));
        } catch (err: unknown) {
            safeError(`[REMINDER] Outcome of reminder ${reminderId} not recorded`, { error: errorName(err) });
        }

        try {
            await writeAuditLog(user.id, appointment.patientId, 'SEND_REMINDER',
                `Appointment reminder ${status}: ${type} via ${channel} for ${appointmentId}`,
                { region, reminderId, appointmentId, type, channel }
            );
        } catch (err: unknown) {
            safeError(`[REMINDER] Audit of reminder ${reminderId} failed`, { error: errorName(err) });
        }
        publishEvent(EventType.APPOINTMENT_REMINDER, { appointmentId, patientId: appointment.patientId, type, channel, reminderId }, region).catch(() => {});

        res.json({
            reminderId, status, type, channel, appointmentId, deliveries, snsMessageId,
            message: status === 'sent' ? REMINDER_COPY.sent : REMINDER_COPY.failed,
        });
    } catch (error: unknown) {
        safeError('Send reminder error:', { error: errorName(error) });
        res.status(500).json({ error: REMINDER_COPY.sendError });
    }
};

// ─── GET /appointments/reminders/pending ───────────────────────────────────

export const getPendingReminders = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = requestJurisdiction(req);
        if (user?.isDoctor !== true || typeof user.id !== 'string' || !user.id) {
            return res.status(403).json({ error: REMINDER_COPY.pendingForbidden });
        }
        const db = getRegionalClient(region);

        // Only the requesting doctor's appointments, every page.
        const appointments: any[] = [];
        let startKey: Record<string, any> | undefined;
        do {
            const page = await db.send(new QueryCommand({
                TableName: TABLE_APPOINTMENTS, IndexName: 'DoctorIndex',
                KeyConditionExpression: 'doctorId = :did', ExpressionAttributeValues: { ':did': user.id },
                ExclusiveStartKey: startKey,
            }));
            appointments.push(...(page.Items ?? []));
            startKey = page.LastEvaluatedKey;
        } while (startKey);

        const now = Date.now();
        const upcoming = appointments.filter(appt => {
            const at = new Date(appt.timeSlot || appt.date).getTime();
            return appt.status === 'CONFIRMED' && at >= now && at <= now + PENDING_WINDOW_MS;
        });

        // A 24h reminder that is sent or being sent is not pending; a failed one is.
        const needsReminder: any[] = [];
        for (const appt of upcoming) {
            const { Item: reminder } = await db.send(new GetCommand({
                TableName: TABLE_REMINDERS, Key: { reminderId: `${appt.appointmentId}#24h`, appointmentId: appt.appointmentId },
            }));
            if (!reminder || reminder.status === 'failed') {
                needsReminder.push({
                    appointmentId: appt.appointmentId,
                    patientId: appt.patientId,
                    doctorId: appt.doctorId,
                    timeSlot: appt.timeSlot || appt.date,
                    reason: plain(appt.reason),
                    reminderSent: false,
                });
            }
        }

        res.json({ total: needsReminder.length, upcomingInNext24h: upcoming.length, pendingReminders: needsReminder });
    } catch (error: unknown) {
        safeError('Get pending reminders error:', { error: errorName(error) });
        res.status(500).json({ error: REMINDER_COPY.pendingError });
    }
};

// ─── GET /appointments/:appointmentId/reminders ────────────────────────────

export const getAppointmentReminders = async (req: Request, res: Response) => {
    try {
        const { appointmentId } = req.params;
        const region = requestJurisdiction(req);
        const db = getRegionalClient(region);

        const appointment = await getAppointment(db, appointmentId);
        if (!appointment) return res.status(404).json({ error: REMINDER_COPY.notFound });
        if (!participant((req as any).user, appointment)) return res.status(403).json({ error: REMINDER_COPY.forbidden });

        // The reminders table is keyed by reminderId, so an appointment's reminders need a scan; every page is read.
        const items: any[] = [];
        let startKey: Record<string, any> | undefined;
        do {
            const page = await db.send(new ScanCommand({
                TableName: TABLE_REMINDERS,
                FilterExpression: 'appointmentId = :aid',
                ExpressionAttributeValues: { ':aid': appointmentId },
                ExclusiveStartKey: startKey,
            }));
            items.push(...(page.Items ?? []));
            startKey = page.LastEvaluatedKey;
        } while (startKey);

        const at = (r: any) => new Date(r.sentAt || r.createdAt).getTime() || 0;
        const sorted = items.sort((a, b) => at(b) - at(a));
        res.json({
            appointmentId,
            total: sorted.length,
            reminders: sorted.map((r: any) => ({
                reminderId: r.reminderId,
                type: r.type,
                channel: r.channel,
                status: r.status,
                deliveries: r.deliveries,
                sentAt: r.sentAt,
            })),
        });
    } catch (error: unknown) {
        safeError('Get appointment reminders error:', { error: errorName(error) });
        res.status(500).json({ error: REMINDER_COPY.listError });
    }
};
