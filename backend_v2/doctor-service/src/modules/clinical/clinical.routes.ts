import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from 'zod';
import { validate } from '../../../../shared/validation';
import {
    createPrescription,
    getPrescriptions,
    updatePrescription,
    requestRefill,
    generateQR,
    fulfillPrescription,
    cancelPrescription
} from "./prescription.controller";
import { handleEhrAction } from "./ehr.controller";
import { getPatientScans, uploadDicom } from './imaging.controller';
import { getRelationships } from "./relationship.controller";
import { searchDrugs, getDrugInfo, getDrugInteractions, checkInteractions } from "./rxnorm.controller";
import { validateNPI, lookupNPI } from "./npi.controller";
import { lookupNDC, searchNDC } from "./ndc.controller";
import { searchSNOMED, getSNOMEDConcept, getSNOMEDChildren, getCommonFindings } from "./snomed.controller";
import { validateDEA, getDEASchedules } from "./dea.controller";
import { searchICD11, getICD11Code, crossmapICD10toICD11, getICD11Categories } from "./icd11.controller";
import { createELR, listELRs, getReportableLabTests } from "./elr.controller";
import { getCDSServices, invokeCDSHook } from "./cds-hooks.controller";
import { createLabOrder, getLabOrders, getLabOrder, submitLabResults, getLabTests } from "./lab.controller";
import { createReferral, getPatientReferrals, getIncomingReferrals, updateReferral, getReferralSpecialties } from "./referral.controller";
import { performReconciliation, getReconciliationHistory, getReconciliation, getDrugClasses } from "./med-reconciliation.controller";
import { requestEmergencyAccess, getActiveOverrides, revokeEmergencyAccess, getEmergencyReasons, emergencyAccessMiddleware } from "../../../../shared/emergency-access";
import { authMiddleware } from "../../middleware/auth.middleware";
import { writeAuditLog } from "../../../../shared/audit";

const router = Router();

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

// =============================================================================
// VALIDATION SCHEMAS (Fix #13)
// =============================================================================

const CreatePrescriptionBody = z.object({
    doctorId: z.string().min(1, 'Doctor ID is required'),
    patientId: z.string().min(1, 'Patient ID is required'),
    medication: z.string().min(1, 'Medication is required'),
    dosage: z.string().optional(),
    instructions: z.string().optional(),
    doctorName: z.string().optional(),
    patientName: z.string().optional(),
    pharmacyId: z.string().optional(),
    refills: z.union([z.number(), z.string()]).optional(),
});

const UpdatePrescriptionBody = z.object({
    prescriptionId: z.string().min(1, 'Prescription ID is required'),
    status: z.string().min(1, 'Status is required'),
});

const CheckInteractionsBody = z.object({
    medications: z.array(z.object({
        rxcui: z.string().min(1),
        name: z.string().optional(),
    })).min(1, 'At least one medication is required'),
    patientAllergies: z.array(z.string()).optional(),
});

const RequestRefillBody = z.object({
    prescriptionId: z.string().min(1, 'Prescription ID is required'),
    patientId: z.string().optional(),
});

const GenerateQRBody = z.object({
    prescriptionId: z.string().min(1, 'Prescription ID is required'),
});

const FulfillPrescriptionBody = z.object({
    token: z.string().min(1, 'Prescription token is required').refine(
        (val) => val.startsWith('PICKUP-'),
        { message: 'Token must start with PICKUP-' }
    ),
});

const HandleEhrActionBody = z.object({
    action: z.string().min(1, 'Action is required'),
    patientId: z.string().min(1, 'Patient ID is required'),
    recordId: z.string().optional(),
    fileName: z.string().optional(),
    fileType: z.string().optional(),
    diagnosis: z.string().optional(),
    notes: z.string().optional(),
    icdCode: z.string().optional(),
    icd11Code: z.string().optional(),
});

const CreateELRBody = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    testLoinc: z.string().min(1, 'LOINC test code is required'),
    resultValue: z.string().min(1, 'Result value is required'),
    patientName: z.string().optional(),
    patientDob: z.string().optional(),
    patientGender: z.string().optional(),
    resultUnit: z.string().optional(),
    referenceRange: z.string().optional(),
    abnormalFlag: z.string().optional(),
    interpretation: z.string().optional(),
    collectionDate: z.string().optional(),
    specimen: z.string().optional(),
    performingLab: z.string().optional(),
    orderingProvider: z.string().optional(),
    notes: z.string().optional(),
});

const InvokeCDSHookBody = z.object({
    context: z.record(z.any()).refine(
        (val) => Object.keys(val).length > 0,
        { message: 'context object is required and must not be empty' }
    ),
    prefetch: z.record(z.any()).optional(),
});

const CreateLabOrderBody = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    tests: z.array(z.union([
        z.string(),
        z.object({ loinc: z.string().min(1) }),
    ])).min(1, 'At least one test is required'),
    patientName: z.string().optional(),
    patientDob: z.string().optional(),
    patientGender: z.string().optional(),
    priority: z.enum(['routine', 'urgent', 'asap', 'stat']).optional(),
    clinicalNotes: z.string().optional(),
    fasting: z.boolean().optional(),
});

const SubmitLabResultsBody = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
    results: z.array(z.object({
        loinc: z.string().optional(),
        value: z.union([z.string(), z.number()]).optional(),
        unit: z.string().optional(),
        referenceRange: z.string().optional(),
        abnormalFlag: z.string().optional(),
        interpretation: z.string().optional(),
    })).min(1, 'At least one result is required'),
});

const CreateReferralBody = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    specialtyCode: z.string().min(1, 'Specialty code is required'),
    targetDoctorId: z.string().optional(),
    priority: z.enum(['routine', 'urgent', 'asap', 'stat']).optional(),
    reasonCodes: z.array(z.object({
        code: z.string(),
        display: z.string().optional(),
        system: z.string().optional(),
    })).optional(),
    clinicalNotes: z.string().optional(),
    requestedDate: z.string().optional(),
    expirationDate: z.string().optional(),
});

const UpdateReferralBody = z.object({
    status: z.enum(['active', 'completed', 'revoked', 'on-hold', 'entered-in-error']).optional(),
    clinicalNotes: z.string().optional(),
    targetDoctorId: z.string().optional(),
});

const PerformReconciliationBody = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    reconciliationType: z.string().optional(),
    medicationSources: z.array(z.object({
        sourceName: z.string().optional(),
        sourceType: z.string().optional(),
        medications: z.array(z.object({
            name: z.string().min(1),
            dosage: z.string().optional(),
            frequency: z.string().optional(),
            route: z.string().optional(),
            status: z.string().optional(),
        })).optional(),
    })).min(1, 'At least one medication source is required'),
});

const CancelPrescriptionParams = z.object({
    prescriptionId: z.string().min(1, 'Prescription ID is required'),
});

const RequestEmergencyAccessBody = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    reasonCode: z.string().min(1, 'Reason code is required'),
    reasonText: z.string().optional(),
    durationMinutes: z.number().min(1).max(120).optional(),
});

// =============================================================================
// 1. PRESCRIPTIONS (Frontend & Pharmacy Integration)
// =============================================================================

// Frontend Compatibility: Handle BOTH Singular and Plural routes
router.post("/prescription", authMiddleware, validate({ body: CreatePrescriptionBody }), createPrescription);
router.get("/prescription", authMiddleware, emergencyAccessMiddleware, getPrescriptions);
router.post("/prescriptions", authMiddleware, validate({ body: CreatePrescriptionBody }), createPrescription);
router.get("/prescriptions", authMiddleware, emergencyAccessMiddleware, getPrescriptions);

// Status Updates (Approve/Reject/Cancel)
router.put("/prescription", authMiddleware, validate({ body: UpdatePrescriptionBody }), updatePrescription);
router.put("/prescriptions", authMiddleware, validate({ body: UpdatePrescriptionBody }), updatePrescription);

// 🟢 FIX #23: Dedicated prescription cancellation endpoint
router.put("/prescriptions/:prescriptionId/cancel", authMiddleware, validate({ params: CancelPrescriptionParams }), cancelPrescription);

// Drug Interaction Checking (RxNorm NLM API)
router.post("/prescriptions/check-interactions", authMiddleware, validate({ body: CheckInteractionsBody }), checkInteractions);

// Pharmacy Actions
router.post("/pharmacy/request-refill", authMiddleware, validate({ body: RequestRefillBody }), requestRefill);
router.post("/pharmacy/generate-qr", authMiddleware, validate({ body: GenerateQRBody }), generateQR);
router.post("/pharmacy/fulfill", authMiddleware, validate({ body: FulfillPrescriptionBody }), fulfillPrescription);

// =============================================================================
// 2. DRUG REFERENCE (RxNorm + NDC)
// =============================================================================
router.get("/drugs/rxnorm/search", authMiddleware, searchDrugs);
router.get("/drugs/rxnorm/:rxcui/info", authMiddleware, getDrugInfo);
router.get("/drugs/rxnorm/:rxcui/interactions", authMiddleware, getDrugInteractions);
router.get("/drugs/ndc/lookup/:ndc", authMiddleware, lookupNDC);
router.get("/drugs/ndc/search", authMiddleware, searchNDC);

// =============================================================================
// 3. NPI VALIDATION (NPPES Registry)
// =============================================================================
router.get("/doctors/npi/validate/:npi", authMiddleware, validateNPI);
router.get("/doctors/npi/lookup", authMiddleware, lookupNPI);

// =============================================================================
// 4. SNOMED CT CLINICAL TERMINOLOGY
// =============================================================================
router.get("/terminology/snomed/search", authMiddleware, searchSNOMED);
router.get("/terminology/snomed/common/findings", authMiddleware, getCommonFindings);
router.get("/terminology/snomed/:conceptId", authMiddleware, getSNOMEDConcept);
router.get("/terminology/snomed/:conceptId/children", authMiddleware, getSNOMEDChildren);

// =============================================================================
// 5. EHR & RELATIONSHIPS
// =============================================================================
router.get("/ehr/:patientId/scans", authMiddleware, emergencyAccessMiddleware, getPatientScans);
router.post("/ehr", authMiddleware, validate({ body: HandleEhrActionBody }), handleEhrAction);
router.get("/relationships", authMiddleware, emergencyAccessMiddleware, getRelationships);

// =============================================================================
// 6. DEA NUMBER VALIDATION
// =============================================================================
router.get("/doctors/dea/validate/:dea", authMiddleware, validateDEA);
router.get("/doctors/dea/schedules", authMiddleware, getDEASchedules);

// =============================================================================
// 7. ICD-11 CLINICAL TERMINOLOGY
// =============================================================================
router.get("/terminology/icd11/search", authMiddleware, searchICD11);
router.get("/terminology/icd11/categories", authMiddleware, getICD11Categories);
router.get("/terminology/icd11/crossmap/:icd10code", authMiddleware, crossmapICD10toICD11);
router.get("/terminology/icd11/:code", authMiddleware, getICD11Code);

// =============================================================================
// 8. ELR (Electronic Lab Reporting) — Public Health
// =============================================================================
router.post("/public-health/elr", authMiddleware, validate({ body: CreateELRBody }), createELR);
router.get("/public-health/elr", authMiddleware, listELRs);
router.get("/public-health/elr/tests", authMiddleware, getReportableLabTests);

// =============================================================================
// 9. CDS HOOKS (Clinical Decision Support)
// =============================================================================
router.get("/cds-hooks/services", authMiddleware, getCDSServices);
router.post("/cds-hooks/:hookId", authMiddleware, validate({ body: InvokeCDSHookBody }), invokeCDSHook);

// =============================================================================
// 10. LAB ORDERS + RESULTS
// =============================================================================
router.post("/lab/orders", authMiddleware, validate({ body: CreateLabOrderBody }), createLabOrder);
router.get("/lab/orders", authMiddleware, getLabOrders);
router.get("/lab/tests", authMiddleware, getLabTests);
router.get("/lab/orders/:orderId", authMiddleware, getLabOrder);
router.post("/lab/results", authMiddleware, validate({ body: SubmitLabResultsBody }), submitLabResults);

// =============================================================================
// 11. REFERRALS (FHIR ServiceRequest)
// =============================================================================
router.get("/referrals/specialties", authMiddleware, getReferralSpecialties);
router.post("/referrals", authMiddleware, validate({ body: CreateReferralBody }), createReferral);
router.get("/referrals/incoming", authMiddleware, getIncomingReferrals);
router.get("/referrals/patient/:patientId", authMiddleware, getPatientReferrals);
router.put("/referrals/:referralId", authMiddleware, validate({ body: UpdateReferralBody }), updateReferral);

// =============================================================================
// 12. MEDICATION RECONCILIATION
// =============================================================================
router.get("/med-reconciliation/drug-classes", authMiddleware, getDrugClasses);
router.post("/med-reconciliation", authMiddleware, validate({ body: PerformReconciliationBody }), performReconciliation);
router.get("/med-reconciliation/:patientId", authMiddleware, getReconciliationHistory);
router.get("/med-reconciliation/detail/:reconId", authMiddleware, getReconciliation);

// =============================================================================
// 13. EMERGENCY ACCESS (Break-Glass Override) — Gap #1 FIX
// =============================================================================
router.get("/emergency-access/reasons", authMiddleware, getEmergencyReasons);
router.post("/emergency-access", authMiddleware, validate({ body: RequestEmergencyAccessBody }), requestEmergencyAccess);
router.get("/emergency-access/active", authMiddleware, getActiveOverrides);
router.post("/emergency-access/:overrideId/revoke", authMiddleware, revokeEmergencyAccess);

export default router;
