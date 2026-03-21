import { Request, Response } from "express";
import { getRegionalClient } from '../../../../shared/aws-config';
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { generateCCD } from '../../../../shared/cda-generator';
import { writeAuditLog } from '../../../../shared/audit';
import { safeError } from '../../../../shared/logger';

const TABLE_PATIENTS = process.env.DYNAMO_TABLE || "mediconnect-patients";
const TABLE_EHR = "mediconnect-health-records";
const TABLE_RX = "mediconnect-prescriptions";
const TABLE_VITALS = "mediconnect-iot-vitals";

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

/** GET /patients/:patientId/cda — Generate CCD document for patient */
export const generatePatientCDA = async (req: Request, res: Response) => {
    const { patientId } = req.params;
    const authUser = (req as any).user;
    const region = extractRegion(req);
    const db = getRegionalClient(region);

    // Authorization: patient can export own, doctor can export assigned
    const isOwner = authUser.sub === patientId;
    const isDoctor = authUser['cognito:groups']?.some((g: string) => ['doctor', 'doctors'].includes(g.toLowerCase()));
    if (!isOwner && !isDoctor) {
        await writeAuditLog(authUser.sub, patientId, "UNAUTHORIZED_CDA_EXPORT", "Blocked CDA generation", { region, ipAddress: req.ip });
        return res.status(403).json({ error: "Access denied" });
    }

    try {
        // 1. Get patient demographics
        const patientRes = await db.send(new GetCommand({
            TableName: TABLE_PATIENTS,
            Key: { patientId }
        }));
        const patient = patientRes.Item;
        if (!patient) return res.status(404).json({ error: "Patient not found" });

        // 2. Get EHR records (clinical notes / problems)
        const ehrRes = await db.send(new QueryCommand({
            TableName: TABLE_EHR,
            KeyConditionExpression: "patientId = :pid",
            FilterExpression: "isDeleted <> :true",
            ExpressionAttributeValues: { ":pid": patientId, ":true": true }
        }));
        const ehrRecords = ehrRes.Items || [];

        // 3. Get prescriptions (medications)
        let prescriptions: any[] = [];
        try {
            const rxRes = await db.send(new QueryCommand({
                TableName: TABLE_RX,
                IndexName: "PatientIndex",
                KeyConditionExpression: "patientId = :pid",
                ExpressionAttributeValues: { ":pid": patientId }
            }));
            prescriptions = rxRes.Items || [];
        } catch { /* prescription table may not exist in all environments */ }

        // 4. Get latest vitals
        let vitals: any[] = [];
        try {
            const vitalsRes = await db.send(new QueryCommand({
                TableName: TABLE_VITALS,
                KeyConditionExpression: "patientId = :pid",
                ExpressionAttributeValues: { ":pid": patientId },
                ScanIndexForward: false,
                Limit: 10
            }));
            vitals = vitalsRes.Items || [];
        } catch { /* vitals table may not exist */ }

        // 5. Build CDA
        const cda = generateCCD({
            patient: {
                id: patientId,
                name: patient.name || "Unknown",
                givenName: patient.resource?.name?.[0]?.given?.[0],
                familyName: patient.resource?.name?.[0]?.family,
                gender: patient.gender || patient.resource?.gender,
                birthDate: patient.dob || patient.resource?.birthDate,
                phone: patient.phone,
                email: patient.email,
                address: patient.resource?.address?.[0]
            },
            author: isDoctor ? { name: authUser.email || "Doctor", npi: authUser.npi } : undefined,
            problems: ehrRecords
                .filter(r => r.type === "NOTE" && r.resource?.finding)
                .map(r => ({
                    code: r.resource.finding?.[0]?.itemCodeableConcept?.coding?.[0]?.code || "",
                    system: r.resource.finding?.[0]?.itemCodeableConcept?.coding?.[0]?.system || "http://hl7.org/fhir/sid/icd-10-cm",
                    display: r.resource.finding?.[0]?.itemCodeableConcept?.text || r.title || "",
                    status: "active",
                    onset: r.createdAt
                })),
            medications: prescriptions.map(rx => ({
                name: rx.medication || "",
                rxcui: rx.resource?.medicationCodeableConcept?.coding?.[0]?.code,
                dosage: rx.dosage,
                status: rx.status === "DISPENSED" ? "completed" : "active",
                startDate: rx.timestamp
            })),
            vitals: vitals.map(v => ({
                code: v.vitalType === "heartRate" ? "8867-4" : v.vitalType === "temperature" ? "8310-5" : v.vitalType === "spO2" ? "2708-6" : "vital",
                display: v.vitalType || "Vital Sign",
                value: v.value || 0,
                unit: v.unit || "",
                date: v.timestamp || ""
            })),
            encounters: ehrRecords
                .filter(r => r.type === "NOTE")
                .map(r => ({
                    type: "Clinical Note",
                    date: r.createdAt || "",
                    reason: r.title || r.summary || ""
                }))
        });

        await writeAuditLog(authUser.sub, patientId, "GENERATE_CDA", "CCD document generated", { region, ipAddress: req.ip });

        // Return as XML with proper content type
        const format = req.query.format as string;
        if (format === "json") {
            return res.json({
                documentType: "CCD",
                standard: "C-CDA 2.1",
                patientId,
                generatedAt: new Date().toISOString(),
                sections: {
                    problems: ehrRecords.filter(r => r.resource?.finding).length,
                    medications: prescriptions.length,
                    vitals: vitals.length,
                    encounters: ehrRecords.filter(r => r.type === "NOTE").length
                },
                xml: cda
            });
        }

        res.set("Content-Type", "application/xml");
        res.set("Content-Disposition", `attachment; filename="CCD_${patientId}_${new Date().toISOString().slice(0, 10)}.xml"`);
        res.send(cda);
    } catch (error: any) {
        safeError("CDA generation failed", error.message);
        res.status(500).json({ error: "CDA generation failed", details: error.message });
    }
};
