import { Router } from "express";
import { getChatHistory, handleWsEventHttp } from "../controllers/chat.controller";
import { createOrJoinSession, endSession } from "../controllers/video.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireIdentityVerification } from "../middleware/verification.middleware";

// 🟢 FIX #10: Zod schema validation
import { validate, ChatWsEventBody, VideoSessionBody } from '../../../shared/validation';
import { z } from 'zod';

const router = Router();

// 🟢 SECURITY: Lock down all communication routes
router.use(authMiddleware, requireIdentityVerification);

// --- 💬 CHAT ROUTES ---
router.get("/chat/history", getChatHistory);
router.post("/chat/ws-event", validate({ body: ChatWsEventBody }), handleWsEventHttp);

// --- 📹 VIDEO ROUTES ---
router.post("/video/session", validate({ body: VideoSessionBody }), createOrJoinSession);
router.delete("/video/session", validate({ query: z.object({ appointmentId: z.string() }) }), endSession);

export const communicationRoutes = router;