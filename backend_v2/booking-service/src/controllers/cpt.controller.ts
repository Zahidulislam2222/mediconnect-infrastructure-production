import { Request, Response } from 'express';
import { getRegionalClient } from '../../../shared/aws-config';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { writeAuditLog } from '../../../shared/audit';
import { safeError } from '../../../shared/logger';
import { v4 as uuidv4 } from 'uuid';

const TABLE_APPOINTMENTS = process.env.TABLE_APPOINTMENTS || "mediconnect-appointments";
const TABLE_TRANSACTIONS = process.env.TABLE_TRANSACTIONS || "mediconnect-transactions";

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

// --- Built-in CPT Code Reference ---
// AMA CPT license required for full database; these are commonly used codes
// for a healthcare platform demo with accurate descriptions and fee ranges.

interface CPTCode {
    code: string;
    description: string;
    category: string;
    subcategory: string;
    feeRangeLow: number;
    feeRangeHigh: number;
    rvu: number; // Relative Value Unit
    system: string;
}

const CPT_CODES: CPTCode[] = [
    // Evaluation & Management (E/M)
    { code: "99201", description: "Office visit, new patient, minimal complexity", category: "E/M", subcategory: "Office Visit", feeRangeLow: 45, feeRangeHigh: 75, rvu: 0.48, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99202", description: "Office visit, new patient, straightforward complexity", category: "E/M", subcategory: "Office Visit", feeRangeLow: 75, feeRangeHigh: 110, rvu: 0.93, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99203", description: "Office visit, new patient, low complexity", category: "E/M", subcategory: "Office Visit", feeRangeLow: 110, feeRangeHigh: 170, rvu: 1.60, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99204", description: "Office visit, new patient, moderate complexity", category: "E/M", subcategory: "Office Visit", feeRangeLow: 170, feeRangeHigh: 250, rvu: 2.60, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99205", description: "Office visit, new patient, high complexity", category: "E/M", subcategory: "Office Visit", feeRangeLow: 250, feeRangeHigh: 375, rvu: 3.50, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99211", description: "Office visit, established patient, minimal", category: "E/M", subcategory: "Office Visit", feeRangeLow: 25, feeRangeHigh: 45, rvu: 0.18, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99212", description: "Office visit, established patient, straightforward", category: "E/M", subcategory: "Office Visit", feeRangeLow: 45, feeRangeHigh: 80, rvu: 0.70, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99213", description: "Office visit, established patient, low complexity", category: "E/M", subcategory: "Office Visit", feeRangeLow: 80, feeRangeHigh: 130, rvu: 1.30, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99214", description: "Office visit, established patient, moderate complexity", category: "E/M", subcategory: "Office Visit", feeRangeLow: 130, feeRangeHigh: 200, rvu: 1.92, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99215", description: "Office visit, established patient, high complexity", category: "E/M", subcategory: "Office Visit", feeRangeLow: 200, feeRangeHigh: 300, rvu: 2.80, system: "http://www.ama-assn.org/go/cpt" },
    // Telehealth
    { code: "99421", description: "Online digital E/M, 5-10 minutes", category: "E/M", subcategory: "Telehealth", feeRangeLow: 15, feeRangeHigh: 35, rvu: 0.25, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99422", description: "Online digital E/M, 11-20 minutes", category: "E/M", subcategory: "Telehealth", feeRangeLow: 35, feeRangeHigh: 70, rvu: 0.50, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99423", description: "Online digital E/M, 21+ minutes", category: "E/M", subcategory: "Telehealth", feeRangeLow: 70, feeRangeHigh: 105, rvu: 0.75, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99441", description: "Telephone E/M, 5-10 minutes", category: "E/M", subcategory: "Telehealth", feeRangeLow: 25, feeRangeHigh: 50, rvu: 0.48, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99442", description: "Telephone E/M, 11-20 minutes", category: "E/M", subcategory: "Telehealth", feeRangeLow: 50, feeRangeHigh: 90, rvu: 0.97, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99443", description: "Telephone E/M, 21-30 minutes", category: "E/M", subcategory: "Telehealth", feeRangeLow: 90, feeRangeHigh: 135, rvu: 1.50, system: "http://www.ama-assn.org/go/cpt" },
    // Consultations
    { code: "99241", description: "Office consultation, straightforward", category: "E/M", subcategory: "Consultation", feeRangeLow: 60, feeRangeHigh: 100, rvu: 0.64, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99242", description: "Office consultation, straightforward", category: "E/M", subcategory: "Consultation", feeRangeLow: 100, feeRangeHigh: 155, rvu: 1.34, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99243", description: "Office consultation, low complexity", category: "E/M", subcategory: "Consultation", feeRangeLow: 155, feeRangeHigh: 215, rvu: 2.02, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99244", description: "Office consultation, moderate complexity", category: "E/M", subcategory: "Consultation", feeRangeLow: 215, feeRangeHigh: 330, rvu: 3.18, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99245", description: "Office consultation, high complexity", category: "E/M", subcategory: "Consultation", feeRangeLow: 330, feeRangeHigh: 475, rvu: 4.07, system: "http://www.ama-assn.org/go/cpt" },
    // Preventive Medicine
    { code: "99385", description: "Preventive visit, new patient, 18-39 years", category: "E/M", subcategory: "Preventive", feeRangeLow: 150, feeRangeHigh: 250, rvu: 2.33, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99386", description: "Preventive visit, new patient, 40-64 years", category: "E/M", subcategory: "Preventive", feeRangeLow: 175, feeRangeHigh: 275, rvu: 2.72, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99395", description: "Preventive visit, established, 18-39 years", category: "E/M", subcategory: "Preventive", feeRangeLow: 125, feeRangeHigh: 200, rvu: 2.00, system: "http://www.ama-assn.org/go/cpt" },
    { code: "99396", description: "Preventive visit, established, 40-64 years", category: "E/M", subcategory: "Preventive", feeRangeLow: 140, feeRangeHigh: 225, rvu: 2.33, system: "http://www.ama-assn.org/go/cpt" },
    // Procedures
    { code: "36415", description: "Venipuncture (blood draw)", category: "Pathology", subcategory: "Lab", feeRangeLow: 3, feeRangeHigh: 10, rvu: 0.17, system: "http://www.ama-assn.org/go/cpt" },
    { code: "71046", description: "Chest X-ray, 2 views", category: "Radiology", subcategory: "Diagnostic", feeRangeLow: 30, feeRangeHigh: 75, rvu: 0.70, system: "http://www.ama-assn.org/go/cpt" },
    { code: "80053", description: "Comprehensive metabolic panel", category: "Pathology", subcategory: "Lab", feeRangeLow: 10, feeRangeHigh: 35, rvu: 0.00, system: "http://www.ama-assn.org/go/cpt" },
    { code: "85025", description: "Complete blood count (CBC)", category: "Pathology", subcategory: "Lab", feeRangeLow: 8, feeRangeHigh: 25, rvu: 0.00, system: "http://www.ama-assn.org/go/cpt" },
    { code: "87880", description: "Strep test, rapid", category: "Pathology", subcategory: "Lab", feeRangeLow: 10, feeRangeHigh: 30, rvu: 0.00, system: "http://www.ama-assn.org/go/cpt" },
    { code: "90715", description: "Tdap vaccine administration", category: "Immunization", subcategory: "Vaccine", feeRangeLow: 20, feeRangeHigh: 50, rvu: 0.17, system: "http://www.ama-assn.org/go/cpt" },
    { code: "96372", description: "Therapeutic injection, subcutaneous/IM", category: "Medicine", subcategory: "Injection", feeRangeLow: 25, feeRangeHigh: 65, rvu: 0.41, system: "http://www.ama-assn.org/go/cpt" },
    { code: "93000", description: "Electrocardiogram (ECG), complete", category: "Medicine", subcategory: "Cardiology", feeRangeLow: 20, feeRangeHigh: 50, rvu: 0.70, system: "http://www.ama-assn.org/go/cpt" },
    { code: "10060", description: "Incision and drainage, abscess, simple", category: "Surgery", subcategory: "Integumentary", feeRangeLow: 150, feeRangeHigh: 350, rvu: 2.65, system: "http://www.ama-assn.org/go/cpt" },
    { code: "11102", description: "Skin biopsy, tangential", category: "Surgery", subcategory: "Integumentary", feeRangeLow: 100, feeRangeHigh: 250, rvu: 1.43, system: "http://www.ama-assn.org/go/cpt" },
];

// HCPCS Level II codes (CMS, free to use)
const HCPCS_CODES: CPTCode[] = [
    { code: "G0438", description: "Annual wellness visit, initial", category: "HCPCS", subcategory: "Preventive", feeRangeLow: 150, feeRangeHigh: 250, rvu: 2.43, system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets" },
    { code: "G0439", description: "Annual wellness visit, subsequent", category: "HCPCS", subcategory: "Preventive", feeRangeLow: 120, feeRangeHigh: 200, rvu: 1.88, system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets" },
    { code: "G2012", description: "Virtual check-in, 5-10 minutes", category: "HCPCS", subcategory: "Telehealth", feeRangeLow: 15, feeRangeHigh: 35, rvu: 0.25, system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets" },
    { code: "G2010", description: "Remote evaluation of patient images", category: "HCPCS", subcategory: "Telehealth", feeRangeLow: 10, feeRangeHigh: 25, rvu: 0.18, system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets" },
    { code: "G0463", description: "Hospital outpatient clinic visit", category: "HCPCS", subcategory: "Outpatient", feeRangeLow: 50, feeRangeHigh: 120, rvu: 0.00, system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets" },
    { code: "Q3014", description: "Telehealth originating site facility fee", category: "HCPCS", subcategory: "Telehealth", feeRangeLow: 25, feeRangeHigh: 30, rvu: 0.00, system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets" },
];

const ALL_CODES = [...CPT_CODES, ...HCPCS_CODES];

// --- Controllers ---

/** GET /billing/cpt/search?query=office+visit&category=E/M&limit=20 */
export const searchCPTCodes = async (req: Request, res: Response) => {
    const query = (req.query.query as string || "").trim().toLowerCase();
    const category = (req.query.category as string || "").trim();
    const subcategory = (req.query.subcategory as string || "").trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    let results = ALL_CODES;

    if (query) {
        results = results.filter(c =>
            c.code.toLowerCase().includes(query) ||
            c.description.toLowerCase().includes(query) ||
            c.category.toLowerCase().includes(query) ||
            c.subcategory.toLowerCase().includes(query)
        );
    }
    if (category) results = results.filter(c => c.category.toLowerCase() === category.toLowerCase());
    if (subcategory) results = results.filter(c => c.subcategory.toLowerCase() === subcategory.toLowerCase());

    results = results.slice(0, limit);

    res.json({
        resourceType: "Bundle",
        type: "searchset",
        total: results.length,
        entry: results.map(c => ({
            resource: {
                resourceType: "ChargeItemDefinition",
                id: c.code,
                status: "active",
                code: {
                    coding: [{ system: c.system, code: c.code, display: c.description }],
                    text: c.description
                },
                propertyGroup: [{
                    priceComponent: [{
                        type: "base",
                        amount: { value: c.feeRangeLow, currency: "USD" }
                    }]
                }]
            }
        })),
        codes: results
    });
};

/** GET /billing/cpt/:code */
export const getCPTCode = async (req: Request, res: Response) => {
    const { code } = req.params;
    const found = ALL_CODES.find(c => c.code === code);

    if (!found) return res.status(404).json({ error: `CPT/HCPCS code ${code} not found` });

    const { code: cptCode, ...rest } = found;
    res.json({
        resourceType: "ChargeItemDefinition",
        id: cptCode,
        status: "active",
        code: {
            coding: [{ system: found.system, code: cptCode, display: found.description }],
            text: found.description
        },
        ...rest,
        cptCode,
        propertyGroup: [{
            priceComponent: [{
                type: "base",
                amount: { value: found.feeRangeLow, currency: "USD" },
                range: { low: found.feeRangeLow, high: found.feeRangeHigh }
            }]
        }]
    });
};

/** GET /billing/cpt/categories — List all available categories */
export const getCPTCategories = async (_req: Request, res: Response) => {
    const categories = new Map<string, Set<string>>();
    for (const c of ALL_CODES) {
        if (!categories.has(c.category)) categories.set(c.category, new Set());
        categories.get(c.category)!.add(c.subcategory);
    }

    const result = Array.from(categories.entries()).map(([category, subs]) => ({
        category,
        subcategories: Array.from(subs),
        count: ALL_CODES.filter(c => c.category === category).length
    }));

    res.json({ categories: result });
};

/** POST /billing/cpt/assign — Assign CPT code to an appointment */
export const assignCPTToAppointment = async (req: Request, res: Response) => {
    const { appointmentId, cptCodes } = req.body;
    const authUser = (req as any).user;
    const region = extractRegion(req);

    if (!appointmentId || !cptCodes || !Array.isArray(cptCodes) || cptCodes.length === 0) {
        return res.status(400).json({ error: "appointmentId and cptCodes array required" });
    }

    try {
        const db = getRegionalClient(region);

        // Verify appointment exists
        const aptRes = await db.send(new GetCommand({
            TableName: TABLE_APPOINTMENTS,
            Key: { appointmentId }
        }));
        if (!aptRes.Item) return res.status(404).json({ error: "Appointment not found" });

        // Validate all CPT codes
        const validCodes: CPTCode[] = [];
        const invalidCodes: string[] = [];
        for (const code of cptCodes) {
            const found = ALL_CODES.find(c => c.code === code);
            if (found) validCodes.push(found);
            else invalidCodes.push(code);
        }
        if (invalidCodes.length > 0) {
            return res.status(400).json({ error: "Invalid CPT codes", invalidCodes });
        }

        // Calculate total fee
        const totalFee = validCodes.reduce((sum, c) => sum + c.feeRangeLow, 0);

        // Update appointment with CPT codes
        await db.send(new UpdateCommand({
            TableName: TABLE_APPOINTMENTS,
            Key: { appointmentId },
            UpdateExpression: "SET cptCodes = :codes, cptFee = :fee, billingUpdatedAt = :now",
            ExpressionAttributeValues: {
                ":codes": validCodes.map(c => ({
                    code: c.code,
                    description: c.description,
                    category: c.category,
                    fee: c.feeRangeLow,
                    coding: { system: c.system, code: c.code, display: c.description }
                })),
                ":fee": totalFee,
                ":now": new Date().toISOString()
            }
        }));

        // Create billing transaction if fee > 0
        if (totalFee > 0) {
            await db.send(new PutCommand({
                TableName: TABLE_TRANSACTIONS,
                Item: {
                    billId: uuidv4(),
                    referenceId: appointmentId,
                    patientId: aptRes.Item.patientId,
                    doctorId: aptRes.Item.doctorId,
                    amount: totalFee,
                    status: "PENDING",
                    type: "CPT_CHARGE",
                    cptCodes: validCodes.map(c => c.code),
                    createdAt: new Date().toISOString()
                }
            }));
        }

        await writeAuditLog(
            authUser.sub, aptRes.Item.patientId,
            "ASSIGN_CPT_CODES",
            `Codes: ${validCodes.map(c => c.code).join(", ")}, Fee: $${totalFee}`,
            { region, ipAddress: req.ip }
        );

        res.json({
            success: true,
            appointmentId,
            assignedCodes: validCodes.map(c => ({ code: c.code, description: c.description, fee: c.feeRangeLow })),
            totalFee,
            currency: "USD"
        });
    } catch (error: any) {
        safeError("CPT assignment failed", error.message);
        res.status(500).json({ error: error.message });
    }
};
