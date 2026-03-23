import { getRegionalSESClient } from './aws-config';
import { SendEmailCommand } from '@aws-sdk/client-ses';
import { safeLog, safeError } from './logger';

interface NotificationOptions {
  region: string;
  recipientEmail?: string;
  subject: string;
  message: string;
  type: 'BOOKING_CONFIRMATION' | 'BOOKING_CANCELLATION' | 'PRESCRIPTION_ISSUED' | 'PRESCRIPTION_CANCELLED' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'SHIFT_ASSIGNED' | 'SHIFT_CANCELLED' | 'TASK_ASSIGNED' | 'TASK_CANCELLED' | 'GENERAL';
  metadata?: Record<string, string>;
}

/**
 * Send a notification via SES email.
 * Non-blocking: failures are logged but never thrown.
 * Use this for user-facing notifications (booking confirmations, cancellations, etc.)
 */
export async function sendNotification(options: NotificationOptions): Promise<void> {
  try {
    if (!options.recipientEmail) {
      safeLog('Notification skipped — no recipient email', { type: options.type });
      return;
    }

    const sesClient = getRegionalSESClient(options.region);
    const senderEmail = process.env.SES_SENDER_EMAIL || 'noreply@mediconnect.health';

    await sesClient.send(new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [options.recipientEmail] },
      Message: {
        Subject: { Data: options.subject },
        Body: {
          Text: { Data: options.message },
          Html: { Data: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">${options.subject}</h2>
            <p>${options.message}</p>
            <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">This is an automated message from MediConnect. Please do not reply.</p>
          </div>` }
        }
      }
    }));

    safeLog('Notification sent', { type: options.type, subject: options.subject });
  } catch (error) {
    // Non-blocking: log and continue
    safeError('Failed to send notification', { type: options.type, error: (error as Error).message });
  }
}

