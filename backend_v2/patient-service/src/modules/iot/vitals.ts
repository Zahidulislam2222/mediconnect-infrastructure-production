import { requestJurisdiction } from '../../../../shared/region-context';
import { canReadPatientClinicalData } from '../../../../shared/patient-access';
import { mapVitalObservations } from '../../../../shared/fhir-vitals';
import { projectVitalData, projectVitalAnalytics } from '../../../../shared/vital-data';
import { resolveAuthRegion } from '../../../../shared/region-context';
import { BIGQUERY_INSERT_SCOPE, BIGQUERY_INSERT_RESPONSE_KIND } from '../../../../shared/bigquery-protocol';
import { z } from 'zod';
import { Request, Response } from "express";
import { getRegionalClient } from '../../../../shared/aws-config';
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { GoogleAuth } from "google-auth-library";
import { writeAuditLog } from "../../../../shared/audit";
import { safeError } from '../../../../shared/logger';
import { createHash } from 'crypto';
import { getVitalsSettings, getPrivacyAnalyticsSettings, requiredEnv, setting } from '../../../../shared/settings';

export const getVitals = async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    try {
        // FHIR search alias: subject → patientId
        const query = z.object({
            patientId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/),
            limit: z.coerce.number().int().positive().max(getVitalsSettings().historyLimit),
        }).safeParse({ patientId: req.query.patientId || req.query.subject || req.query.patient, limit: req.query.limit ?? 1 });
        if (!query.success) return res.status(400).json({ error: 'Invalid patient or history limit' });
        const { patientId, limit } = query.data;
        const requesterId = (req as any).user?.id;
        if (!requesterId) return res.status(401).json({ error: 'Authentication required' });
        const userRegion = requestJurisdiction(req);
        if (!await canReadPatientClinicalData(req, patientId)) {
            return res.status(403).json({ error: 'Access to this patient is not authorized' });
        }

        // 🟢 ARCHITECTURE FIX: Dynamic Table Name Evaluation
        const TABLE_VITALS = setting("DYNAMO_TABLE_VITALS");
        const dynamicDb = getRegionalClient(userRegion);

        const response = await dynamicDb.send(new QueryCommand({
            TableName: TABLE_VITALS,
            KeyConditionExpression: "patientId = :pid",
            ExpressionAttributeValues: { ":pid": patientId },
            ScanIndexForward: false,
            Limit: limit
        }));

        // 🟢 HIPAA FIX: Immutable Audit Log for viewing Protected Health Information (PHI)
        await writeAuditLog(requesterId, patientId, "READ_VITALS", `Viewed ${response.Items?.length || 0} recent vitals`, { region: userRegion, ipAddress: req.ip, requirePersistence: true });

        if (!response.Items || response.Items.length === 0) {
            return res.status(404).json({
                message: "No vitals data found for this patient.",
                history: [],
                fhirBundle: { resourceType: "Bundle", type: "searchset", total: 0, entry: [] }
            });
        }

        const history = response.Items.map(row => projectVitalData(row, patientId));

        const entries = mapVitalObservations(patientId, history);
        const fhirBundle = {
            resourceType: 'Bundle', type: 'searchset', total: entries.length,
            entry: entries,
        };

        res.json({
            vitals: history[0],
            history,
            fhirBundle: fhirBundle,
            region: userRegion
        });

    } catch (err: any) {
        safeError("Vitals Error:", err.message);
        res.status(503).json({ error: "Vitals are temporarily unavailable." });
    }
};

/** Confirm the configured regional streaming insert, including row-level errors.
 * Salted identifiers remain pseudonymous patient data, not anonymized information.
 * No automatic replay: streaming insert acknowledgment is not an exactly-once guarantee.
 */
export const pushVitalToBigQuery = async (patientId: string, vitalData: unknown, regionValue: string) => {
    try {
        const region = resolveAuthRegion(regionValue);
        const data = projectVitalAnalytics(vitalData, patientId);
        const config = getPrivacyAnalyticsSettings(region);
        const pseudonym = createHash('sha256').update(patientId + requiredEnv('HIPAA_SALT')).digest('hex');
        const auth = new GoogleAuth({ scopes: [BIGQUERY_INSERT_SCOPE] });
        const client = await auth.getClient();
        const token = (await client.getAccessToken()).token;
        const projectId = await auth.getProjectId();
        if (!token || !projectId) throw new Error('IOT_ANALYTICS_AUTH_REQUIRED');
        const endpoint = config.endpoint.replace(/\/$/, '');
        const url = `${endpoint}/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(config.iotDataset)}/tables/${encodeURIComponent(config.iotTable)}/insertAll`;
        const response = await fetch(url, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ skipInvalidRows: false, ignoreUnknownValues: false,
                rows: [{ json: { data: JSON.stringify({ ...data, patientId: pseudonym, region }) } }] }),
        });
        if (!response.ok) throw new Error('IOT_ANALYTICS_HTTP_FAILURE');
        const result = z.object({ kind: z.literal(BIGQUERY_INSERT_RESPONSE_KIND),
            insertErrors: z.array(z.unknown()).optional() }).parse(await response.json());
        if (result.insertErrors?.length) throw new Error('IOT_ANALYTICS_ROW_REJECTED');
    } catch {
        // Provider response bodies, tokens and raw records must not enter operational logs.
        throw new Error('IOT_ANALYTICS_WRITE_UNCONFIRMED');
    }
};

/** The bridge awaits both delivery and its failure audit; neither means durable replay exists. */
export async function recordVitalAnalytics(patientId: string, data: unknown, regionValue: string) {
    const region = resolveAuthRegion(regionValue);
    try {
        await pushVitalToBigQuery(patientId, data, region);
    } catch {
        try {
            await writeAuditLog('SYSTEM', patientId, 'IOT_ANALYTICS_UNCONFIRMED',
                'Telemetry analytics acknowledgment failed; reconciliation required',
                { region, requirePersistence: true });
        } catch {
            throw new Error('IOT_ANALYTICS_FAILURE_AUDIT_UNAVAILABLE');
        }
        throw new Error('IOT_ANALYTICS_WRITE_UNCONFIRMED');
    }
}
