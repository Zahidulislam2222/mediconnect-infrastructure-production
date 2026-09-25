import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getRegionalClient } from '../../shared/aws-config';
import { decryptPHI } from '../../shared/kms-crypto';
import { safeError } from '../../shared/logger';
import { sendNotification } from '../../shared/notifications';
import { setting } from '../../shared/settings';

/**
 * The patient's contact email for a notice, from their profile. Appointments and bills do not carry it, and the
 * patient service stores it KMS-encrypted, so it is decrypted with the given region's key. Undefined when the
 * patient, the profile or the email is missing; a read or decrypt failure is thrown for the caller to log.
 */
export async function patientContactEmail(
    db: ReturnType<typeof getRegionalClient>, patientId: unknown, region: string
): Promise<string | undefined> {
    if (typeof patientId !== 'string' || !patientId) return undefined;
    const stored = (await db.send(new GetCommand({
        TableName: setting("TABLE_PATIENTS"), Key: { patientId }, ProjectionExpression: 'email'
    }))).Item?.email;
    if (typeof stored !== 'string' || !stored) return undefined;
    const { email } = await decryptPHI({ email: stored }, region);
    return email || undefined;
}

/**
 * Sends a notice to the patient's profile email. A missing email or a failed lookup is logged as
 * "<label>: patient not notified (...)" and never thrown, so a notice cannot fail the work it reports.
 */
export async function notifyPatient(
    db: ReturnType<typeof getRegionalClient>, patientId: unknown, region: string, label: string,
    notice: Omit<Parameters<typeof sendNotification>[0], 'region' | 'recipientEmail'>
): Promise<void> {
    let recipientEmail: string | undefined;
    try {
        recipientEmail = await patientContactEmail(db, patientId, region);
    } catch (err: unknown) {
        safeError(`${label}: patient not notified (${err instanceof Error ? err.message : String(err)})`);
        return;
    }
    if (!recipientEmail) {
        safeError(`${label}: patient not notified (no email on profile)`);
        return;
    }
    sendNotification({ region, recipientEmail, ...notice }).catch(() => {});
}
