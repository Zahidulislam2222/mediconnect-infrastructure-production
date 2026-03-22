import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from 'uuid';
import { safeLog, safeError } from "./logger";
import { checkForBreach } from './breach-detection';
import { publishEvent, EventType } from './event-bus';

// 🟢 PROFESSIONAL FIX: Import from the SAME folder (shared/aws-config.ts)
// This ensures Doctor, Patient, and Booking services can all use this file.
import { getRegionalClient } from "./aws-config";

export interface AuditMetadata {
    region?: string;      // 🟢 Mandatory for GDPR Routing
    ipAddress?: string;   // HIPAA 2026 requirement
    role?: string;        // Role-based auditing
    [key: string]: any;
}

/**
 * writeAuditLog - Clinical-Grade Multi-Cloud Audit Logger
 * 🟢 GDPR 2026: Automatically routes logs to the correct regional silo.
 * 🟢 FHIR R4: Wraps the log in a standard AuditEvent resource.
 */
export const writeAuditLog = async (
    actorId: string,
    patientId: string,
    action: string,
    details: string,
    metadata?: AuditMetadata
) => {
    // 1. Identify Target Region (Default to US if not provided)
    const targetRegion = metadata?.region || "us-east-1";

    try {
        const timestamp = new Date().toISOString();
        const logId = uuidv4();
        const sevenYearsInSeconds = 7 * 365 * 24 * 60 * 60;
        const ttl = Math.floor(Date.now() / 1000) + sevenYearsInSeconds;
        
        // 2. 🟢 DYNAMIC ROUTING: Connects to Frankfurt or Virginia based on user home
        const dynamicDb = getRegionalClient(targetRegion);

        // 3. 🟢 FHIR R4 COMPLIANCE: Map to 'AuditEvent' Resource Standard
        const fhirAuditEvent = {
            resourceType: "AuditEvent",
            id: logId,
            type: { system: "http://dicom.nema.org/resources/ontology/DCM", code: "110110", display: "Patient Record" },
            action: action.includes("READ") ? "R" : action.includes("CREATE") ? "C" : "U",
            recorded: timestamp,
            outcome: "0", // Success
            agent: [{
                requestor: true,
                reference: { display: `Actor/${actorId}` },
                role: [{ text: metadata?.role || "user" }]
            }],
            source: { observer: { display: "MediConnect-Cloud-V2" } },
            entity: [{ reference: { display: `Patient/${patientId}` } }]
        };

        const item = {
            logId,
            timestamp,
            actorId: actorId || "SYSTEM",
            patientId: patientId || "UNKNOWN",
            action,
            details,
            ipAddress: metadata?.ipAddress || "0.0.0.0",
            metadata: metadata || {},
            resource: fhirAuditEvent, 
            region: targetRegion,
            ttl: ttl    
        };

        await dynamicDb.send(new PutCommand({
            TableName: "mediconnect-audit-logs",
            Item: item
        }));

        const maskedPatient = patientId && patientId.length > 8
            ? `${patientId.slice(0, 4)}****${patientId.slice(-4)}`
            : '****';
        const maskedActor = actorId && actorId.length > 8
            ? `${actorId.slice(0, 4)}****${actorId.slice(-4)}`
            : '****';
        safeLog(`[AUDIT][${targetRegion.toUpperCase()}] ${action} by Actor:${maskedActor} for Patient:${maskedPatient}`);

        // Breach detection - async fire-and-forget
        checkForBreach(actorId, action, details, targetRegion).catch(() => {});

        // Event bus - async fire-and-forget
        publishEvent(EventType.AUDIT_LOG, { actorId, patientId, action, details, logId }, targetRegion).catch(() => {});

    } catch (error: any) {
        // 🚨 HIPAA FALLBACK
        safeError("AUDIT_WRITE_FAILED_CRITICAL", {
            error: error.message,
            actorId,
            action,
            targetRegion,
            details
        });
    }
};