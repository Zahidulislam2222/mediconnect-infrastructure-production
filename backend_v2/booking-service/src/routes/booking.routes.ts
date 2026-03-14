import { Router } from 'express';
import {
    createBooking,
    getAppointments,
    cleanupAppointments,
    cancelBookingUser,
    getReceipt,
    updateAppointment 
} from '../controllers/booking.controller';
import { authMiddleware } from '../middleware/auth.middleware';

// 🟢 ADD THIS IMPORT
import { requireIdentityVerification } from '../middleware/verification.middleware'; 

import {
    getPatientBilling,
    payBill,
    getDoctorAnalytics
} from '../controllers/billing.controller';

const router = Router();

// =============================================================================
// 🏥 CLINICAL BOOKING ROUTES (Protected & Verified)
// =============================================================================

// 🟢 ADD requireIdentityVerification to all of these
router.post('/appointments', authMiddleware, requireIdentityVerification, createBooking);
router.get('/appointments', authMiddleware, requireIdentityVerification, getAppointments);
router.put('/appointments', authMiddleware, requireIdentityVerification, updateAppointment);
router.post('/appointments/cancel', authMiddleware, requireIdentityVerification, cancelBookingUser);


// =============================================================================
// 💳 BILLING & ANALYTICS (Protected & Verified)
// =============================================================================

router.get('/billing', authMiddleware, requireIdentityVerification, getPatientBilling);
router.post('/billing/pay', authMiddleware, requireIdentityVerification, payBill);
router.get('/billing/receipt/:appointmentId', authMiddleware, requireIdentityVerification, getReceipt);
router.get('/analytics/revenue', authMiddleware, requireIdentityVerification, getDoctorAnalytics);


// =============================================================================
// ⚙️ SYSTEM & MAINTENANCE (Internal - No User Auth Needed)
// =============================================================================

router.post('/system/cleanup-no-shows', cleanupAppointments);

export default router;