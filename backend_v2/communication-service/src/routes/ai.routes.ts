import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { analyzeClinicalImage } from "../controllers/imaging.controller";
import { predictRisk, summarizeConsultation } from "../controllers/predictive.controller";
import { checkSymptoms } from "../controllers/symptom.controller";
import { requireIdentityVerification } from '../middleware/verification.middleware';

const router = Router();

router.post("/imaging", authMiddleware, requireIdentityVerification, analyzeClinicalImage);
router.post("/predict", authMiddleware, requireIdentityVerification, predictRisk);
router.post("/summarize", authMiddleware, requireIdentityVerification, summarizeConsultation);
router.post("/symptoms", authMiddleware, requireIdentityVerification, checkSymptoms);

export const aiRoutes = router;