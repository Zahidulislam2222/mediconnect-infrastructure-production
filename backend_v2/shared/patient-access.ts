import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from './aws-config';
import { requestJurisdiction } from './region-context';
import { setting } from './settings';

export type PatientAccessContext = {
  user?: { id?: string; region?: unknown; isDoctor?: boolean };
  headers: Record<string, unknown>;
};

export function isPatientOwner(req: PatientAccessContext, patientId: unknown): boolean {
  const user = req.user;
  return typeof patientId === 'string' && typeof user?.id === 'string' && user.id === patientId;
}

/** A signed clinician role alone never grants access to an arbitrary patient's telemetry. */
export async function canReadPatientClinicalData(req: PatientAccessContext, patientId: string): Promise<boolean> {
  const user = req.user;
  if (!user?.id) return false;
  const db = getRegionalClient(requestJurisdiction(req));
  if (!isPatientOwner(req, patientId)) {
    if (user.isDoctor !== true) return false;
    const clinician = await db.send(new GetCommand({
      TableName: setting('DYNAMO_TABLE_DOCTORS'), Key: { doctorId: user.id },
      ProjectionExpression: 'verificationStatus', ConsistentRead: true,
    }));
    if (clinician.Item?.verificationStatus !== 'APPROVED') return false;
    const relationship = await db.send(new GetCommand({
      TableName: setting('TABLE_GRAPH'),
      Key: { PK: `PATIENT#${patientId}`, SK: `DOCTOR#${user.id}` },
      ConsistentRead: true,
    }));
    if (relationship.Item?.relationship !== 'isTreatedBy') return false;
  }
  const profile = await db.send(new GetCommand({
    TableName: setting('DYNAMO_TABLE'), Key: { patientId },
    ProjectionExpression: 'isIdentityVerified, erasure', ConsistentRead: true,
  }));
  return profile.Item?.isIdentityVerified === true &&
    !['IN_PROGRESS', 'RETRY_REQUIRED', 'COMPLETED'].includes(profile.Item.erasure?.state);
}
