import { Request, Response } from "express";
import { getRegionalClient } from '../../../../shared/aws-config';
import { PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { writeAuditLog } from '../../../../shared/audit';
import { safeLog, safeError } from '../../../../shared/logger';
import { v4 as uuidv4 } from "uuid";
import { publishEvent, EventType } from '../../../../shared/event-bus';

const TABLE_PATIENTS = process.env.DYNAMO_TABLE || "mediconnect-patients";
const TABLE_HL7_MESSAGES = "mediconnect-hl7-messages";
const TABLE_EHR = "mediconnect-health-records";

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

// =============================================================================
// HL7 v2.x PARSER
// =============================================================================

interface HL7Segment {
    name: string;
    fields: string[];
}

interface HL7Message {
    raw: string;
    segments: HL7Segment[];
    messageType: string;
    triggerEvent: string;
    messageControlId: string;
    sendingApplication: string;
    sendingFacility: string;
    receivingApplication: string;
    receivingFacility: string;
    timestamp: string;
    version: string;
}

function parseHL7Message(raw: string): HL7Message {
    const lines = raw.replace(/\r\n/g, "\r").replace(/\n/g, "\r").split("\r").filter(Boolean);
    if (lines.length === 0) throw new Error("Empty HL7 message");

    const segments: HL7Segment[] = lines.map(line => {
        const fields = line.split("|");
        return { name: fields[0], fields };
    });

    const msh = segments.find(s => s.name === "MSH");
    if (!msh) throw new Error("Missing MSH segment");

    // MSH fields (1-indexed per HL7 spec, but array is 0-indexed with MSH at [0])
    const messageType = msh.fields[8] || ""; // MSH.9
    const [type, trigger] = messageType.split("^");

    return {
        raw,
        segments,
        messageType: type || "",
        triggerEvent: trigger || "",
        messageControlId: msh.fields[9] || uuidv4(), // MSH.10
        sendingApplication: msh.fields[2] || "", // MSH.3
        sendingFacility: msh.fields[3] || "", // MSH.4
        receivingApplication: msh.fields[4] || "", // MSH.5
        receivingFacility: msh.fields[5] || "", // MSH.6
        timestamp: msh.fields[6] || new Date().toISOString(), // MSH.7
        version: msh.fields[11] || "2.5.1" // MSH.12
    };
}

function getSegment(msg: HL7Message, name: string): HL7Segment | undefined {
    return msg.segments.find(s => s.name === name);
}

function getField(segment: HL7Segment | undefined, index: number): string {
    if (!segment) return "";
    return segment.fields[index] || "";
}

function generateACK(msg: HL7Message, ackCode: "AA" | "AE" | "AR", errorMsg?: string): string {
    const now = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    const lines = [
        `MSH|^~\\&|MEDICONNECT|MEDICONNECT_FACILITY|${msg.sendingApplication}|${msg.sendingFacility}|${now}||ACK^${msg.triggerEvent}|${uuidv4()}|P|2.5.1`,
        `MSA|${ackCode}|${msg.messageControlId}${errorMsg ? `|${errorMsg}` : ""}`
    ];
    if (ackCode !== "AA" && errorMsg) {
        lines.push(`ERR|||207|E|${errorMsg}`);
    }
    return lines.join("\r");
}

// =============================================================================
// FHIR MAPPERS
// =============================================================================

function parsePID(msg: HL7Message): any {
    const pid = getSegment(msg, "PID");
    if (!pid) return null;

    const nameField = getField(pid, 5); // PID.5
    const [family, given, middle] = nameField.split("^");
    const dob = getField(pid, 7); // PID.7
    const gender = getField(pid, 8); // PID.8
    const address = getField(pid, 11); // PID.11
    const phone = getField(pid, 13); // PID.13
    const ssn = getField(pid, 19); // PID.19
    const patientId = getField(pid, 3); // PID.3

    const genderMap: Record<string, string> = { M: "male", F: "female", O: "other", U: "unknown" };

    return {
        resourceType: "Patient",
        id: patientId || uuidv4(),
        identifier: [
            ...(patientId ? [{ system: "urn:oid:2.16.840.1.113883.19", value: patientId }] : []),
            ...(ssn ? [{ system: "http://hl7.org/fhir/sid/us-ssn", value: ssn }] : [])
        ],
        name: [{ family, given: [given, middle].filter(Boolean), text: `${given || ""} ${family || ""}`.trim() }],
        gender: genderMap[gender?.toUpperCase()] || "unknown",
        birthDate: dob ? formatHL7Date(dob) : undefined,
        telecom: phone ? [{ system: "phone", value: phone.split("^")[0] }] : [],
        address: address ? [parseHL7Address(address)] : []
    };
}

function formatHL7Date(hl7Date: string): string {
    if (hl7Date.length >= 8) {
        return `${hl7Date.slice(0, 4)}-${hl7Date.slice(4, 6)}-${hl7Date.slice(6, 8)}`;
    }
    return hl7Date;
}

function parseHL7Address(addr: string): any {
    const parts = addr.split("^");
    return {
        line: [parts[0]].filter(Boolean),
        city: parts[2] || "",
        state: parts[3] || "",
        postalCode: parts[4] || "",
        country: parts[5] || "US"
    };
}

// ADT^A01 → FHIR Encounter + Patient
function mapADT_A01(msg: HL7Message): { patient: any; encounter: any } {
    const patient = parsePID(msg);
    const pv1 = getSegment(msg, "PV1");

    const encounter = {
        resourceType: "Encounter",
        id: uuidv4(),
        status: "in-progress",
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: getField(pv1, 2) || "IMP", display: "inpatient" },
        subject: { reference: `Patient/${patient?.id}` },
        participant: pv1 ? [{
            individual: { reference: `Practitioner/${getField(pv1, 7).split("^")[0]}`, display: getField(pv1, 7).split("^").slice(1, 3).join(" ") }
        }] : [],
        period: { start: new Date().toISOString() },
        location: pv1 ? [{ location: { display: `${getField(pv1, 3)}` } }] : [],
        hospitalization: { admitSource: { text: getField(pv1, 14) || "Routine" } }
    };

    return { patient, encounter };
}

// ADT^A03 → FHIR Encounter (discharge)
function mapADT_A03(msg: HL7Message): { patient: any; encounter: any } {
    const patient = parsePID(msg);
    const pv1 = getSegment(msg, "PV1");

    const encounter = {
        resourceType: "Encounter",
        id: uuidv4(),
        status: "finished",
        class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: getField(pv1, 2) || "IMP" },
        subject: { reference: `Patient/${patient?.id}` },
        period: { start: msg.timestamp, end: new Date().toISOString() },
        hospitalization: {
            dischargeDisposition: { text: getField(pv1, 36) || "Home" }
        }
    };

    return { patient, encounter };
}

// RDE^O11 → FHIR MedicationRequest
function mapRDE_O11(msg: HL7Message): { patient: any; medicationRequest: any } {
    const patient = parsePID(msg);
    const rxe = getSegment(msg, "RXE");
    const orc = getSegment(msg, "ORC");

    const medication = getField(rxe, 2); // RXE.2 (code^description)
    const [medCode, medDisplay] = medication.split("^");
    const dosage = getField(rxe, 3); // RXE.3
    const route = getField(rxe, 6); // RXE.6
    const refills = getField(rxe, 12); // RXE.12

    const medicationRequest = {
        resourceType: "MedicationRequest",
        id: uuidv4(),
        status: "active",
        intent: "order",
        medicationCodeableConcept: {
            coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: medCode, display: medDisplay || medCode }],
            text: medDisplay || medCode
        },
        subject: { reference: `Patient/${patient?.id}` },
        requester: orc ? { reference: `Practitioner/${getField(orc, 12).split("^")[0]}` } : undefined,
        authoredOn: new Date().toISOString(),
        dosageInstruction: [{
            text: `${dosage} via ${route}`,
            route: route ? { coding: [{ display: route }] } : undefined,
            doseAndRate: dosage ? [{ type: { text: "ordered" }, doseQuantity: { value: parseFloat(dosage) || 0 } }] : []
        }],
        dispenseRequest: {
            numberOfRepeatsAllowed: parseInt(refills) || 0
        }
    };

    return { patient, medicationRequest };
}

// RDS^O13 → FHIR MedicationDispense
function mapRDS_O13(msg: HL7Message): { patient: any; medicationDispense: any } {
    const patient = parsePID(msg);
    const rxd = getSegment(msg, "RXD");

    const medication = getField(rxd, 2); // RXD.2
    const [medCode, medDisplay] = medication.split("^");
    const quantity = getField(rxd, 4); // RXD.4
    const dispenseDate = getField(rxd, 3); // RXD.3

    const medicationDispense = {
        resourceType: "MedicationDispense",
        id: uuidv4(),
        status: "completed",
        medicationCodeableConcept: {
            coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: medCode, display: medDisplay || medCode }],
            text: medDisplay || medCode
        },
        subject: { reference: `Patient/${patient?.id}` },
        quantity: { value: parseFloat(quantity) || 0, unit: "doses" },
        whenHandedOver: dispenseDate ? formatHL7Date(dispenseDate) : new Date().toISOString(),
        type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "FF", display: "First Fill" }] }
    };

    return { patient, medicationDispense };
}

// =============================================================================
// CONTROLLERS
// =============================================================================

/** POST /hl7/receive — Main HL7 v2.x message receiver */
export const receiveHL7Message = async (req: Request, res: Response) => {
    const authUser = (req as any).user;
    const region = extractRegion(req);
    const db = getRegionalClient(region);

    // Accept both raw text and JSON-wrapped
    let rawMessage: string;
    if (typeof req.body === "string") {
        rawMessage = req.body;
    } else if (req.body.message) {
        rawMessage = req.body.message;
    } else {
        return res.status(400).json({ error: "HL7 message required (raw text or { message: '...' })" });
    }

    let msg: HL7Message;
    try {
        msg = parseHL7Message(rawMessage);
    } catch (error: any) {
        const nak = `MSH|^~\\&|MEDICONNECT|MEDICONNECT_FACILITY|||${new Date().toISOString()}||ACK|${uuidv4()}|P|2.5.1\rMSA|AR||Parse error: ${error.message}`;
        return res.status(400).json({
            ack: nak,
            error: error.message,
            ackCode: "AR"
        });
    }

    const messageId = uuidv4();
    const messageKey = `${msg.messageType}^${msg.triggerEvent}`;

    // Event bus: HL7 message received
    publishEvent(EventType.HL7_MESSAGE_RECEIVED, { messageId, messageType: messageKey, sendingFacility: msg.sendingFacility }, region).catch(() => {});

    try {
        let fhirResources: any = {};
        let processedType = "";

        switch (messageKey) {
            case "ADT^A01":
                fhirResources = mapADT_A01(msg);
                processedType = "Admit";
                break;
            case "ADT^A03":
                fhirResources = mapADT_A03(msg);
                processedType = "Discharge";
                break;
            case "RDE^O11":
                fhirResources = mapRDE_O11(msg);
                processedType = "Pharmacy Order";
                break;
            case "RDS^O13":
                fhirResources = mapRDS_O13(msg);
                processedType = "Dispense";
                break;
            default:
                const nak = generateACK(msg, "AR", `Unsupported message type: ${messageKey}`);
                // Still store for audit
                await db.send(new PutCommand({
                    TableName: TABLE_HL7_MESSAGES,
                    Item: {
                        messageId,
                        messageControlId: msg.messageControlId,
                        messageType: messageKey,
                        status: "REJECTED",
                        reason: `Unsupported: ${messageKey}`,
                        raw: rawMessage,
                        receivedAt: new Date().toISOString(),
                        region
                    }
                }));
                return res.status(422).json({ ack: nak, ackCode: "AR", error: `Unsupported: ${messageKey}` });
        }

        // Store HL7 message log
        await db.send(new PutCommand({
            TableName: TABLE_HL7_MESSAGES,
            Item: {
                messageId,
                messageControlId: msg.messageControlId,
                messageType: messageKey,
                status: "PROCESSED",
                processedType,
                fhirResources,
                sendingFacility: msg.sendingFacility,
                sendingApplication: msg.sendingApplication,
                hl7Version: msg.version,
                raw: rawMessage,
                receivedAt: new Date().toISOString(),
                region
            }
        }));

        const ack = generateACK(msg, "AA");

        await writeAuditLog(
            authUser.sub, fhirResources.patient?.id || "UNKNOWN",
            "HL7_MESSAGE_PROCESSED",
            `Type: ${messageKey}, ID: ${msg.messageControlId}, Mapped: ${processedType}`,
            { region, ipAddress: req.ip }
        );

        // Event bus: HL7 message processed
        publishEvent(EventType.HL7_MESSAGE_PROCESSED, { messageId, messageType: messageKey, processedType, patientId: fhirResources.patient?.id }, region).catch(() => {});

        safeLog(`HL7 ${messageKey} processed: ${msg.messageControlId}`);

        res.json({
            ack,
            ackCode: "AA",
            messageId,
            messageType: messageKey,
            processedType,
            fhirResources
        });
    } catch (error: any) {
        safeError("HL7 processing failed", error.message);
        const nak = generateACK(msg, "AE", error.message);
        res.status(500).json({ ack: nak, ackCode: "AE", error: error.message });
    }
};

/** GET /hl7/messages — List processed HL7 messages */
export const getHL7Messages = async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const db = getRegionalClient(region);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const messageType = req.query.type as string;

    try {
        const { Items } = await db.send(new (await import("@aws-sdk/lib-dynamodb")).ScanCommand({
            TableName: TABLE_HL7_MESSAGES,
            Limit: limit,
            ...(messageType ? {
                FilterExpression: "messageType = :type",
                ExpressionAttributeValues: { ":type": messageType }
            } : {})
        }));

        res.json({
            total: (Items || []).length,
            messages: (Items || []).map((m: any) => ({
                messageId: m.messageId,
                messageControlId: m.messageControlId,
                messageType: m.messageType,
                status: m.status,
                processedType: m.processedType,
                sendingFacility: m.sendingFacility,
                receivedAt: m.receivedAt
            }))
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

/** GET /hl7/supported — List supported HL7 message types */
export const getSupportedTypes = async (_req: Request, res: Response) => {
    res.json({
        version: "2.5.1",
        supportedMessages: [
            {
                type: "ADT^A01",
                name: "Admit/Visit Notification",
                description: "Patient admission creates FHIR Encounter + Patient resources",
                fhirMapping: ["Encounter", "Patient"]
            },
            {
                type: "ADT^A03",
                name: "Discharge/End Visit",
                description: "Patient discharge updates FHIR Encounter to finished status",
                fhirMapping: ["Encounter", "Patient"]
            },
            {
                type: "RDE^O11",
                name: "Pharmacy/Treatment Encoded Order",
                description: "Pharmacy order creates FHIR MedicationRequest",
                fhirMapping: ["MedicationRequest", "Patient"]
            },
            {
                type: "RDS^O13",
                name: "Pharmacy/Treatment Dispense",
                description: "Medication dispense creates FHIR MedicationDispense",
                fhirMapping: ["MedicationDispense", "Patient"]
            }
        ],
        endpoint: "POST /hl7/receive",
        format: "HL7 v2.x pipe-delimited (|), segments separated by \\r",
        ackFormat: "ACK^{trigger} with MSA segment (AA=accepted, AE=error, AR=rejected)"
    });
};
