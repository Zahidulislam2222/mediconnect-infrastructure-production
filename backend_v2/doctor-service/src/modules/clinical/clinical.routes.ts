import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
    createPrescription,
    getPrescriptions,
    updatePrescription,
    requestRefill,
    generateQR,
    fulfillPrescription
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
// 1. PRESCRIPTIONS (Frontend & Pharmacy Integration)
// =============================================================================

// 🟢 Frontend Compatibility: Handle BOTH Singular and Plural routes
router.post("/prescription", authMiddleware, createPrescription);
router.get("/prescription", authMiddleware, getPrescriptions);
router.post("/prescriptions", authMiddleware, createPrescription);
router.get("/prescriptions", authMiddleware, getPrescriptions);

// 🟢 Status Updates (Approve/Reject/Cancel)
router.put("/prescription", authMiddleware, updatePrescription);
router.put("/prescriptions", authMiddleware, updatePrescription);

// 🟢 Drug Interaction Checking (RxNorm NLM API)
router.post("/prescriptions/check-interactions", authMiddleware, checkInteractions);

// 🟢 Pharmacy Actions
router.post("/pharmacy/request-refill", authMiddleware, requestRefill);
router.post("/pharmacy/generate-qr", authMiddleware, generateQR);
router.post("/pharmacy/fulfill", authMiddleware, fulfillPrescription);

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
router.get("/ehr/:patientId/scans", authMiddleware, getPatientScans);
router.post("/ehr", authMiddleware, handleEhrAction);
router.get("/relationships", authMiddleware, getRelationships);

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
router.post("/public-health/elr", authMiddleware, createELR);
router.get("/public-health/elr", authMiddleware, listELRs);
router.get("/public-health/elr/tests", authMiddleware, getReportableLabTests);

// =============================================================================
// 9. CDS HOOKS (Clinical Decision Support)
// =============================================================================
router.get("/cds-hooks/services", authMiddleware, getCDSServices);
router.post("/cds-hooks/:hookId", authMiddleware, invokeCDSHook);

// =============================================================================
// 10. LAB ORDERS + RESULTS
// =============================================================================
router.post("/lab/orders", authMiddleware, createLabOrder);
router.get("/lab/orders", authMiddleware, getLabOrders);
router.get("/lab/tests", authMiddleware, getLabTests);
router.get("/lab/orders/:orderId", authMiddleware, getLabOrder);
router.post("/lab/results", authMiddleware, submitLabResults);

// =============================================================================
// 11. REFERRALS (FHIR ServiceRequest)
// =============================================================================
router.get("/referrals/specialties", authMiddleware, getReferralSpecialties);
router.post("/referrals", authMiddleware, createReferral);
router.get("/referrals/incoming", authMiddleware, getIncomingReferrals);
router.get("/referrals/patient/:patientId", authMiddleware, getPatientReferrals);
router.put("/referrals/:referralId", authMiddleware, updateReferral);

// =============================================================================
// 12. MEDICATION RECONCILIATION
// =============================================================================
router.get("/med-reconciliation/drug-classes", authMiddleware, getDrugClasses);
router.post("/med-reconciliation", authMiddleware, performReconciliation);
router.get("/med-reconciliation/:patientId", authMiddleware, getReconciliationHistory);
router.get("/med-reconciliation/detail/:reconId", authMiddleware, getReconciliation);

// =============================================================================
// 13. EMERGENCY ACCESS (Break-Glass Override) — Gap #1 FIX
// =============================================================================
router.get("/emergency-access/reasons", authMiddleware, getEmergencyReasons);
router.post("/emergency-access", authMiddleware, requestEmergencyAccess);
router.get("/emergency-access/active", authMiddleware, getActiveOverrides);
router.post("/emergency-access/:overrideId/revoke", authMiddleware, revokeEmergencyAccess);

export default router;