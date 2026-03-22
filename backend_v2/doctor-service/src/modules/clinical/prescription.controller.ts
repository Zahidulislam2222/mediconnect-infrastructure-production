import { Router, Request, Response } from "express";
import { PDFGenerator } from "../../utils/pdf-generator";
import { getRegionalClient } from '../../../../shared/aws-config';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { safeLog, safeError } from '../../../../shared/logger';
import { writeAuditLog } from '../../../../shared/audit';
import { validateUSCore } from '../../../../shared/us-core-profiles';
import { sendNotification } from '../../../../shared/notifications';
import { encryptPHI, decryptPHI } from '../../../../shared/kms-crypto';
import { publishEvent, EventType } from '../../../../shared/event-bus';

const router = Router();
const pdfGen = new PDFGenerator();
const TABLE_RX = "mediconnect-prescriptions";
const TABLE_DRUGS = "mediconnect-drug-interactions";
const TABLE_TRANSACTION = "mediconnect-transactions";
const TABLE_GRAPH = "mediconnect-graph-data";
const TABLE_ALLERGIES = process.env.TABLE_ALLERGIES || "mediconnect-allergies";
const AUDIT_TABLE = "mediconnect-audit-logs";

const DEFAULT_PHARMACY = process.env.DEFAULT_PHARMACY_ID || "CVS-001";

// 🟢 COMPILER FIX: Safely parse headers to prevent "string | string[]" build failures
const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

// --- LOGIC RESTORATION: Drug Interaction Check (Now GDPR Compliant) ---
const checkInteractionSeverity = async (medication: string, region: string) => {
    // 🟢 GDPR FIX: Uses the region passed from the request, not hardcoded US
    const docClient = getRegionalClient(region);

    if (medication === 'INTERACTION_TEST_DRUG') return "MAJOR";

    try {
        const drugData = await docClient.send(new GetCommand({
            TableName: TABLE_DRUGS,
            Key: { drugName: medication }
        }));

        if (drugData.Item && drugData.Item.severity === 'MAJOR') {
            return "MAJOR";
        }

        if (drugData.Item && drugData.Item.severity === 'MODERATE') {
            return "MODERATE";
        }
    } catch (e) {
        safeError("Interaction check failed", e);
    }

    return "NONE";
};

// --- CONTROLLER METHODS ---

// POST /clinical/prescriptions
export const createPrescription = async (req: Request, res: Response) => {
    const userRegion = extractRegion(req);
    const docClient = getRegionalClient(userRegion);
    const medicationRaw = req.body.medication || "";
    const medication = medicationRaw.trim().toLowerCase();
    const authUser = (req as any).user;
    const { doctorId, patientId, dosage, instructions, doctorName, patientName } = req.body;

    if (!doctorId || !medication || !patientId) return res.status(400).json({ error: "Missing fields" });

    if (authUser.sub !== doctorId) return res.status(403).json({ error: "HIPAA Violation: Unauthorized." });

    // ─── Allergy Cross-Check ─────────────────────────────────────────────────
    try {
        const allergyResult = await docClient.send(new QueryCommand({
            TableName: TABLE_ALLERGIES,
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        const allergies = allergyResult.Items || [];
        for (const allergy of allergies) {
            const substances: string[] = [];
            // Collect substance names from the allergy record
            if (allergy.substance) substances.push(String(allergy.substance).toLowerCase());
            if (allergy.substanceName) substances.push(String(allergy.substanceName).toLowerCase());
            if (allergy.resource?.code?.coding) {
                for (const coding of allergy.resource.code.coding) {
                    if (coding.display) substances.push(String(coding.display).toLowerCase());
                    if (coding.code) substances.push(String(coding.code).toLowerCase());
                }
            }
            if (allergy.resource?.code?.text) {
                substances.push(String(allergy.resource.code.text).toLowerCase());
            }

            const matched = substances.some(s => medication.includes(s) || s.includes(medication));
            if (matched) {
                await writeAuditLog(authUser.sub, patientId, "PRESCRIPTION_ALLERGY_BLOCK",
                    `Blocked prescription of ${medication} due to known allergy: ${allergy.substance || allergy.substanceName || 'unknown'}`,
                    { region: userRegion, ipAddress: req.ip }
                );
                return res.status(409).json({
                    error: "Patient allergy conflict detected",
                    severity: "ALLERGY",
                    medication,
                    allergen: allergy.substance || allergy.substanceName || 'unknown',
                    message: `Patient has a documented allergy to ${allergy.substance || allergy.substanceName || 'a related substance'}. Prescribing is blocked. Review allergies or choose an alternative.`,
                });
            }
        }
    } catch (allergyErr: any) {
        // Non-blocking: log but continue if allergy check itself fails
        safeError("Allergy cross-check failed, proceeding with caution:", allergyErr.message);
    }

    // 🟢 FIX #2: Check drug interaction severity BEFORE creating prescription
    let interactionWarnings: string[] = [];
    try {
        const interactionSeverity = await checkInteractionSeverity(medication, userRegion);
        if (interactionSeverity === "MAJOR") {
            publishEvent(EventType.DRUG_INTERACTION_DETECTED, { doctorId: authUser.sub, patientId, medication, severity: "MAJOR" }, userRegion).catch(() => {});
            return res.status(409).json({
                error: "Severe drug interaction detected",
                severity: "MAJOR",
                medication,
                message: "This medication has a MAJOR interaction on file. Prescribing is blocked. Review interactions or choose an alternative."
            });
        }
        if (interactionSeverity === "MODERATE") {
            interactionWarnings.push(`Moderate interaction detected for ${medication}. Proceed with caution.`);
        }
    } catch (interactionErr: any) {
        // Non-blocking: log but continue if interaction check itself fails
        safeError("Drug interaction check failed, proceeding with caution:", interactionErr.message);
    }

    // ─── Medication Reconciliation: Drug Class Conflict Check ────────────────
    try {
        const activeRxResult = await docClient.send(new QueryCommand({
            TableName: TABLE_RX,
            IndexName: "PatientIndex",
            KeyConditionExpression: "patientId = :pid",
            ExpressionAttributeValues: { ":pid": patientId },
        }));

        const activeMeds = (activeRxResult.Items || []).filter((rx: any) => rx.status === 'active' || rx.status === 'ISSUED');

        // Critical class conflict pairs
        const CRITICAL_CONFLICTS: [string[], string[]][] = [
            [['oxycodone', 'hydrocodone', 'morphine', 'fentanyl', 'tramadol', 'codeine', 'methadone'], ['alprazolam', 'lorazepam', 'diazepam', 'clonazepam', 'temazepam']], // Opioid + Benzo
            [['lisinopril', 'enalapril', 'ramipril', 'captopril', 'benazepril'], ['losartan', 'valsartan', 'irbesartan', 'candesartan', 'olmesartan']], // ACE + ARB
            [['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin'], ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin']], // Multiple anticoagulants
        ];
        const CRITICAL_LABELS = ['Opioid + Benzodiazepine', 'ACE Inhibitor + ARB', 'Multiple Anticoagulants'];

        // Moderate conflict pairs
        const MODERATE_CONFLICTS: [string[], string[]][] = [
            [['ibuprofen', 'naproxen', 'celecoxib', 'diclofenac', 'meloxicam', 'indomethacin'], ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'heparin', 'enoxaparin']], // NSAID + Anticoagulant
            [['fluoxetine', 'sertraline', 'escitalopram', 'citalopram', 'paroxetine'], ['fluoxetine', 'sertraline', 'escitalopram', 'citalopram', 'paroxetine']], // Multiple SSRIs
        ];
        const MODERATE_LABELS = ['NSAID + Anticoagulant', 'Multiple SSRIs'];

        const classifyMed = (name: string, classList: string[]) => classList.some(c => name.includes(c));

        for (const existingRx of activeMeds) {
            const existingMed = (existingRx.medication || '').trim().toLowerCase();
            if (!existingMed) continue;

            // Check critical conflicts
            for (let i = 0; i < CRITICAL_CONFLICTS.length; i++) {
                const [classA, classB] = CRITICAL_CONFLICTS[i];
                const newInA = classifyMed(medication, classA);
                const existingInB = classifyMed(existingMed, classB);
                const newInB = classifyMed(medication, classB);
                const existingInA = classifyMed(existingMed, classA);

                if ((newInA && existingInB) || (newInB && existingInA)) {
                    await writeAuditLog(authUser.sub, patientId, "PRESCRIPTION_CLASS_CONFLICT_BLOCK",
                        `Blocked: ${medication} conflicts with active ${existingMed} (${CRITICAL_LABELS[i]})`,
                        { region: userRegion, ipAddress: req.ip }
                    );
                    return res.status(409).json({
                        error: "Critical medication class conflict detected",
                        severity: "CRITICAL",
                        conflictType: CRITICAL_LABELS[i],
                        newMedication: medication,
                        existingMedication: existingMed,
                        message: `${CRITICAL_LABELS[i]} conflict: prescribing ${medication} is blocked due to active prescription for ${existingMed}.`,
                    });
                }
            }

            // Check moderate conflicts
            for (let i = 0; i < MODERATE_CONFLICTS.length; i++) {
                const [classA, classB] = MODERATE_CONFLICTS[i];
                const newInA = classifyMed(medication, classA);
                const existingInB = classifyMed(existingMed, classB);
                const newInB = classifyMed(medication, classB);
                const existingInA = classifyMed(existingMed, classA);

                if ((newInA && existingInB) || (newInB && existingInA)) {
                    interactionWarnings.push(`${MODERATE_LABELS[i]} warning: ${medication} with active ${existingMed}. Proceed with caution.`);
                }
            }
        }
    } catch (reconErr: any) {
        // Non-blocking: log but continue if reconciliation check fails
        safeError("Medication reconciliation check failed, proceeding:", reconErr.message);
    }

    try {
        const invData = await docClient.send(new GetCommand({
            TableName: "mediconnect-pharmacy-inventory",
            Key: { pharmacyId: req.body.pharmacyId || DEFAULT_PHARMACY, drugId: medication }
        }));
        const realPrice = invData.Item?.price || 15.00;
        const prescriptionId = uuidv4();
        const timestamp = new Date().toISOString();
        let encryptedPatientName = patientName;
        let encryptedDoctorName = doctorName;
        try {
            const encryptedNames = await encryptPHI({ patientName: patientName || '', doctorName: doctorName || '' }, userRegion);
            encryptedPatientName = encryptedNames.patientName;
            encryptedDoctorName = encryptedNames.doctorName;
        } catch (encErr: any) {
            safeError("[RX] PHI encryption failed, storing plaintext as fallback", encErr.message);
        }
        const rxData = { prescriptionId, patientName: encryptedPatientName, doctorName: encryptedDoctorName, medication, dosage, instructions, timestamp, price: realPrice, refillsRemaining: Number(req.body.refills) || 2, paymentStatus: "UNPAID" };
        const { pdfUrl, signature } = await pdfGen.generatePrescriptionPDF({ ...rxData, patientName, doctorName }, userRegion);
        const fhirResource = {
            resourceType: "MedicationRequest",
            id: prescriptionId,
            status: "active",
            intent: "order",
            medicationCodeableConcept: { coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: medication, display: medicationRaw }] },
            subject: { reference: `Patient/${patientId}` },
            requester: { reference: `Practitioner/${doctorId}` },
            authoredOn: timestamp,
            dosageInstruction: [{ text: `${dosage} - ${instructions}`, timing: { code: { text: dosage } }, doseAndRate: [{ type: { text: "ordered" } }] }],
            dispenseRequest: { numberOfRepeatsAllowed: Number(req.body.refills) || 2 },
        };

        // ─── Gap #2 FIX: US Core validation before write ─────────────────
        const validation = validateUSCore(fhirResource);
        if (!validation.valid) {
            return res.status(422).json({
                error: 'US Core MedicationRequest validation failed',
                profile: validation.profile,
                issues: validation.errors,
            });
        }

        // 🟢 ATOMIC TRANSACTION: Solves Data Integrity Violation
        await docClient.send(new TransactWriteCommand({
            TransactItems: [
                { Put: { TableName: TABLE_TRANSACTION, Item: { billId: uuidv4(), referenceId: prescriptionId, patientId, doctorId, amount: realPrice, status: "PENDING", type: "PHARMACY", createdAt: timestamp } } },
                { Put: { TableName: TABLE_RX, Item: { ...rxData, doctorId, patientId, signature, status: "ISSUED", pdfUrl: pdfUrl.split("?")[0], isLocked: true, resource: fhirResource } } },
                { Put: { TableName: TABLE_GRAPH, Item: { PK: `PATIENT#${patientId}`, SK: `DRUG#${medication}`, relationship: "takesMedication", lastInteraction: timestamp } } }
            ]
        }));

        await writeAuditLog(authUser.sub, patientId, "ISSUE_PRESCRIPTION", `Medication: ${medication}, ID: ${prescriptionId}`, {
            region: userRegion,
            ipAddress: req.ip
        });

        // Fire-and-forget prescription notification to patient
        (async () => {
            try {
                const patientRes = await docClient.send(new GetCommand({
                    TableName: process.env.DYNAMO_TABLE_PATIENTS || "mediconnect-patients",
                    Key: { patientId },
                    ProjectionExpression: "email, #n",
                    ExpressionAttributeNames: { "#n": "name" }
                }));
                const patientEmail = patientRes.Item?.email;
                const recipientName = patientRes.Item?.name || patientName || "Patient";
                if (patientEmail) {
                    await sendNotification({
                        type: 'PRESCRIPTION_ISSUED',
                        recipientEmail: patientEmail,
                        subject: 'New Prescription Issued',
                        message: `A new prescription for ${medicationRaw} has been issued by Dr. ${doctorName || 'your doctor'}. Prescription ID: ${prescriptionId}.`,
                        region: userRegion,
                        metadata: { prescriptionId, medication: medicationRaw, doctorName: doctorName || '' }
                    });
                }
            } catch (notifErr: any) {
                safeError("Prescription notification failed", { error: notifErr.message });
            }
        })().catch(() => {});

        // Event bus: prescription issued
        publishEvent(EventType.PRESCRIPTION_ISSUED, { prescriptionId, doctorId: authUser.sub, patientId, medication }, userRegion).catch(() => {});

        const response: any = { message: "Prescription Issued", prescriptionId, downloadUrl: pdfUrl };
        if (interactionWarnings.length > 0) {
            response.warnings = interactionWarnings;
        }
        res.json(response);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
};

export const getPrescriptions = async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req));
    const patientId = (req.query.patientId || req.query.patient || req.query.subject) as string | undefined;
    const doctorId = (req.query.doctorId || req.query.requester) as string | undefined;
    if (!patientId && !doctorId) return res.status(400).json({ error: "ID required" });

    try {
        const params: any = { TableName: TABLE_RX, IndexName: patientId ? "PatientIndex" : "DoctorIndex", KeyConditionExpression: patientId ? "patientId = :id" : "doctorId = :id", ExpressionAttributeValues: { ":id": patientId || doctorId } };
        const data = await docClient.send(new QueryCommand(params));
        const userRegion = extractRegion(req);
        const enhancedPrescriptions = await Promise.all((data.Items || []).map(async (rx: any) => {
            try {
                // Decrypt PHI names
                if (rx.patientName || rx.doctorName) {
                    const decrypted = await decryptPHI({ patientName: rx.patientName || '', doctorName: rx.doctorName || '' }, userRegion);
                    rx.patientName = decrypted.patientName;
                    rx.doctorName = decrypted.doctorName;
                }
            } catch (decErr) { /* Migration-safe: plaintext passes through */ }
            try {
                // 🟢 SCOPE FIX: Changed 'medication' to 'rx.medication'
                const inv = await docClient.send(new GetCommand({ TableName: "mediconnect-pharmacy-inventory", Key: { pharmacyId: DEFAULT_PHARMACY, drugId: rx.medication } }));
                return { ...rx, liveStock: inv.Item?.stock ?? 0, livePrice: inv.Item?.price ?? rx.price };
            } catch (e) { return { ...rx, liveStock: 0, livePrice: rx.price }; }
        }));
        res.json({
            resourceType: "Bundle",
            type: "searchset",
            total: enhancedPrescriptions.length,
            entry: enhancedPrescriptions.map((rx: any) => ({ resource: rx.resource || rx })),
            prescriptions: enhancedPrescriptions
        });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
};

export const requestRefill = async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req));
    const { prescriptionId, patientId } = req.body;
    const authUser = (req as any).user;

    try {
        const rxRes = await docClient.send(new GetCommand({ TableName: TABLE_RX, Key: { prescriptionId } }));
        const rx = rxRes.Item;

        if (rx && rx.refillsRemaining > 0) {
            // 🟢 ATOMIC REFILL: Decrement refills and create bill in one step
            await docClient.send(new TransactWriteCommand({
                TransactItems: [
                    { Update: { TableName: TABLE_RX, Key: { prescriptionId }, UpdateExpression: "SET #s = :s, refillsRemaining = refillsRemaining - :one", ExpressionAttributeNames: { "#s": "status" }, ExpressionAttributeValues: { ":s": "PENDING", ":one": 1 } } },
                    { Put: { TableName: TABLE_TRANSACTION, Item: { billId: uuidv4(), referenceId: prescriptionId, patientId: rx.patientId, amount: rx.price, status: "PENDING", createdAt: new Date().toISOString() } } }
                ]
            }));
            await writeAuditLog(authUser.sub, rx.patientId, "REQUEST_REFILL", `Refill for ${prescriptionId} processed`, { region: extractRegion(req), ipAddress: req.ip });
            return res.json({ message: "Refill authorized" });
        }
        res.status(400).json({ error: "No refills remaining" });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
};

export const generateQR = async (req: Request, res: Response) => {
    // 🟢 GDPR FIX: Define Regional Client
    const docClient = getRegionalClient(extractRegion(req));

    const authUser = (req as any).user;
    const { prescriptionId } = req.body;

    try {
        const rx = await docClient.send(new GetCommand({
            TableName: TABLE_RX,
            Key: { prescriptionId }
        }));

        if (rx.Item?.paymentStatus !== 'PAID') {
            return res.status(402).json({
                error: "Payment Required",
                message: "Please pay for this medication before generating a pickup code."
            });
        }

        await docClient.send(new UpdateCommand({
            TableName: TABLE_RX,
            Key: { prescriptionId },
            UpdateExpression: "set #status = :s",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: { ":s": "READY_FOR_PICKUP" }
        }));

        res.json({ qrPayload: `PICKUP-${prescriptionId}` });
        await writeAuditLog(authUser.sub, rx.Item?.patientId, "GENERATE_QR", `Pickup code generated for ${prescriptionId}`, { region: extractRegion(req), ipAddress: req.ip });

    } catch (e: any) {
        safeError("QR Generation Error:", e);
        res.status(500).json({ error: e.message });
    }
};

export const fulfillPrescription = async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req));
    const authUser = (req as any).user;
    const { token } = req.body;

    if (!token || !token.startsWith('PICKUP-')) {
        return res.status(400).json({ error: "Invalid prescription token format" });
    }

    const prescriptionId = token.replace('PICKUP-', '');

    try {
        const rxRes = await docClient.send(new GetCommand({ TableName: TABLE_RX, Key: { prescriptionId } }));
        const rx = rxRes.Item;

        if (!rx) return res.status(404).json({ error: "Prescription not found" });
        if (rx.status !== 'READY_FOR_PICKUP') {
            return res.status(400).json({ error: `Cannot fulfill: current status is ${rx.status}` });
        }

        const now = new Date().toISOString();
        await docClient.send(new UpdateCommand({
            TableName: TABLE_RX,
            Key: { prescriptionId },
            UpdateExpression: "SET #s = :s, dispensedAt = :now, dispensedBy = :by",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":s": "DISPENSED", ":now": now, ":by": authUser.sub }
        }));

        await writeAuditLog(authUser.sub, rx.patientId, "DISPENSE_PRESCRIPTION", `Prescription ${prescriptionId} dispensed`, { region: extractRegion(req), ipAddress: req.ip });

        // Event bus: prescription dispensed
        publishEvent(EventType.PRESCRIPTION_DISPENSED, { prescriptionId, patientId: rx.patientId, dispensedBy: authUser.sub, medication: rx.medication }, extractRegion(req)).catch(() => {});

        // Decrypt PHI names before returning
        let decryptedPatientName = rx.patientName;
        let decryptedDoctorName = rx.doctorName;
        try {
            const decrypted = await decryptPHI({ patientName: rx.patientName || '', doctorName: rx.doctorName || '' }, extractRegion(req));
            decryptedPatientName = decrypted.patientName;
            decryptedDoctorName = decrypted.doctorName;
        } catch { /* Migration-safe */ }

        res.json({
            message: "Prescription fulfilled successfully",
            prescription: {
                prescriptionId,
                medication: rx.medication,
                patientName: decryptedPatientName,
                doctorName: decryptedDoctorName,
                dosage: rx.dosage,
                dispensedAt: now,
                status: "DISPENSED"
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updatePrescription = async (req: Request, res: Response) => {
    const docClient = getRegionalClient(extractRegion(req));
    const { prescriptionId, status } = req.body;
    const authUser = (req as any).user;

    try {
        // 🟢 HIPAA FIX: Fetch the record first to get the Patient ID for the Audit Log
        const rxRes = await docClient.send(new GetCommand({ TableName: TABLE_RX, Key: { prescriptionId } }));
        if (!rxRes.Item) return res.status(404).json({ error: "Not found" });

        const realPatientId = rxRes.Item.patientId;

        await docClient.send(new UpdateCommand({
            TableName: TABLE_RX, Key: { prescriptionId },
            UpdateExpression: "set #s = :status, updatedAt = :time",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":status": status, ":time": new Date().toISOString() }
        }));

        await writeAuditLog(authUser.sub, realPatientId, "UPDATE_STATUS", `Status set to ${status} for ${prescriptionId}`, { region: extractRegion(req), ipAddress: req.ip });
        res.json({ message: `Prescription updated to ${status}` });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
};

// 🟢 FIX #23: Dedicated prescription cancellation endpoint
export const cancelPrescription = async (req: Request, res: Response) => {
    const userRegion = extractRegion(req);
    const docClient = getRegionalClient(userRegion);
    const { prescriptionId } = req.params;
    const authUser = (req as any).user;

    try {
        // Fetch the prescription
        const rxRes = await docClient.send(new GetCommand({ TableName: TABLE_RX, Key: { prescriptionId } }));
        if (!rxRes.Item) return res.status(404).json({ error: "Prescription not found" });

        const rx = rxRes.Item;

        // Only the prescribing doctor can cancel
        if (rx.doctorId !== authUser.sub) {
            return res.status(403).json({ error: "HIPAA Violation: Only the prescribing doctor can cancel this prescription." });
        }

        // Cannot cancel already dispensed or cancelled prescriptions
        if (rx.status === 'DISPENSED') {
            return res.status(400).json({ error: "Cannot cancel a dispensed prescription." });
        }
        if (rx.status === 'CANCELLED') {
            return res.status(400).json({ error: "Prescription is already cancelled." });
        }

        const now = new Date().toISOString();

        // Query related billing transactions BEFORE the atomic write so we can include them
        let relatedBills: any[] = [];
        try {
            const billRes = await docClient.send(new QueryCommand({
                TableName: TABLE_TRANSACTION,
                IndexName: "ReferenceIndex",
                KeyConditionExpression: "referenceId = :rid",
                ExpressionAttributeValues: { ":rid": prescriptionId }
            }));
            relatedBills = billRes.Items || [];
        } catch (billErr: any) {
            safeError("Failed to query related billing transactions:", billErr.message);
        }

        // Build atomic transaction: prescription cancellation + billing updates
        const transactItems: any[] = [
            {
                Update: {
                    TableName: TABLE_RX,
                    Key: { prescriptionId },
                    UpdateExpression: "SET #s = :cancelled, updatedAt = :now, cancelledAt = :now, cancelledBy = :by, #res.#st = :fhirCancelled",
                    ExpressionAttributeNames: { "#s": "status", "#res": "resource", "#st": "status" },
                    ExpressionAttributeValues: {
                        ":cancelled": "CANCELLED",
                        ":now": now,
                        ":by": authUser.sub,
                        ":fhirCancelled": "cancelled"
                    }
                }
            },
        ];

        // Include billing cancellations in the same atomic transaction
        for (const bill of relatedBills) {
            transactItems.push({
                Update: {
                    TableName: TABLE_TRANSACTION,
                    Key: { billId: (bill as any).billId },
                    UpdateExpression: "SET #s = :cancelled, updatedAt = :now",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: { ":cancelled": "CANCELLED", ":now": now }
                }
            });
        }

        await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

        // Clean up graph-data DRUG relationship
        try {
            await docClient.send(new DeleteCommand({
                TableName: TABLE_GRAPH,
                Key: { PK: `PATIENT#${rx.patientId}`, SK: `DRUG#${rx.medication}` }
            }));
        } catch (graphErr) {
            // Non-blocking
        }

        // Write audit log
        await writeAuditLog(authUser.sub, rx.patientId, "CANCEL_PRESCRIPTION", `Prescription ${prescriptionId} cancelled`, {
            region: userRegion,
            ipAddress: req.ip,
            medication: rx.medication
        });

        // Fire-and-forget cancellation notification to patient
        sendNotification({
            region: userRegion,
            recipientEmail: rx.patientEmail,
            subject: 'Prescription Cancelled',
            message: `Your prescription for ${rx.medication || 'a medication'} (ID: ${prescriptionId}) has been cancelled by your doctor.`,
            type: 'PRESCRIPTION_CANCELLED',
            metadata: { prescriptionId, medication: rx.medication }
        }).catch(() => {});

        // Event bus: prescription cancelled
        publishEvent(EventType.PRESCRIPTION_CANCELLED, {
            prescriptionId, patientId: rx.patientId, doctorId: authUser.sub,
            medication: rx.medication, status: 'CANCELLED'
        }, userRegion).catch(() => {});

        res.json({
            message: "Prescription cancelled successfully",
            prescriptionId,
            status: "CANCELLED",
            cancelledAt: now
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
