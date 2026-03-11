import { Router } from 'express';
import * as DoctorController from '../controllers/doctor.controller';

// 🟢 BOTH MIDDLEWARES IMPORTED HERE
import { authMiddleware } from '../middleware/auth.middleware';
import { requireDoctorVerification } from '../middleware/verification.middleware';

const router = Router();

// =============================================================================
// 1. LOBBY ROUTES (Needs Auth, but user might not be verified yet)
// =============================================================================

router.post('/doctors', authMiddleware, DoctorController.createDoctor);
router.post('/register-doctor', authMiddleware, DoctorController.createDoctor);

// Profile Loading for Dashboards
router.get('/register-doctor', authMiddleware, DoctorController.getDoctor);

// Get Specific Doctor (Patients viewing a doctor's profile)
router.get('/doctors/:id', authMiddleware, DoctorController.getDoctor);

// =============================================================================
// 2. VERIFICATION ROUTES (AI-Driven)
// Obviously, they need access to these to become verified!
// =============================================================================
router.post('/doctors/:id/verify-diploma', authMiddleware, DoctorController.verifyDiploma);
router.post('/doctors/:id/verify-identity', authMiddleware, DoctorController.verifyDoctorIdentity);


// =============================================================================
// 🛡️ 3. STRICT COMPLIANCE ROUTES (Requires Auth AND Verified Credentials)
// Notice how both middlewares are placed side-by-side here!
// =============================================================================

// HIPAA PRIVACY: Sanitized Directory
router.get('/doctors', authMiddleware, requireDoctorVerification, DoctorController.getDoctors);

// GDPR FIX: Right to Rectification (Updating profile)
router.put('/doctors/:id', authMiddleware, requireDoctorVerification, DoctorController.updateDoctor);

// GDPR FIX: Right to Erasure
router.delete('/doctors/:id', authMiddleware, requireDoctorVerification, DoctorController.deleteDoctor);

// SCHEDULE ROUTES
router.get('/doctors/:id/schedule', authMiddleware, requireDoctorVerification, DoctorController.getSchedule);
router.put('/doctors/:id/schedule', authMiddleware, requireDoctorVerification, DoctorController.updateSchedule);

// GOOGLE CALENDAR ROUTES
router.get('/doctors/:id/calendar/status', authMiddleware, requireDoctorVerification, DoctorController.getCalendarStatus);
router.get('/doctors/auth/google', authMiddleware, requireDoctorVerification, DoctorController.connectGoogleCalendar);
router.delete('/doctors/:id/calendar', authMiddleware, requireDoctorVerification, DoctorController.disconnectGoogleCalendar);

// CLOSURE REQUEST
router.post('/doctors/:id/request-closure', authMiddleware, requireDoctorVerification, DoctorController.requestDoctorClosure);

/**
 * 🟢 SECURITY NOTE: Google Callback remains public.
 * Security is enforced via a signed JWT state parameter in the Controller.
 */
router.get('/doctors/auth/google/callback', DoctorController.googleCallback);

export default router;