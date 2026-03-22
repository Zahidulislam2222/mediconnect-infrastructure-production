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
import { z } from 'zod';

// ─── FIX #13: Zod schemas for previously unvalidated routes ──────────────

const CreatePriorAuthBody = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    category: z.string().min(1, 'Category is required'),
    items: z.array(z.object({
        cptCode: z.string().optional(),
        description: z.string().optional(),
        quantity: z.number().int().positive().optional(),
        estimatedCost: z.number().min(0).optional(),
        serviceDate: z.string().optional(),
    })).min(1, 'At least one item is required'),
    urgency: z.enum(['routine', 'urgent', 'emergent']).optional(),
    insurerName: z.string().optional(),
    memberId: z.string().optional(),
    clinicalJustification: z.string().max(5000).optional(),
    diagnosisCodes: z.array(z.string()).optional(),
    requestingProviderId: z.string().optional(),
    servicingProviderId: z.string().optional(),
});

const ReviewPriorAuthBody = z.object({
    decision: z.enum(['approved', 'denied'], { required_error: 'decision must be "approved" or "denied"' }),
    denialReasonCode: z.string().optional(),
    approvedUnits: z.number().int().positive().optional(),
    expirationDate: z.string().optional(),
    notes: z.string().max(2000).optional(),
});

const CheckEligibilityBody = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    payerId: z.string().min(1, 'Payer ID is required'),
    memberId: z.string().min(1, 'Member ID is required'),
    serviceCategory: z.string().optional(),
    serviceDate: z.string().optional(),
});

const BatchEligibilityCheckBody = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    payerId: z.string().min(1, 'Payer ID is required'),
    memberId: z.string().min(1, 'Member ID is required'),
    serviceCategories: z.array(z.string()).min(1, 'At least one service category is required'),
});

const AssignCPTBody = z.object({
    appointmentId: z.string().min(1, 'Appointment ID is required'),
    cptCodes: z.array(z.string()).min(1, 'At least one CPT code is required'),
});

const SendReminderBody = z.object({
    type: z.enum(['24h', '1h', 'custom']).optional(),
    customMessage: z.string().max(500).optional(),
    channel: z.enum(['sms', 'email', 'both']).optional(),
});

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
router.post('/billing/cpt/assign', authMiddleware, requireIdentityVerification, validate({ body: AssignCPTBody }), assignCPTToAppointment);

// =============================================================================
// 📱 APPOINTMENT REMINDERS (SNS)
// =============================================================================

router.post('/appointments/:appointmentId/reminders', authMiddleware, validate({ body: SendReminderBody }), sendAppointmentReminder);
router.get('/appointments/:appointmentId/reminders', authMiddleware, getAppointmentReminders);
router.get('/appointments/reminders/pending', authMiddleware, getPendingReminders);

// =============================================================================
// 📋 PRIOR AUTHORIZATION
// =============================================================================

router.get('/prior-auth/categories', authMiddleware, getPriorAuthCategories);
router.post('/prior-auth', authMiddleware, requireIdentityVerification, validate({ body: CreatePriorAuthBody }), createPriorAuth);
router.get('/prior-auth/:patientId', authMiddleware, getPatientPriorAuths);
router.get('/prior-auth/detail/:authId', authMiddleware, getPriorAuth);
router.put('/prior-auth/:authId/review', authMiddleware, requireIdentityVerification, validate({ body: ReviewPriorAuthBody }), reviewPriorAuth);

// =============================================================================
// 🏥 INSURANCE ELIGIBILITY
// =============================================================================

router.get('/eligibility/payers', authMiddleware, getAvailablePayers);
router.post('/eligibility/check', authMiddleware, validate({ body: CheckEligibilityBody }), checkEligibility);
router.post('/eligibility/batch', authMiddleware, validate({ body: BatchEligibilityCheckBody }), batchEligibilityCheck);
router.get('/eligibility/:patientId', authMiddleware, getEligibilityHistory);

// =============================================================================
// ⚙️ SYSTEM & MAINTENANCE (Admin-only)
// =============================================================================

router.post('/system/cleanup-no-shows', authMiddleware, cleanupAppointments);

export default router;