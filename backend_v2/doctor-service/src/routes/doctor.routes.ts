import { Router } from 'express';
import * as DoctorController from '../controllers/doctor.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// =============================================================================
// 1. DOCTOR PROFILE ROUTES (HIPAA & GDPR Compliant)
// =============================================================================

/**
 * 🟢 HIPAA SECURITY FIX: Protected Registration
 * We now force authMiddleware on creation. This ensures a verified JWT 
 * exists BEFORE we try to write to the medical database.
 */
router.post('/doctors', authMiddleware, DoctorController.createDoctor);
router.post('/register-doctor', authMiddleware, DoctorController.createDoctor);

// Profile Loading for Dashboards
router.get('/register-doctor', authMiddleware, DoctorController.getDoctor);

// 🟢 HIPAA PRIVACY: Sanitized Directory (Filters unverified/private data)
router.get('/doctors', authMiddleware, DoctorController.getDoctors);

// Get Specific Doctor
router.get('/doctors/:id', authMiddleware, DoctorController.getDoctor);

/**
 * 🟢 GDPR FIX: Right to Rectification
 * Added the missing PUT route so users can update their own medical profile data.
 */
router.put('/doctors/:id', authMiddleware, DoctorController.updateDoctor);

/**
 * 🟢 GDPR FIX: Right to Erasure
 * Deletion route for account anonymization.
 */
router.delete('/doctors/:id', authMiddleware, DoctorController.deleteDoctor);


// =============================================================================
// 2. SCHEDULE ROUTES
// =============================================================================
router.get('/doctors/:id/schedule', authMiddleware, DoctorController.getSchedule);
router.post('/doctors/:id/schedule', authMiddleware, DoctorController.updateSchedule);


// =============================================================================
// 3. VERIFICATION ROUTES (AI-Driven)
// =============================================================================
router.post('/doctors/:id/verify-diploma', authMiddleware, DoctorController.verifyDiploma);
router.post('/doctors/:id/verify-identity', authMiddleware, DoctorController.verifyDoctorIdentity);

// =============================================================================
// 4. GOOGLE CALENDAR ROUTES (CSRF Protected)
// =============================================================================
router.get('/doctors/:id/calendar/status', authMiddleware, DoctorController.getCalendarStatus);
router.get('/doctors/auth/google', authMiddleware, DoctorController.connectGoogleCalendar);

/**
 * 🟢 SECURITY NOTE: Google Callback remains public.
 * Security is enforced via a signed JWT state parameter in the Controller.
 */
router.get('/doctors/auth/google/callback', DoctorController.googleCallback);

router.delete('/doctors/:id/calendar', authMiddleware, DoctorController.disconnectGoogleCalendar);

export default router;