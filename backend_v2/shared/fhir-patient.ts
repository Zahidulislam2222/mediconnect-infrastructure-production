import { Request, Response } from 'express';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { getRegionalClient } from './aws-config';
import { decryptPHI } from './kms-crypto';
import { writeAuditLog } from './audit';
import { setting } from './settings';
import { resolveAuthRegion } from './region-context';

export function fhirOutcome(res: Response, status: number, code: string, diagnostics: string) {
  return res.status(status).type('application/fhir+json').set('Cache-Control', 'no-store').json({
    resourceType: 'OperationOutcome', issue: [{ severity: 'error', code, diagnostics }],
  });
}

export function mapPatientRead(record: Record<string, any>, id: string) {
  const birthDate = z.string().date().safeParse(record.dob);
  const gender = z.enum(['male', 'female', 'other', 'unknown']).safeParse(record.gender);
  const telecom = [['email', record.email], ['phone', record.phone]]
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([system, value]) => ({ system, value }));
  return {
    resourceType: 'Patient', id,
    ...(typeof record.name === 'string' && record.name ? { name: [{ text: record.name }] } : {}),
    ...(birthDate.success ? { birthDate: birthDate.data } : {}),
    ...(gender.success ? { gender: gender.data } : {}),
    ...(telecom.length ? { telecom } : {}),
    ...(typeof record.address === 'string' && record.address ? { address: [{ text: record.address }] } : {}),
  };
}

/** Currently supported scope: a verified patient reading their own Patient resource. */
export async function readFhirPatient(req: Request, res: Response) {
  const user = (req as any).user;
  if (!user?.id) return fhirOutcome(res, 401, 'login', 'Authentication required');
  if (user.isPatient !== true || req.params.id !== user.id) return fhirOutcome(res, 403, 'forbidden', 'This interaction supports the patient owner only');
  if (!/^[A-Za-z0-9.-]{1,64}$/.test(req.params.id)) return fhirOutcome(res, 400, 'invalid', 'Invalid FHIR resource ID');
  try {
    const region = resolveAuthRegion(user.region);
    const response = await getRegionalClient(region).send(new GetCommand({ TableName: setting('DYNAMO_TABLE'), Key: { patientId: user.id }, ConsistentRead: true }));
    if (!response.Item) return fhirOutcome(res, 404, 'not-found', 'Patient not found');
    if (response.Item.isIdentityVerified !== true || response.Item.erasure?.state === 'COMPLETED') return fhirOutcome(res, 403, 'forbidden', 'Patient access is unavailable');
    const record = response.Item;
    const clear = await decryptPHI({ name: record.name, email: record.email, phone: record.phone, dob: record.dob, address: record.address }, region);
    await writeAuditLog(user.id, user.id, 'FHIR_READ_PATIENT', 'Patient read their own FHIR resource', { region, requirePersistence: true });
    return res.type('application/fhir+json').set('Cache-Control', 'no-store').json(mapPatientRead({ ...record, ...clear }, user.id));
  } catch {
    return fhirOutcome(res, 503, 'transient', 'Patient data is temporarily unavailable');
  }
}
