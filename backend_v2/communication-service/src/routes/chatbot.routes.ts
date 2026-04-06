/**
 * Chatbot Routes
 * Public: /chatbot/message (with optional auth — public gets 5/day, auth gets more)
 * Authenticated: /chatbot/history, /chatbot/usage
 */

import { Router } from 'express';
import { sendMessage, getHistory, getUsage } from '../controllers/chatbot.controller';

const router = Router();

// Main chatbot endpoint — works for both public and authenticated users
// Auth is optional — controller checks user tier for rate limits
router.post('/message', sendMessage);

// These require authentication
router.get('/history/:sessionId', getHistory);
router.get('/usage', getUsage);

export default router;
