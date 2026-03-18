import { Request, Response } from "express";
import { getRegionalClient, getSSMParameter } from '../../../../shared/aws-config';
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { GoogleAuth } from "google-auth-library";
import { writeAuditLog } from "../../../../shared/audit";

export const getVitals = async (req: Request, res: Response) => {
    try {
        // FHIR search alias: subject → patientId
        const patientId = (req.query.patientId || req.query.subject || req.query.patient) as string;
        const limitParam = req.query.limit as string || "1";
        const limit = parseInt(limitParam, 10);

        const requesterId = (req as any).user?.id;
        const requesterRole = (req as any).user?.role;
        const userRegion = (req as any).user?.region || (req.headers['x-user-region'] as string) || "us-east-1";

        if (!patientId) return res.status(400).json({ error: "patientId required" });

        // HIPAA: IDOR Authorization Check
        const isAuthorized = (requesterId === patientId) || (requesterRole === 'doctor' || requesterRole === 'provider');

        if (!isAuthorized) {
            await writeAuditLog(requesterId || "UNKNOWN", patientId, "UNAUTHORIZED_PHI_READ", "Attempted to read vitals without permission", { ipAddress: req.ip });
            return res.status(403).json({ error: "Access Denied: Unauthorized access to patient telemetry." });
        }

        // 🟢 ARCHITECTURE FIX: Dynamic Table Name Evaluation
        const TABLE_VITALS = process.env.DYNAMO_TABLE_VITALS || "mediconnect-iot-vitals";
        const dynamicDb = getRegionalClient(userRegion);

        const response = await dynamicDb.send(new QueryCommand({
            TableName: TABLE_VITALS,
            KeyConditionExpression: "patientId = :pid",
            ExpressionAttributeValues: { ":pid": patientId },
            ScanIndexForward: false,
            Limit: limit
        }));

        // 🟢 HIPAA FIX: Immutable Audit Log for viewing Protected Health Information (PHI)
        await writeAuditLog(requesterId, patientId, "READ_VITALS", `Viewed ${response.Items?.length || 0} recent vitals`, { region: userRegion, ipAddress: req.ip });

        if (!response.Items || response.Items.length === 0) {
            return res.status(404).json({
                message: "No vitals data found for this patient.",
                history: [],
                fhirBundle: { resourceType: "Bundle", type: "searchset", total: 0, entry: [] }
            });
        }

        const rawVitals = response.Items[0];

        // FHIR R4 MAPPING (Heart Rate, Temperature, SpO2, Blood Pressure)
        const bundleId = `vitals-${patientId}-${Date.now()}`;
        const fhirBundle = {
            resourceType: "Bundle",
            id: bundleId,
            type: "searchset",
            timestamp: new Date().toISOString(),
            total: response.Items.length,
            link: [{ relation: "self", url: `/vitals?patientId=${patientId}&limit=${limit}` }],
            entry: response.Items.flatMap((item: any) => {
                const ts = item.timestamp || item.createdAt;
                const observations: any[] = [];
                if (item.heartRate != null) {
                    observations.push({
                        fullUrl: `urn:uuid:hr-${item.vitalId || ts}`,
                        resource: { resourceType: "Observation", status: "final", category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }] }], code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }] }, subject: { reference: `Patient/${patientId}` }, effectiveDateTime: ts, issued: ts, valueQuantity: { value: item.heartRate, unit: "beats/minute", system: "http://unitsofmeasure.org", code: "/min" } }
                    });
                }
                if (item.temperature != null) {
                    observations.push({
                        fullUrl: `urn:uuid:temp-${item.vitalId || ts}`,
                        resource: { resourceType: "Observation", status: "final", category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }] }], code: { coding: [{ system: "http://loinc.org", code: "8310-5", display: "Body temperature" }] }, subject: { reference: `Patient/${patientId}` }, effectiveDateTime: ts, issued: ts, valueQuantity: { value: item.temperature, unit: "degrees Celsius", system: "http://unitsofmeasure.org", code: "Cel" } }
                    });
                }
                if (item.oxygenSaturation != null) {
                    observations.push({
                        fullUrl: `urn:uuid:spo2-${item.vitalId || ts}`,
                        resource: { resourceType: "Observation", status: "final", category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }] }], code: { coding: [{ system: "http://loinc.org", code: "2708-6", display: "Oxygen saturation" }] }, subject: { reference: `Patient/${patientId}` }, effectiveDateTime: ts, issued: ts, valueQuantity: { value: item.oxygenSaturation, unit: "%", system: "http://unitsofmeasure.org", code: "%" } }
                    });
                }
                if (observations.length === 0) {
                    observations.push({
                        fullUrl: `urn:uuid:obs-${item.vitalId || ts}`,
                        resource: { resourceType: "Observation", status: "final", category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs", display: "Vital Signs" }] }], code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }] }, subject: { reference: `Patient/${patientId}` }, effectiveDateTime: ts, issued: ts, valueQuantity: { value: item.heartRate || 0, unit: "beats/minute", system: "http://unitsofmeasure.org", code: "/min" } }
                    });
                }
                return observations;
            })
        };

        res.json({
            vitals: rawVitals,
            history: response.Items,
            fhirBundle: fhirBundle,
            region: userRegion
        });

    } catch (err: any) {
        console.error("Vitals Error:", err.message);
        res.status(500).json({ error: "Internal Server Error during vitals retrieval." });
    }
};

 /* 🟢 GDPR 2026: Regional IoT BigQuery Sync
 * Routes EU wearables to Frankfurt (iot_eu) and US wearables to Virginia (iot).
 */
export const pushVitalToBigQuery = async (patientId: string, vitalData: any, region: string) => {
    try {

        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });

        const client = await auth.getClient();
        const accessToken = (await client.getAccessToken()).token;
        const projectId = await auth.getProjectId(); // Auto-detected from WIF config

        // 🟢 DATA SOVEREIGNTY: Select Dataset based on Region
        const datasetName = region.toUpperCase() === 'EU' ? 'iot_eu' : 'iot';
        const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetName}/tables/vitals_raw/insertAll`;

        // 3. Push to BigQuery
        await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                kind: "bigquery#tableDataInsertAllRequest",
                rows: [{
                    json: {
                        data: JSON.stringify({
                            patientId: patientId,
                            timestamp: new Date().toISOString(),
                            region: region,
                            heartRate: vitalData.heartRate,
                            systolicBP: vitalData.systolicBP,
                            diastolicBP: vitalData.diastolicBP,
                            oxygenLevel: vitalData.oxygenLevel
                        })
                    }
                }]
            })
        });
        
    } catch (err: any) {
        console.error(`❌ BigQuery IoT Sync Failed [${region}]:`, err.message);
    }
};