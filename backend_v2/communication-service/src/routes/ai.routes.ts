import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { analyzeClinicalImage } from "../controllers/imaging.controller";
import { predictRisk, summarizeConsultation } from "../controllers/predictive.controller";
import { checkSymptoms } from "../controllers/symptom.controller";
import { requireIdentityVerification } from '../middleware/verification.middleware';

// 🟢 FIX #10: Zod schema validation
import {
    validate,
    ClinicalImageBody,
    PredictRiskBody,
    SummarizeConsultationBody,
    SymptomCheckBody,
} from '../../../shared/validation';

const router = Router();

// 🟢 FIX #10: Validate request bodies before hitting expensive AI providers
router.post("/imaging", authMiddleware, requireIdentityVerification, validate({ body: ClinicalImageBody }), analyzeClinicalImage);
router.post("/predict", authMiddleware, requireIdentityVerification, validate({ body: PredictRiskBody }), predictRisk);
router.post("/summarize", authMiddleware, requireIdentityVerification, validate({ body: SummarizeConsultationBody }), summarizeConsultation);
router.post("/symptoms", authMiddleware, requireIdentityVerification, validate({ body: SymptomCheckBody }), checkSymptoms);

export const aiRoutes = router;