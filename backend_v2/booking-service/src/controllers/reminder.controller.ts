import { requestJurisdiction } from '../../../shared/region-context';
// ─── FEATURE #18: Appointment Reminders ────────────────────────────────────
// SMS goes directly to the patient's phone and email through the shared notifier, both read from the patient's
// KMS-encrypted profile. Nothing patient-specific is published to a shared topic. Only the appointment's doctor or
// patient may send or read its reminders; 24h and 1h reminders are claimed once per appointment before sending, only
// inside their time window, and show the time in the doctor's time zone.
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
    REMINDER_CLAIM_TIMEOUT_MS, REMINDER_COPY, REMINDER_FALLBACK_TIME_ZONE, REMINDER_FALLBACKS, REMINDER_TEMPLATES,
    REMINDER_WINDOWS, SMS_MAX_LENGTH, SMS_SENDER_ID, type ReminderChannel, type ReminderType
} from '../content/reminders';

const TABLE_APPOINTMENTS = setting("TABLE_APPOINTMENTS");
const TABLE_REMINDERS = setting("TABLE_REMINDERS");
const TABLE_PATIENTS = setting("TABLE_PATIENTS");
const TABLE_DOCTORS = setting("TABLE_DOCTORS");

type Db = ReturnType<typeof getRegionalClient>;
/** submitted: handed to the mailer, which does not report delivery. */
type Delivery = 'sent' | 'submitted' | 'failed' | 'no_contact';
interface PatientContact { patientName?: string; phone?: string; email?: string }
interface DoctorDetails { name?: string; timeZone: string }
type Channel = 'sms' | 'email';

/** Single pass, so a value containing `{{name}}` or `$&` is inserted as written. */
function fillTemplate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => vars[name] ?? '');
}

/** Plain text only: a missing value, or one still encrypted after decryption, counts as absent. */
const plain = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() && !value.startsWith('phi:') ? value : undefined;
const stored = (value: unknown): string => typeof value === 'string' ? value : '';
const errorName = (err: unknown): string => err instanceof Error ? err.name : 'UnknownError';

/** An IANA zone the runtime knows, or the fallback. */
function validTimeZone(value: unknown): string {
    if (typeof value !== 'string' || !value) return REMINDER_FALLBACK_TIME_ZONE;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return value;
    } catch {
        return REMINDER_FALLBACK_TIME_ZONE;
    }
}

/** Whether a timed reminder may be sent now for an appointment at `at`. */
function inWindow(type: Exclude<ReminderType, 'custom'>, at: number, now: number): boolean {
    const ahead = at - now;
    return Number.isFinite(ahead) && ahead > REMINDER_WINDOWS[type].minMs && ahead <= REMINDER_WINDOWS[type].maxMs;
}

/** A channel already sent or handed to the mailer by an earlier attempt is not sent again. */
const done = (delivery: unknown): delivery is Delivery => delivery === 'sent' || delivery === 'submitted';

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

/** The doctor's decrypted name and time zone; a failure only loses them, so it is logged and the fallbacks used. */
async function doctorDetails(db: Db, doctorId: unknown, region: string): Promise<DoctorDetails> {
    if (typeof doctorId !== 'string' || !doctorId) return { timeZone: REMINDER_FALLBACK_TIME_ZONE };
    try {
        const { Item } = await db.send(new GetCommand({
            TableName: TABLE_DOCTORS, Key: { doctorId },
            ProjectionExpression: '#name, #tz', ExpressionAttributeNames: { '#name': 'name', '#tz': 'timezone' },
        }));
        const name = plain((await decryptPHI({ name: stored(Item?.name) }, region)).name);
        return { name, timeZone: validTimeZone(Item?.timezone) };
    } catch (err: unknown) {
        safeError(`[REMINDER] Doctor details for ${doctorId} unavailable`, { error: errorName(err) });
        return { timeZone: REMINDER_FALLBACK_TIME_ZONE };
    }
}

/**
 * Claim a reminder before sending. A new 24h/1h reminder must not exist yet; an existing one may be claimed only when
 * it failed or its claim went stale, and only while it is still exactly the row that was read (same status and claim).
 * Returns the earlier attempt's completed deliveries, or null when the reminder is not claimable.
 */
async function claimReminder(db: Db, item: Record<string, any>, timed: boolean): Promise<Partial<Record<Channel, Delivery>> | null> {
    let previous: Record<string, any> | undefined;
    if (timed) {
        previous = (await db.send(new GetCommand({
            TableName: TABLE_REMINDERS, Key: { reminderId: item.reminderId, appointmentId: item.appointmentId },
        }))).Item;
        const staleBefore = new Date(Date.now() - REMINDER_CLAIM_TIMEOUT_MS).toISOString();
        const claimable = !previous || previous.status === 'failed'
            || (previous.status === 'sending' && typeof previous.createdAt === 'string' && previous.createdAt < staleBefore);
        if (!claimable) return null;
    }
    const prior = previous?.deliveries && typeof previous.deliveries === 'object' ? previous.deliveries : {};
    const kept: Partial<Record<Channel, Delivery>> = {};
    for (const c of ['sms', 'email'] as const) if (done(prior[c])) kept[c] = prior[c];
    try {
        await db.send(new PutCommand({
            TableName: TABLE_REMINDERS,
            Item: {
                ...item, deliveries: kept,
                ...(previous?.snsMessageId && kept.sms ? { snsMessageId: previous.snsMessageId } : {}),
            },
            ...(previous
                ? {
                    ConditionExpression: `#status = :prevStatus AND ${previous.claimId ? 'claimId = :prevClaim' : 'attribute_not_exists(claimId)'}`,
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: { ':prevStatus': previous.status, ...(previous.claimId ? { ':prevClaim': previous.claimId } : {}) },
                }
                : { ConditionExpression: 'attribute_not_exists(reminderId)' }),
        }));
    } catch (err: any) {
        if (err?.name === 'ConditionalCheckFailedException') return null;
        throw err;
    }
    return kept;
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
        const customMessage = typeof req.body?.customMessage === 'string' ? req.body.customMessage.trim() : '';
        if (type === 'custom' && !customMessage) return res.status(400).json({ error: REMINDER_COPY.customEmpty });
        const db = getRegionalClient(region);

        const appointment = await getAppointment(db, appointmentId);
        if (!appointment) return res.status(404).json({ error: REMINDER_COPY.notFound });
        const role = participant(user, appointment);
        if (!role) return res.status(403).json({ error: REMINDER_COPY.forbidden });
        if (type === 'custom' && role !== 'doctor') return res.status(403).json({ error: REMINDER_COPY.customForbidden });
        if (appointment.status !== 'CONFIRMED') return res.status(409).json({ error: REMINDER_COPY.notActive, appointmentId });
        const when = new Date(appointment.timeSlot || appointment.date);
        if (type !== 'custom' && !inWindow(type, when.getTime(), Date.now())) {
            return res.status(409).json({ error: REMINDER_COPY.outsideWindow, appointmentId, type });
        }

        // One 24h and one 1h reminder per appointment, claimed before anything is sent.
        const channel: ReminderChannel = req.body?.channel ?? template.channel;
        const reminderId = type === 'custom' ? uuidv4() : `${appointmentId}#${type}`;
        const claimId = uuidv4();
        const prior = await claimReminder(db, {
            reminderId, appointmentId, patientId: appointment.patientId, doctorId: appointment.doctorId,
            type, channel, status: 'sending', claimId, sentBy: user.id, createdAt: new Date().toISOString(),
        }, type !== 'custom');
        if (!prior) return res.status(409).json({ error: REMINDER_COPY.duplicate, appointmentId, type });

        let contact: PatientContact | undefined;
        try {
            contact = await patientContact(db, appointment.patientId, region);
        } catch (err: unknown) {
            safeError(`[REMINDER] Contact for appointment ${appointmentId} unavailable: patient not reminded`, { error: errorName(err) });
        }
        const doctor = await doctorDetails(db, appointment.doctorId, region);
        const vars = {
            patientName: contact?.patientName ?? REMINDER_FALLBACKS.patientName,
            doctorName: doctor.name ?? REMINDER_FALLBACKS.doctorName,
            appointmentDate: when.toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: doctor.timeZone,
            }),
            appointmentTime: when.toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', timeZone: doctor.timeZone, timeZoneName: 'short',
            }),
            reason: plain(appointment.reason) ?? REMINDER_FALLBACKS.reason,
            customMessage,
        };

        // A channel is "failed" when the contact could not be read, and "no_contact" when the profile has none.
        // A channel an earlier attempt already sent keeps that result and is not sent again.
        const deliveries: Partial<Record<Channel, Delivery>> = {};
        const wants = (c: Channel) => channel === c || channel === 'both';
        let snsMessageId: string | undefined;
        if (wants('sms') && prior.sms) {
            deliveries.sms = prior.sms;
        } else if (wants('sms')) {
            if (!contact?.phone) {
                deliveries.sms = contact ? 'no_contact' : 'failed';
            } else {
                try {
                    const result = await getRegionalSNSClient(region).send(new PublishCommand({
                        PhoneNumber: contact.phone,
                        Message: fillTemplate(template.smsTemplate, vars).substring(0, SMS_MAX_LENGTH),
                        MessageAttributes: {
                            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
                            'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: SMS_SENDER_ID },
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
        if (wants('email') && prior.email) {
            deliveries.email = prior.email;
        } else if (wants('email')) {
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

        // The claim is finished only by its own request (same claimId); if this write fails the claim stays and blocks
        // a duplicate until it goes stale.
        try {
            await db.send(new UpdateCommand({
                TableName: TABLE_REMINDERS, Key: { reminderId, appointmentId },
                UpdateExpression: `SET #status = :status, deliveries = :deliveries, sentAt = :sentAt${snsMessageId ? ', snsMessageId = :mid' : ''}`,
                ConditionExpression: '#status = :sending AND claimId = :claim',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':status': status, ':deliveries': deliveries, ':sentAt': new Date().toISOString(), ':sending': 'sending',
                    ':claim': claimId,
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
        const upcoming = appointments.filter(appt =>
            appt.status === 'CONFIRMED' && inWindow('24h', new Date(appt.timeSlot || appt.date).getTime(), now));

        // The 24h reminder is pending until it is sent or being sent; a failed one is pending again.
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
