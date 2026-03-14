import { Router } from "express";
import { getChatHistory, handleWsEventHttp } from "../controllers/chat.controller";
import { createOrJoinSession, endSession } from "../controllers/video.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireIdentityVerification } from "../middleware/verification.middleware";

const router = Router();

// 🟢 SECURITY: Lock down all communication routes
router.use(authMiddleware, requireIdentityVerification);

// --- 💬 CHAT ROUTES ---
router.get("/chat/history", getChatHistory);
router.post("/chat/ws-event", handleWsEventHttp);

// --- 📹 VIDEO ROUTES ---
router.post("/video/session", createOrJoinSession);
router.delete("/video/session", endSession);

export const communicationRoutes = router;