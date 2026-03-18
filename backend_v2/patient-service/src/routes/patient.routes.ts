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

export default router;