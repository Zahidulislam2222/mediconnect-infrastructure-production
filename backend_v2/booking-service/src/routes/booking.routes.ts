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
import {
    searchCPTCodes,
    getCPTCode,
    getCPTCategories,
    assignCPTToAppointment
} from '../controllers/cpt.controller';
import {
    sendAppointmentReminder,
    getPendingReminders,
    getAppointmentReminders
} from '../controllers/reminder.controller';
import {
    createPriorAuth,
    getPatientPriorAuths,
    getPriorAuth,
    reviewPriorAuth,
    getPriorAuthCategories
} from '../controllers/prior-auth.controller';
import {
    checkEligibility,
    getEligibilityHistory,
    getAvailablePayers,
    batchEligibilityCheck
} from '../controllers/eligibility.controller';

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
// 📋 CPT/HCPCS PROCEDURE CODES
// =============================================================================

router.get('/billing/cpt/search', authMiddleware, searchCPTCodes);
router.get('/billing/cpt/categories', authMiddleware, getCPTCategories);
router.get('/billing/cpt/:code', authMiddleware, getCPTCode);
router.post('/billing/cpt/assign', authMiddleware, requireIdentityVerification, assignCPTToAppointment);

// =============================================================================
// 📱 APPOINTMENT REMINDERS (SNS)
// =============================================================================

router.post('/appointments/:appointmentId/reminders', authMiddleware, sendAppointmentReminder);
router.get('/appointments/:appointmentId/reminders', authMiddleware, getAppointmentReminders);
router.get('/appointments/reminders/pending', authMiddleware, getPendingReminders);

// =============================================================================
// 📋 PRIOR AUTHORIZATION
// =============================================================================

router.get('/prior-auth/categories', authMiddleware, getPriorAuthCategories);
router.post('/prior-auth', authMiddleware, requireIdentityVerification, createPriorAuth);
router.get('/prior-auth/:patientId', authMiddleware, getPatientPriorAuths);
router.get('/prior-auth/detail/:authId', authMiddleware, getPriorAuth);
router.put('/prior-auth/:authId/review', authMiddleware, requireIdentityVerification, reviewPriorAuth);

// =============================================================================
// 🏥 INSURANCE ELIGIBILITY
// =============================================================================

router.get('/eligibility/payers', authMiddleware, getAvailablePayers);
router.post('/eligibility/check', authMiddleware, checkEligibility);
router.post('/eligibility/batch', authMiddleware, batchEligibilityCheck);
router.get('/eligibility/:patientId', authMiddleware, getEligibilityHistory);

// =============================================================================
// ⚙️ SYSTEM & MAINTENANCE (Admin-only)
// =============================================================================

router.post('/system/cleanup-no-shows', authMiddleware, cleanupAppointments);

export default router;