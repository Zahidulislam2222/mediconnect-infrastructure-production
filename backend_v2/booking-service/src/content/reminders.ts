/** Patient-facing appointment reminder copy. `{{name}}` placeholders are filled once; filled-in text is never re-read. */
export type ReminderType = '24h' | '1h' | 'custom';
export type ReminderChannel = 'sms' | 'email' | 'both';

export interface ReminderTemplate {
    channel: ReminderChannel;
    subject: string;
    bodyTemplate: string;
    smsTemplate: string;
}

export const REMINDER_TEMPLATES: Record<ReminderType, ReminderTemplate> = {
    '24h': {
        channel: 'both',
        subject: 'Appointment Reminder - Tomorrow',
        bodyTemplate: 'Dear {{patientName}},\n\nThis is a reminder that you have an appointment scheduled for {{appointmentDate}} at {{appointmentTime}} with Dr. {{doctorName}}.\n\nReason: {{reason}}\n\nPlease arrive 10 minutes early. If you need to reschedule, please do so at least 2 hours before your appointment.\n\nBest regards,\nMediConnect Healthcare',
        smsTemplate: 'MediConnect: Reminder - Appt tomorrow at {{appointmentTime}} with Dr. {{doctorName}}. Reply HELP for info.',
    },
    '1h': {
        channel: 'sms',
        subject: 'Appointment Starting Soon',
        bodyTemplate: 'Dear {{patientName}},\n\nYour appointment with Dr. {{doctorName}} begins in approximately 1 hour at {{appointmentTime}}.\n\nPlease ensure you are ready.\n\nMediConnect Healthcare',
        smsTemplate: 'MediConnect: Your appt with Dr. {{doctorName}} starts in 1 hour ({{appointmentTime}}). Please be ready.',
    },
    'custom': {
        channel: 'both',
        subject: 'Appointment Update',
        bodyTemplate: '{{customMessage}}',
        smsTemplate: 'MediConnect: {{customMessage}}',
    },
};

/** Used when the profile has no readable name. */
export const REMINDER_FALLBACKS = {
    patientName: 'Patient',
    doctorName: 'your doctor',
    reason: 'General Checkup',
};

export const REMINDER_COPY = {
    notFound: 'Appointment not found',
    forbidden: 'Only the appointment\'s doctor or patient can manage its reminders',
    customForbidden: 'Only the appointment\'s doctor can send a custom message',
    pendingForbidden: 'Only doctors can list pending reminders',
    notActive: 'Reminders can only be sent for a confirmed appointment',
    duplicate: 'This reminder has already been sent or is being sent',
    sent: 'Reminder sent',
    failed: 'Reminder could not be delivered on any requested channel',
    sendError: 'Failed to send appointment reminder',
    pendingError: 'Failed to get pending reminders',
    listError: 'Failed to get reminders',
};

/** SMS longer than one segment is truncated, as before. */
export const SMS_MAX_LENGTH = 160;
