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
import { registerLaunchContext, smartAuthorize, smartToken } from '../../../shared/smart-auth';

// 🟢 FIX #10: Zod schema validation
import {
    validate,
    CreatePatientBody,
    UpdateProfileBody,
    VerifyIdentityBody,
} from '../../../shared/validation';
import { z } from 'zod';

// Inline Zod schemas for routes missing validation
const UpdateConsentBody = z.object({ policyVersion: z.string().min(1), consentType: z.string().min(1) });
const ReceiveHL7Body = z.object({ message: z.string().min(1) });
const CreateAllergyBody = z.object({ substance: z.string().optional(), code: z.any().optional(), category: z.enum(['food', 'medication', 'environment', 'biologic']).optional(), criticality: z.enum(['low', 'high', 'unable-to-assess']).optional(), clinicalStatus: z.string().optional(), notes: z.string().optional(), reactions: z.array(z.any()).optional() });
const UpdateAllergyBody = z.object({ clinicalStatus: z.string().optional(), verificationStatus: z.string().optional(), criticality: z.string().optional(), notes: z.string().optional(), reactions: z.array(z.any()).optional() });
const CreateECRBody = z.object({ patientId: z.string().min(1), conditionCode: z.string().min(1), conditionDisplay: z.string().optional(), encounterDate: z.string().optional(), clinicalNotes: z.string().optional() });
const RecordImmunizationBody = z.object({ patientId: z.string().min(1), cvxCode: z.string().min(1), vaccineName: z.string().optional(), administrationDate: z.string().optional(), lotNumber: z.string().optional(), site: z.string().optional(), route: z.string().optional(), notes: z.string().optional() });
const UpdateImmunizationBody = z.object({ status: z.string().optional(), notes: z.string().optional(), lotNumber: z.string().optional() });
const SubmitSDOHBody = z.object({ patientId: z.string().min(1), responses: z.array(z.object({ questionId: z.string(), answerCode: z.string() })).min(1) });
const SearchMPIBody = z.object({ firstName: z.string().optional(), lastName: z.string().optional(), dob: z.string().optional(), gender: z.string().optional(), phone: z.string().optional(), email: z.string().optional() });
const LinkPatientsBody = z.object({ sourcePatientId: z.string().min(1), targetPatientId: z.string().min(1), linkType: z.enum(['duplicate', 'refer']).optional() });
const CreateCarePlanBody = z.object({ patientId: z.string().min(1), title: z.string().min(1), description: z.string().optional(), startDate: z.string().optional(), conditions: z.array(z.any()).optional(), goals: z.array(z.any()).optional(), activities: z.array(z.any()).optional() });
const UpdateCarePlanBody = z.object({ status: z.string().optional(), title: z.string().optional(), description: z.string().optional(), goals: z.array(z.any()).optional(), activities: z.array(z.any()).optional() });
const StartExportQuery = z.object({ _type: z.string().optional(), _since: z.string().optional(), _outputFormat: z.string().optional() });

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

// SMART on FHIR Authorization (public — no auth per SMART spec)
router.get('/fhir/authorize', smartAuthorize);
router.post('/fhir/token', smartToken);

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
router.put('/me/consent', validate({ body: UpdateConsentBody }), updateConsent);
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
router.post('/hl7/receive', validate({ body: ReceiveHL7Body }), receiveHL7Message);
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
router.post('/patients/:patientId/allergies', validate({ body: CreateAllergyBody }), createAllergy);
router.put('/patients/:patientId/allergies/:allergyId', validate({ body: UpdateAllergyBody }), updateAllergy);
router.delete('/patients/:patientId/allergies/:allergyId', deleteAllergy);

// ==========================================
// 🏛️ 8. eCR (Electronic Case Reporting)
// ==========================================
router.get('/public-health/reportable-conditions', getReportableConditions);
router.post('/public-health/ecr', validate({ body: CreateECRBody }), createECR);
router.get('/public-health/ecr', listECRs);
router.get('/public-health/ecr/:reportId', getECR);

// ==========================================
// 💉 9. IMMUNIZATIONS (CVX Codes)
// ==========================================
router.get('/immunizations/cvx/search', searchCVXCodes);
router.get('/immunizations/cvx/groups', getCVXGroups);
router.post('/immunizations', validate({ body: RecordImmunizationBody }), recordImmunization);
router.get('/immunizations/:patientId', getPatientImmunizations);
router.put('/immunizations/:patientId/:immunizationId', validate({ body: UpdateImmunizationBody }), updateImmunization);

// ==========================================
// 📦 10. BULK FHIR $export
// ==========================================
router.post('/fhir/\\$export', validate({ query: StartExportQuery }), startBulkExport);
router.get('/fhir/\\$export-poll/:exportId', pollBulkExport);
router.get('/fhir/\\$export-download/:exportId/:resourceType', downloadExportFile);
router.get('/fhir/export-jobs', listExportJobs);

// ==========================================
// 🏘️ 11. SDOH (Social Determinants of Health)
// ==========================================
router.get('/sdoh/z-codes', getSDOHCodes);
router.get('/sdoh/screening', getScreeningQuestionnaire);
router.post('/sdoh/assessments', validate({ body: SubmitSDOHBody }), submitSDOHAssessment);
router.get('/sdoh/assessments/:patientId', getPatientSDOHAssessments);
router.get('/sdoh/observations/:patientId', getSDOHObservations);

// ==========================================
// 🔗 12. MASTER PATIENT INDEX (MPI)
// ==========================================
router.post('/mpi/search', validate({ body: SearchMPIBody }), searchMPI);
router.post('/mpi/link', validate({ body: LinkPatientsBody }), linkPatients);
router.get('/mpi/links/:patientId', getPatientLinks);
router.get('/mpi/duplicates', scanDuplicates);

// ==========================================
// 📋 13. CARE PLANS (FHIR CarePlan)
// ==========================================
router.get('/care-plans/categories', getCarePlanCategories);
router.post('/care-plans', validate({ body: CreateCarePlanBody }), createCarePlan);
router.get('/care-plans/:patientId', getPatientCarePlans);
router.get('/care-plans/detail/:carePlanId', getCarePlan);
router.put('/care-plans/:carePlanId', validate({ body: UpdateCarePlanBody }), updateCarePlan);

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
router.post('/fhir/launch-context', registerLaunchContext);

export default router;