import { Router, Request, Response } from 'express';
import { getRegionalClient } from '../../../shared/aws-config';
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
    createPatient,
    getDemographics,
    getProfile,
    updateProfile,
    verifyIdentity,
    deleteProfile,
    getPatientById,
    searchPatients,
    extractRegion,
    exportPatientData
} from '../controllers/patient.controller';
import { uploadDicom } from '../modules/clinical/imaging.controller';
import multer from 'multer';

// 🟢 BOTH MIDDLEWARES IMPORTED HERE
import { authMiddleware } from '../middleware/auth.middleware';
import { requireIdentityVerification } from '../middleware/verification.middleware';
import { writeAuditLog } from '../../../shared/audit';
import { getConsent, updateConsent, withdrawConsent } from '../modules/gdpr/consent.controller';
import { getCoverage } from '../modules/fhir/coverage.controller';
import { receiveHL7Message, getHL7Messages, getSupportedTypes } from '../modules/clinical/hl7.controller';
import { generatePatientCDA } from '../modules/clinical/cda.controller';
import { getPatientAllergies, createAllergy, updateAllergy, deleteAllergy, getCommonAllergens } from '../modules/clinical/allergy.controller';
import { createECR, getECR, listECRs, getReportableConditions } from '../modules/clinical/ecr.controller';
import { searchCVXCodes, getCVXGroups, recordImmunization, getPatientImmunizations, updateImmunization } from '../modules/clinical/immunization.controller';
import { startBulkExport, pollBulkExport, downloadExportFile, listExportJobs } from '../modules/clinical/bulk-export.controller';
import { getSDOHCodes, getScreeningQuestionnaire, submitSDOHAssessment, getPatientSDOHAssessments, getSDOHObservations } from '../modules/clinical/sdoh.controller';
import { searchMPI, linkPatients, getPatientLinks, scanDuplicates } from '../modules/clinical/mpi.controller';
import { createCarePlan, getPatientCarePlans, getCarePlan, updateCarePlan, getCarePlanCategories } from '../modules/clinical/care-plan.controller';
import { startBlueButtonAuth, handleBlueButtonCallback, getBlueButtonPatient, getBlueButtonEOB, getBlueButtonCoverage, getBlueButtonStatus, disconnectBlueButton } from '../modules/clinical/blue-button.controller';
import { getCapabilityStatement, getSmartConfiguration, getSmartLaunchContext } from '../../../shared/fhir-metadata';

// 🟢 FIX #10: Zod schema validation
import {
    validate,
    CreatePatientBody,
    UpdateProfileBody,
    VerifyIdentityBody,
} from '../../../shared/validation';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// ==========================================
// 📖 1. PUBLIC ROUTES (No Token Required)
// ==========================================
export const getPublicKnowledge = async (req: Request, res: Response) => {
    try {
        const userRegion = extractRegion(req);
        const dynamicDb = getRegionalClient(userRegion);
        
        const { Items } = await dynamicDb.send(new ScanCommand({ TableName: "mediconnect-knowledge-base" }));
        if (!Items || Items.length === 0) return res.json([]);

        const fhirArticles = Items.map((art: any) => ({
            id: art.topic || art.id,
            resourceType: "DocumentReference",
            description: art.title || "Untitled",
            content: [{ attachment: { url: art.coverImage } }],
            legacyData: { category: art.category || "General", content: art.content }
        }));
        res.json(fhirArticles);
    } catch (error: any) {
        res.status(500).json({ error: "Knowledge Base Unavailable" });
    }
};

export const getPublicArticle = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userRegion = extractRegion(req);
        const dynamicDb = getRegionalClient(userRegion);

        const { Item: art } = await dynamicDb.send(new GetCommand({ 
            TableName: "mediconnect-knowledge-base", 
            Key: { topic: id } 
        }));
        
        if (!art) return res.status(404).json({ error: "Article not found" });

        const fhirArticle = {
            id: art.topic,
            resourceType: "DocumentReference",
            date: art.publishedAt,
            description: art.title,
            content: [{ attachment: { url: art.coverImage, title: art.title } }],
            legacyData: { category: art.category, content: art.content, slug: art.slug }
        };

        await writeAuditLog("GUEST", id, "READ_KB_ITEM", `Read article: ${art.title}`, { 
            region: userRegion, 
            ipAddress: req.ip 
        });
        
        res.json(fhirArticle);
    } catch (error) {
        res.status(500).json({ error: "Content currently unavailable" });
    }
};

router.get('/public/knowledge', getPublicKnowledge);
router.get('/public/knowledge/:id', getPublicArticle);

// ==========================================
// 🔥 FHIR METADATA + SMART ON FHIR (Gap #4 FIX)
// Public endpoints — no auth required per SMART spec
// ==========================================
router.get('/fhir/metadata', getCapabilityStatement);
router.get('/.well-known/smart-configuration', getSmartConfiguration);

// ==========================================
// 🔒 2. SECURE BOUNDARY (Token Required)
// ==========================================
// The "Security Guard" checks everyone who passes this line
router.use(authMiddleware);

// ==========================================
// 🏥 3. LOBBY ROUTES (No ID Verification Needed)
// Users need to access these so they CAN verify themselves
// ==========================================
// 🟢 FIX #10: Zod validation on mutation routes
router.post(['/register-patient', '/'], validate({ body: CreatePatientBody }), createPatient);
router.post('/patients/:id/verify-identity', validate({ body: VerifyIdentityBody }), verifyIdentity);
router.get(['/register-patient', '/me'], getProfile);
router.get('/me/export', requireIdentityVerification, exportPatientData);

// GDPR Consent Management (Art. 7)
router.get('/me/consent', getConsent);
router.put('/me/consent', updateConsent);
router.delete('/me/consent', withdrawConsent);

// FHIR Coverage (Insurance)
router.get('/me/coverage', getCoverage);

router.get(['/patients/:id', '/:id'], getPatientById);

// ==========================================
// 🛡️ 4. SURGERY ROOM (STRICT: Requires Verified ID)
// Notice we add `requireIdentityVerification` to these specific routes
// ==========================================
router.post('/upload-scan', requireIdentityVerification, upload.single('dicom'), uploadDicom);
router.get('/stats/demographics', getDemographics);
router.get('/search', searchPatients); 
router.delete('/me', requireIdentityVerification, deleteProfile);
router.put(['/patients/:id', '/:id'], requireIdentityVerification, validate({ body: UpdateProfileBody }), updateProfile);

// ==========================================
// 🔗 5. HL7 v2.x INTEGRATION LAYER
// ==========================================
router.post('/hl7/receive', receiveHL7Message);
router.get('/hl7/messages', getHL7Messages);
router.get('/hl7/supported', getSupportedTypes);

// ==========================================
// 📄 6. CDA/C-CDA DOCUMENT EXPORT
// ==========================================
router.get('/patients/:patientId/cda', generatePatientCDA);

// ==========================================
// 🛡️ 7. ALLERGY / INTOLERANCE (FHIR)
// ==========================================
router.get('/allergies/common', getCommonAllergens);
router.get('/patients/:patientId/allergies', getPatientAllergies);
router.post('/patients/:patientId/allergies', createAllergy);
router.put('/patients/:patientId/allergies/:allergyId', updateAllergy);
router.delete('/patients/:patientId/allergies/:allergyId', deleteAllergy);

// ==========================================
// 🏛️ 8. eCR (Electronic Case Reporting)
// ==========================================
router.get('/public-health/reportable-conditions', getReportableConditions);
router.post('/public-health/ecr', createECR);
router.get('/public-health/ecr', listECRs);
router.get('/public-health/ecr/:reportId', getECR);

// ==========================================
// 💉 9. IMMUNIZATIONS (CVX Codes)
// ==========================================
router.get('/immunizations/cvx/search', searchCVXCodes);
router.get('/immunizations/cvx/groups', getCVXGroups);
router.post('/immunizations', recordImmunization);
router.get('/immunizations/:patientId', getPatientImmunizations);
router.put('/immunizations/:patientId/:immunizationId', updateImmunization);

// ==========================================
// 📦 10. BULK FHIR $export
// ==========================================
router.post('/fhir/\\$export', startBulkExport);
router.get('/fhir/\\$export-poll/:exportId', pollBulkExport);
router.get('/fhir/\\$export-download/:exportId/:resourceType', downloadExportFile);
router.get('/fhir/export-jobs', listExportJobs);

// ==========================================
// 🏘️ 11. SDOH (Social Determinants of Health)
// ==========================================
router.get('/sdoh/z-codes', getSDOHCodes);
router.get('/sdoh/screening', getScreeningQuestionnaire);
router.post('/sdoh/assessments', submitSDOHAssessment);
router.get('/sdoh/assessments/:patientId', getPatientSDOHAssessments);
router.get('/sdoh/observations/:patientId', getSDOHObservations);

// ==========================================
// 🔗 12. MASTER PATIENT INDEX (MPI)
// ==========================================
router.post('/mpi/search', searchMPI);
router.post('/mpi/link', linkPatients);
router.get('/mpi/links/:patientId', getPatientLinks);
router.get('/mpi/duplicates', scanDuplicates);

// ==========================================
// 📋 13. CARE PLANS (FHIR CarePlan)
// ==========================================
router.get('/care-plans/categories', getCarePlanCategories);
router.post('/care-plans', createCarePlan);
router.get('/care-plans/:patientId', getPatientCarePlans);
router.get('/care-plans/detail/:carePlanId', getCarePlan);
router.put('/care-plans/:carePlanId', updateCarePlan);

// ==========================================
// 🔵 14. BLUE BUTTON 2.0 (CMS)
// ==========================================
router.get('/bluebutton/authorize', startBlueButtonAuth);
router.get('/bluebutton/callback', handleBlueButtonCallback);
router.get('/bluebutton/patient/:patientId', getBlueButtonPatient);
router.get('/bluebutton/eob/:patientId', getBlueButtonEOB);
router.get('/bluebutton/coverage/:patientId', getBlueButtonCoverage);
router.get('/bluebutton/status/:patientId', getBlueButtonStatus);
router.delete('/bluebutton/disconnect/:patientId', disconnectBlueButton);

// ==========================================
// 🚀 15. SMART ON FHIR LAUNCH (Gap #4 FIX)
// ==========================================
router.get('/fhir/launch', getSmartLaunchContext);
router.get('/fhir/launch/:patientId', getSmartLaunchContext);

export default router;