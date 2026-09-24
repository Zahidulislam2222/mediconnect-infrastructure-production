import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getRegionalClient } from '../../../../shared/aws-config';
import { setting } from '../../../../shared/settings';

type AuthUser = { sub?: string; isDoctor?: boolean };
type PrescriptionOwners = { patientId?: unknown; doctorId?: unknown };

/** A doctor token alone is not enough: the practitioner record must be verified and approved. */
export async function isApprovedClinician(user: AuthUser, region: string): Promise<boolean> {
    if (user.isDoctor !== true || typeof user.sub !== 'string') return false;
    // In doctor-service, DYNAMO_TABLE is the practitioner table (loaded from the doctor_table parameter).
    const record = await getRegionalClient(region).send(new GetCommand({
        TableName: setting("DYNAMO_TABLE"),
        Key: { doctorId: user.sub },
        ProjectionExpression: "verificationStatus, isIdentityVerified",
        ConsistentRead: true,
    }));
    return record.Item?.isIdentityVerified === true && record.Item?.verificationStatus === 'APPROVED';
}

/** Only the patient named on the prescription. */
export function isPrescriptionPatient(user: AuthUser, rx: PrescriptionOwners): boolean {
    return user.isDoctor !== true && typeof user.sub === 'string' && rx.patientId === user.sub;
}

/** Only the prescribing clinician, and only while their verification remains approved. */
export async function isApprovedPrescriber(user: AuthUser, rx: PrescriptionOwners, region: string): Promise<boolean> {
    return typeof user.sub === 'string' && rx.doctorId === user.sub && await isApprovedClinician(user, region);
}

/** Prescription lists: patients see their own; clinicians see their own orders or patients in their care. */
export async function canListPrescriptions(
    user: AuthUser,
    query: { patientId?: string; doctorId?: string },
    region: string,
    graphTable: string,
): Promise<boolean> {
    if (typeof user.sub !== 'string') return false;
    if (user.isDoctor !== true) return !query.doctorId && query.patientId === user.sub;
    if (query.doctorId) return query.doctorId === user.sub && await isApprovedClinician(user, region);
    if (!query.patientId || !await isApprovedClinician(user, region)) return false;
    const relationship = await getRegionalClient(region).send(new GetCommand({
        TableName: graphTable,
        Key: { PK: `PATIENT#${query.patientId}`, SK: `DOCTOR#${user.sub}` },
        ConsistentRead: true,
    }));
    return relationship.Item?.relationship === 'isTreatedBy';
}

export const isConditionalFailure = (error: unknown): boolean =>
    ['ConditionalCheckFailedException', 'TransactionCanceledException'].includes((error as { name?: string })?.name ?? '');
