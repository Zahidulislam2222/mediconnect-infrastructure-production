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

// 🟢 FIX #10: Zod schema validation
import {
    validate,
    CreateBookingBody,
    CancelBookingBody,
    UpdateAppointmentBody,
    GetAppointmentsQuery,
    PayBillBody,
    GetBillingQuery,
} from '../../../shared/validation';

const router = Router();

// =============================================================================
// 🏥 CLINICAL BOOKING ROUTES (Protected & Verified)
// =============================================================================

// 🟢 FIX #10: Zod validation runs AFTER auth but BEFORE controllers
router.post('/appointments', authMiddleware, requireIdentityVerification, validate({ body: CreateBookingBody }), createBooking);
router.get('/appointments', authMiddleware, requireIdentityVerification, validate({ query: GetAppointmentsQuery }), getAppointments);
router.put('/appointments', authMiddleware, requireIdentityVerification, validate({ body: UpdateAppointmentBody }), updateAppointment);
router.post('/appointments/cancel', authMiddleware, requireIdentityVerification, validate({ body: CancelBookingBody }), cancelBookingUser);


// =============================================================================
// 💳 BILLING & ANALYTICS (Protected & Verified)
// =============================================================================

router.get('/billing', authMiddleware, requireIdentityVerification, validate({ query: GetBillingQuery }), getPatientBilling);
router.post('/billing/pay', authMiddleware, requireIdentityVerification, validate({ body: PayBillBody }), payBill);
router.get('/billing/receipt/:appointmentId', authMiddleware, requireIdentityVerification, getReceipt);
router.get('/analytics/revenue', authMiddleware, requireIdentityVerification, getDoctorAnalytics);


// =============================================================================
// ⚙️ SYSTEM & MAINTENANCE (Admin-only)
// =============================================================================

router.post('/system/cleanup-no-shows', authMiddleware, cleanupAppointments);

export default router;