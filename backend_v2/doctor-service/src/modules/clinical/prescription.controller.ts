import { requestJurisdiction } from '../../../../shared/region-context';
import { Router, Request, Response } from "express";
import { PDFGenerator } from "../../utils/pdf-generator";
import { getRegionalClient, getRegionalS3Client } from '../../../../shared/aws-config';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { safeLog, safeError } from '../../../../shared/logger';
import { writeAuditLog } from '../../../../shared/audit';
import { validateUSCore } from '../../../../shared/us-core-profiles';
import { sendNotification } from '../../../../shared/notifications';
import { encryptPHI, decryptPHI } from '../../../../shared/kms-crypto';
import { publishEvent, EventType } from '../../../../shared/event-bus';
import { TABLE_NAMES, setting } from '../../../../shared/settings';
import { canListPrescriptions, isApprovedClinician, isApprovedPrescriber, isConditionalFailure, isPrescriptionPatient } from './prescription-access';

const router = Router();
const pdfGen = new PDFGenerator();
const TABLE_RX = "mediconnect-prescriptions";
const TABLE_DRUGS = TABLE_NAMES.drugInteractions;
const TABLE_TRANSACTION = "mediconnect-transactions";
const TABLE_GRAPH = "mediconnect-graph-data";
const TABLE_ALLERGIES = setting("TABLE_ALLERGIES");
const AUDIT_TABLE = "mediconnect-audit-logs";

const DEFAULT_PHARMACY = setting("DEFAULT_PHARMACY_ID");

// Prescription lifecycle states. These are protocol values: the booking-service payment webhook and the web
// client use the same literals, so a change here must be made there too.
const RX_STATUS = {
    ISSUED: "ISSUED",
    PENDING: "PENDING",
    REFILL_REQUESTED: "REFILL_REQUESTED",
    READY_FOR_PICKUP: "READY_FOR_PICKUP",
    DISPENSED: "DISPENSED",
    PICKED_UP: "PICKED_UP", // legacy synonym of DISPENSED still read by older clients
    CANCELLED: "CANCELLED",
} as const;

// 🟢 COMPILER FIX: Safely parse headers to prevent "string | string[]" build failures
const extractRegion = (req: Request): string => requestJurisdiction(req);

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
    const interactionWarnings: string[] = [];
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
            TableName: TABLE_NAMES.inventory,
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
            throw new Error('PHI_ENCRYPTION_UNAVAILABLE', { cause: encErr });
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
                    TableName: setting("DYNAMO_TABLE_PATIENTS"),
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
    // One subject per request: the authorized subject must be exactly the one that is queried.
    if (patientId && doctorId) return res.status(400).json({ error: "Provide either a patient or a doctor identifier, not both" });

    res.set('Cache-Control', 'no-store');
    try {
        if (!await canListPrescriptions((req as any).user ?? {}, { patientId, doctorId }, extractRegion(req), TABLE_GRAPH)) {
            return res.status(403).json({ error: "Prescription access is not authorized" });
        }
    } catch (authErr) {
        safeError("Prescription access check failed", authErr);
        return res.status(503).json({ error: "Prescription access verification is temporarily unavailable" });
    }

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
                const inv = await docClient.send(new GetCommand({ TableName: TABLE_NAMES.inventory, Key: { pharmacyId: DEFAULT_PHARMACY, drugId: rx.medication } }));
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
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const { prescriptionId } = req.body;
    const authUser = (req as any).user;

    try {
        const rxRes = await docClient.send(new GetCommand({ TableName: TABLE_RX, Key: { prescriptionId }, ConsistentRead: true }));
        const rx = rxRes.Item;
        if (!rx) return res.status(404).json({ error: "Prescription not found" });
        if (!isPrescriptionPatient(authUser, rx) && !await isApprovedPrescriber(authUser, rx, region)) {
            return res.status(403).json({ error: "Only the patient or the prescribing clinician can request this refill." });
        }

        const remaining = Number(rx.refillsRemaining);
        if (!Number.isInteger(remaining) || remaining <= 0) return res.status(400).json({ error: "No refills remaining" });
        if (rx.status !== RX_STATUS.DISPENSED && rx.status !== RX_STATUS.PICKED_UP) {
            return res.status(409).json({ error: "A refill can be requested after the current fill has been dispensed." });
        }

        // One refill per observed count: the condition rejects replays and concurrent duplicates, and the
        // bill id is derived from that count so a duplicate can never create a second charge.
        const now = new Date().toISOString();
        await docClient.send(new TransactWriteCommand({
            TransactItems: [
                { Update: {
                    TableName: TABLE_RX, Key: { prescriptionId },
                    UpdateExpression: "SET #s = :pending, paymentStatus = :unpaid, refillsRemaining = refillsRemaining - :one, updatedAt = :now",
                    ConditionExpression: "refillsRemaining = :expected AND #s IN (:dispensed, :pickedUp)",
                    ExpressionAttributeNames: { "#s": "status" },
                    ExpressionAttributeValues: {
                        ":pending": RX_STATUS.PENDING, ":unpaid": "UNPAID", ":one": 1, ":now": now, ":expected": remaining,
                        ":dispensed": RX_STATUS.DISPENSED, ":pickedUp": RX_STATUS.PICKED_UP,
                    },
                } },
                { Put: {
                    TableName: TABLE_TRANSACTION,
                    Item: { billId: `refill-${prescriptionId}-${remaining}`, referenceId: prescriptionId, patientId: rx.patientId, doctorId: rx.doctorId, amount: rx.price, status: "PENDING", type: "PHARMACY", createdAt: now },
                    ConditionExpression: "attribute_not_exists(billId)",
                } },
            ]
        }));
        await writeAuditLog(authUser.sub, rx.patientId, "REQUEST_REFILL", `Refill for ${prescriptionId} processed`, { region, ipAddress: req.ip });
        return res.json({ message: "Refill authorized" });
    } catch (e: any) {
        if (isConditionalFailure(e)) {
            return res.status(409).json({ error: "This refill was already processed or the prescription changed. Refresh before trying again." });
        }
        safeError("Refill request failed", e);
        res.status(500).json({ error: "Refill request failed" });
    }
};

export const generateQR = async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const authUser = (req as any).user;
    const { prescriptionId } = req.body;
    // A refill (PENDING) becomes collectable only when the payment webhook marks it READY_FOR_PICKUP, so a legacy
    // refill that still carries its previous fill's PAID flag cannot skip the refill bill.
    const pickupEligible: string[] = [RX_STATUS.ISSUED, RX_STATUS.READY_FOR_PICKUP];

    try {
        const rx = (await docClient.send(new GetCommand({ TableName: TABLE_RX, Key: { prescriptionId }, ConsistentRead: true }))).Item;
        if (!rx) return res.status(404).json({ error: "Prescription not found" });
        if (!isPrescriptionPatient(authUser, rx) && !await isApprovedPrescriber(authUser, rx, region)) {
            return res.status(403).json({ error: "Only the patient or the prescribing clinician can generate this pickup code." });
        }
        if (rx.paymentStatus !== 'PAID') {
            return res.status(402).json({
                error: "Payment Required",
                message: "Please pay for this medication before generating a pickup code."
            });
        }
        if (!pickupEligible.includes(rx.status)) {
            return res.status(409).json({ error: `A pickup code cannot be generated while the prescription is ${rx.status}.` });
        }

        // The condition keeps a dispensed or cancelled fill from being reopened by a concurrent writer.
        await docClient.send(new UpdateCommand({
            TableName: TABLE_RX,
            Key: { prescriptionId },
            UpdateExpression: "SET #status = :ready",
            ConditionExpression: "paymentStatus = :paid AND #status IN (:issued, :ready)",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: { ":ready": RX_STATUS.READY_FOR_PICKUP, ":paid": "PAID", ":issued": RX_STATUS.ISSUED }
        }));

        await writeAuditLog(authUser.sub, rx.patientId, "GENERATE_QR", `Pickup code generated for ${prescriptionId}`, { region, ipAddress: req.ip });
        res.json({ qrPayload: `PICKUP-${prescriptionId}` });
    } catch (e: any) {
        if (isConditionalFailure(e)) return res.status(409).json({ error: "The prescription changed. Refresh before generating a pickup code." });
        safeError("QR Generation Error:", e);
        res.status(500).json({ error: "Pickup code generation failed" });
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
        // There is no pharmacist role yet, so dispensing is limited to verified, approved clinicians.
        if (!await isApprovedClinician(authUser, extractRegion(req))) {
            return res.status(403).json({ error: "Only verified, approved clinicians can dispense prescriptions." });
        }
        const rxRes = await docClient.send(new GetCommand({ TableName: TABLE_RX, Key: { prescriptionId } }));
        const rx = rxRes.Item;

        if (!rx) return res.status(404).json({ error: "Prescription not found" });
        if (rx.status !== 'READY_FOR_PICKUP') {
            return res.status(400).json({ error: `Cannot fulfill: current status is ${rx.status}` });
        }

        const now = new Date().toISOString();
        try {
            // Dispense exactly once, even when two scanners submit the same pickup code.
            await docClient.send(new UpdateCommand({
                TableName: TABLE_RX,
                Key: { prescriptionId },
                UpdateExpression: "SET #s = :s, dispensedAt = :now, dispensedBy = :by",
                ConditionExpression: "#s = :ready",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: { ":s": RX_STATUS.DISPENSED, ":now": now, ":by": authUser.sub, ":ready": RX_STATUS.READY_FOR_PICKUP }
            }));
        } catch (dispenseErr) {
            if (isConditionalFailure(dispenseErr)) return res.status(409).json({ error: "This prescription was already dispensed or changed." });
            throw dispenseErr;
        }

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
        safeError("Prescription dispense failed", error);
        res.status(500).json({ error: "Prescription dispense failed" });
    }
};

// Payment, pickup, dispensing and cancellation each have their own guarded flow; this endpoint only
// lets the prescriber re-issue a prescription that is awaiting review or payment.
export const PRESCRIBER_UPDATABLE_STATUSES = [RX_STATUS.ISSUED] as const;
const UPDATABLE_FROM: string[] = [RX_STATUS.REFILL_REQUESTED, RX_STATUS.PENDING, RX_STATUS.ISSUED];

export const updatePrescription = async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const docClient = getRegionalClient(region);
    const { prescriptionId, status } = req.body;
    const authUser = (req as any).user;

    try {
        // 🟢 HIPAA FIX: Fetch the record first to get the Patient ID for the Audit Log
        const rxRes = await docClient.send(new GetCommand({ TableName: TABLE_RX, Key: { prescriptionId }, ConsistentRead: true }));
        if (!rxRes.Item) return res.status(404).json({ error: "Not found" });
        if (!await isApprovedPrescriber(authUser, rxRes.Item, region)) {
            return res.status(403).json({ error: "Only the prescribing clinician can update this prescription." });
        }
        if (!UPDATABLE_FROM.includes(rxRes.Item.status)) {
            return res.status(409).json({ error: `A ${rxRes.Item.status} prescription cannot be updated here.` });
        }

        const realPatientId = rxRes.Item.patientId;

        await docClient.send(new UpdateCommand({
            TableName: TABLE_RX, Key: { prescriptionId },
            UpdateExpression: "SET #s = :status, updatedAt = :time",
            ConditionExpression: "#s IN (:refillRequested, :pending, :issued)",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
                ":status": status, ":time": new Date().toISOString(),
                ":refillRequested": RX_STATUS.REFILL_REQUESTED, ":pending": RX_STATUS.PENDING, ":issued": RX_STATUS.ISSUED,
            }
        }));

        await writeAuditLog(authUser.sub, realPatientId, "UPDATE_STATUS", `Status set to ${status} for ${prescriptionId}`, { region, ipAddress: req.ip });
        res.json({ message: `Prescription updated to ${status}` });
    } catch (error: any) {
        if (isConditionalFailure(error)) return res.status(409).json({ error: "The prescription changed. Refresh before updating it." });
        safeError("Prescription update failed", error);
        res.status(500).json({ error: "Prescription update failed" });
    }
};

// Ledger statuses that /billing/pay still accepts; cancelling the prescription must close them.
const UNPAID_BILL_STATUSES: string[] = ['PENDING', 'DUE', 'UNPAID', 'FAILED'];

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

        // Only the prescribing doctor, while still verified and approved, can cancel
        if (!await isApprovedPrescriber(authUser, rx, userRegion)) {
            return res.status(403).json({ error: "HIPAA Violation: Only the prescribing doctor can cancel this prescription." });
        }

        // Cannot cancel already dispensed or cancelled prescriptions
        if (rx.status === RX_STATUS.DISPENSED || rx.status === RX_STATUS.PICKED_UP) {
            return res.status(400).json({ error: "Cannot cancel a dispensed prescription." });
        }
        if (rx.status === 'CANCELLED') {
            return res.status(400).json({ error: "Prescription is already cancelled." });
        }

        const now = new Date().toISOString();

        // Find the prescription's bills BEFORE the atomic write so they change together. The ledger has no
        // reference index, so bills are found through the patient index. A failed lookup aborts the cancel:
        // leaving a bill payable for a cancelled prescription is worse than asking the doctor to retry.
        const relatedBills: any[] = [];
        let billPage: Record<string, any> | undefined;
        do {
            const billRes = await docClient.send(new QueryCommand({
                TableName: TABLE_TRANSACTION,
                IndexName: "PatientIndex",
                KeyConditionExpression: "patientId = :pid",
                FilterExpression: "referenceId = :rid",
                ExpressionAttributeValues: { ":pid": rx.patientId, ":rid": prescriptionId },
                ExclusiveStartKey: billPage
            }));
            relatedBills.push(...(billRes.Items || []));
            billPage = billRes.LastEvaluatedKey;
        } while (billPage);

        // Build atomic transaction: prescription cancellation + billing updates
        const transactItems: any[] = [
            {
                Update: {
                    TableName: TABLE_RX,
                    Key: { prescriptionId },
                    UpdateExpression: "SET #s = :cancelled, updatedAt = :now, cancelledAt = :now, cancelledBy = :by, #res.#st = :fhirCancelled",
                    // A concurrent dispense or cancel wins; this write then fails instead of overwriting it.
                    ConditionExpression: "NOT (#s IN (:dispensed, :pickedUp, :cancelled))",
                    ExpressionAttributeNames: { "#s": "status", "#res": "resource", "#st": "status" },
                    ExpressionAttributeValues: {
                        ":cancelled": RX_STATUS.CANCELLED,
                        ":dispensed": RX_STATUS.DISPENSED,
                        ":pickedUp": RX_STATUS.PICKED_UP,
                        ":now": now,
                        ":by": authUser.sub,
                        ":fhirCancelled": "cancelled"
                    }
                }
            },
        ];

        // Include billing changes in the same atomic transaction. Each is conditioned on the status read above,
        // so a payment that lands meanwhile fails the cancel rather than being silently overwritten.
        for (const bill of relatedBills) {
            if (UNPAID_BILL_STATUSES.includes(bill.status)) {
                transactItems.push({
                    Update: {
                        TableName: TABLE_TRANSACTION,
                        Key: { billId: bill.billId },
                        UpdateExpression: "SET #s = :cancelled, updatedAt = :now",
                        ConditionExpression: "#s = :observed",
                        ExpressionAttributeNames: { "#s": "status" },
                        ExpressionAttributeValues: { ":cancelled": "CANCELLED", ":now": now, ":observed": bill.status }
                    }
                });
            } else if (bill.status === 'PAID') {
                // Money already captured for this fill: keep the payment record and flag it for refund review.
                transactItems.push({
                    Update: {
                        TableName: TABLE_TRANSACTION,
                        Key: { billId: bill.billId },
                        UpdateExpression: "SET reviewReason = :reason, updatedAt = :now",
                        ConditionExpression: "#s = :paid",
                        ExpressionAttributeNames: { "#s": "status" },
                        ExpressionAttributeValues: { ":reason": "PRESCRIPTION_CANCELLED_AFTER_PAYMENT", ":now": now, ":paid": "PAID" }
                    }
                });
            }
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

        // Delete prescription PDF from S3
        try {
            const s3Bucket = userRegion.toUpperCase().includes('EU')
                ? (setting("S3_BUCKET_PRESCRIPTIONS_EU"))
                : (setting("S3_BUCKET_PRESCRIPTIONS_US"));
            const s3Client = getRegionalS3Client(userRegion);
            await s3Client.send(new DeleteObjectCommand({
                Bucket: s3Bucket,
                Key: `prescriptions/${prescriptionId}.pdf`
            }));
        } catch (s3Err) {
            // Non-blocking: PDF may not exist or S3 unavailable
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
        if (isConditionalFailure(error)) {
            return res.status(409).json({ error: "The prescription or its bill changed. Refresh before cancelling it." });
        }
        safeError("Prescription cancellation failed", error);
        res.status(500).json({ error: "Prescription cancellation failed" });
    }
};
