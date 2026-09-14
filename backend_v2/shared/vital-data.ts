import { z } from 'zod';

export const vitalPatientId = z.string().regex(/^[A-Za-z0-9.-]{1,64}$/);
const clinicalNumbers = [
    'heartRate', 'temperature', 'oxygenSaturation', 'oxygenLevel',
    'systolicBP', 'diastolicBP', 'respiratoryRate',
] as const;
const clinicalTimes = ['timestamp', 'createdAt', 'receivedAt'] as const;
const timestamp = z.string().datetime({ offset: true });
const assessment = z.enum(['NORMAL', 'WARNING', 'CRITICAL', 'UNKNOWN']);

/** Public clinical contract: do not serialize storage rows or device payloads directly. */
export function projectVitalData(raw: unknown, patientId: string): Record<string, unknown> {
    vitalPatientId.parse(patientId);
    const input = z.record(z.unknown()).parse(raw);
    if (input.patientId !== undefined && input.patientId !== patientId) throw new Error('VITAL_SUBJECT_MISMATCH');
    const output: Record<string, unknown> = { patientId };
    for (const field of clinicalNumbers) {
        const value = input[field];
        if (typeof value === 'number' && Number.isFinite(value)) output[field] = value;
    }
    for (const field of clinicalTimes) {
        const value = timestamp.safeParse(input[field]);
        if (value.success) output[field] = value.data;
    }
    const status = assessment.safeParse(input.status);
    if (status.success) output.status = status.data;
    return output;
}

/** Analytics uses observed measurement time; ingest time is not a substitute. */
export function projectVitalAnalytics(raw: unknown, patientId: string) {
    const clinical = projectVitalData(raw, patientId);
    const output: Record<string, unknown> = { timestamp: timestamp.parse(clinical.timestamp) };
    for (const field of clinicalNumbers) if (clinical[field] !== undefined) output[field] = clinical[field];
    if (Object.keys(output).length === 1) throw new Error('VITAL_MEASUREMENTS_REQUIRED');
    return output;
}
