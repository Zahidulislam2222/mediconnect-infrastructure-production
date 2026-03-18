import { Router } from 'express';
import * as DoctorController from '../controllers/doctor.controller';

// 🟢 BOTH MIDDLEWARES IMPORTED HERE
import { authMiddleware } from '../middleware/auth.middleware';
import { requireDoctorVerification } from '../middleware/verification.middleware';
import multer from 'multer';
import { uploadDicom } from '../modules/clinical/imaging.controller';

// 🟢 FIX #10: Zod schema validation
import { validate, CreateDoctorBody, UpdateDoctorBody } from '../../../shared/validation';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// =============================================================================
// 1. LOBBY ROUTES (Needs Auth, but user might not be verified yet)
// =============================================================================

// 🟢 FIX #10: Zod validation on mutation routes
router.post('/doctors', authMiddleware, validate({ body: CreateDoctorBody }), DoctorController.createDoctor);
router.post('/register-doctor', authMiddleware, validate({ body: CreateDoctorBody }), DoctorController.createDoctor);

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
router.get('/doctors', authMiddleware, DoctorController.getDoctors);

// GDPR FIX: Right to Rectification (Updating profile)
router.put('/doctors/:id', authMiddleware, requireDoctorVerification, validate({ body: UpdateDoctorBody }), DoctorController.updateDoctor);

// GDPR FIX: Right to Erasure
router.delete('/doctors/:id', authMiddleware, requireDoctorVerification, DoctorController.deleteDoctor);

router.post('/upload-scan', authMiddleware, requireDoctorVerification, upload.single('dicom'), uploadDicom);

// SCHEDULE ROUTES
router.get('/doctors/:id/schedule', authMiddleware, DoctorController.getSchedule);
router.put('/doctors/:id/schedule', authMiddleware, requireDoctorVerification, DoctorController.updateSchedule);

// GOOGLE CALENDAR ROUTES
router.get('/doctors/:id/calendar/status', authMiddleware, requireDoctorVerification, DoctorController.getCalendarStatus);
router.get('/doctors/auth/google', authMiddleware, requireDoctorVerification, DoctorController.connectGoogleCalendar);
router.delete('/doctors/:id/calendar', authMiddleware, requireDoctorVerification, DoctorController.disconnectGoogleCalendar);

// CLOSURE REQUEST
router.post('/doctors/:id/request-closure', authMiddleware, requireDoctorVerification, DoctorController.requestDoctorClosure);

router.get('/doctors/auth/google/callback', DoctorController.googleCallback);

export default router;