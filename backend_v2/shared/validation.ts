// ─── FIX #10: ZOD REQUEST VALIDATION MIDDLEWARE ──────────────────────────
// PROBLEM: All input validation was manual and scattered across controllers.
// Missing fields caused runtime crashes, and inconsistent error messages
// made debugging difficult. No structured schema enforcement.
//
// FIX: Centralized Zod schemas with Express middleware that validates
// req.body, req.query, and req.params before the request reaches controllers.
// Returns consistent 400 errors with field-level details.
// ─────────────────────────────────────────────────────────────────────────

import { z, ZodSchema, ZodError } from 'zod';
import { Request, Response, NextFunction } from 'express';

// ─── VALIDATION MIDDLEWARE ───────────────────────────────────────────────

interface ValidationSchemas {
    body?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
}

/**
 * Express middleware that validates request data against Zod schemas.
 * Validated data replaces the original req properties so controllers
 * receive typed, sanitized input.
 */
export function validate(schemas: ValidationSchemas) {
    return (req: Request, res: Response, next: NextFunction) => {
        const errors: Array<{ location: string; field: string; message: string }> = [];

        if (schemas.body) {
            const result = schemas.body.safeParse(req.body);
            if (!result.success) {
                errors.push(...formatZodErrors(result.error, 'body'));
            } else {
                req.body = result.data;
            }
        }

        if (schemas.query) {
            const result = schemas.query.safeParse(req.query);
            if (!result.success) {
                errors.push(...formatZodErrors(result.error, 'query'));
            } else {
                (req as any).query = result.data;
            }
        }

        if (schemas.params) {
            const result = schemas.params.safeParse(req.params);
            if (!result.success) {
                errors.push(...formatZodErrors(result.error, 'params'));
            } else {
                req.params = result.data;
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Validation Failed',
                details: errors
            });
        }

        next();
    };
}

function formatZodErrors(error: ZodError, location: string) {
    return error.errors.map(e => ({
        location,
        field: e.path.join('.'),
        message: e.message
    }));
}

// ─── BOOKING SCHEMAS ─────────────────────────────────────────────────────

export const CreateBookingBody = z.object({
    doctorId: z.string().min(1, 'Doctor ID is required'),
    timeSlot: z.string().min(1, 'Time slot is required').refine(
        (val) => !isNaN(Date.parse(val)),
        { message: 'Time slot must be a valid ISO 8601 date string' }
    ),
    paymentToken: z.string().min(1, 'Payment token is required'),
    patientName: z.string().optional(),
    doctorName: z.string().optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Low'),
    reason: z.string().max(500).default('General Checkup'),
});

export const CancelBookingBody = z.object({
    appointmentId: z.string().uuid('Invalid appointment ID format'),
});

export const UpdateAppointmentBody = z.object({
    appointmentId: z.string().uuid('Invalid appointment ID format'),
    patientArrived: z.boolean().optional(),
    status: z.enum([
        'CONFIRMED', 'IN_PROGRESS', 'COMPLETED',
        'CANCELLED', 'CANCELLED_NO_SHOW'
    ]).optional(),
});

export const GetAppointmentsQuery = z.object({
    doctorId: z.string().optional(),
    patientId: z.string().optional(),
    practitioner: z.string().optional(), // FHIR search alias
    patient: z.string().optional(),      // FHIR search alias
    startKey: z.string().optional(),
}).refine(
    (data) => data.doctorId || data.patientId || data.practitioner || data.patient,
    { message: 'Either doctorId or patientId is required' }
);

// ─── BILLING SCHEMAS ─────────────────────────────────────────────────────

export const PayBillBody = z.object({
    billId: z.string().min(1, 'Bill ID is required'),
    patientId: z.string().min(1, 'Patient ID is required'),
    paymentMethodId: z.string().min(1, 'Payment method ID is required'),
});

export const GetBillingQuery = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    startKey: z.string().optional(),
});

// ─── PATIENT SCHEMAS ─────────────────────────────────────────────────────

export const CreatePatientBody = z.object({
    email: z.string().email('Invalid email format'),
    name: z.string().min(1, 'Name is required').max(200),
    role: z.literal('patient').default('patient'),
    dob: z.string().optional().refine(
        (val) => {
            if (!val) return true;
            const parsed = Date.parse(val);
            if (isNaN(parsed)) return false;
            const date = new Date(parsed);
            const now = new Date();
            const minDate = new Date('1900-01-01');
            return date <= now && date >= minDate;
        },
        { message: 'Date of birth must be a valid date between 1900-01-01 and today' }
    ),
    gender: z.enum(['male', 'female', 'other', 'unknown']).default('unknown'),
    phone: z.string().optional(),
    consentDetails: z.object({
        agreedToTerms: z.literal(true, {
            errorMap: () => ({ message: 'You must agree to the Terms and Privacy Policy' })
        }),
        policyVersion: z.string().optional(),
    }),
});

export const UpdateProfileBody = z.object({
    name: z.string().min(1).max(200).optional(),
    avatar: z.string().optional(),
    phone: z.string().optional(),
    address: z.any().optional(),
    preferences: z.any().optional(),
    dob: z.string().optional().refine(
        (val) => {
            if (!val) return true;
            const parsed = Date.parse(val);
            if (isNaN(parsed)) return false;
            const date = new Date(parsed);
            const now = new Date();
            const minDate = new Date('1900-01-01');
            return date <= now && date >= minDate;
        },
        { message: 'Date of birth must be a valid date between 1900-01-01 and today' }
    ),
    fcmToken: z.string().optional(),
}).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
);

export const VerifyIdentityBody = z.object({
    selfieImage: z.string().min(1, 'Selfie image is required'),
    idImage: z.string().optional(),
    gender: z.enum(['male', 'female', 'other', 'unknown']).optional(),
});

// ─── DOCTOR SCHEMAS ──────────────────────────────────────────────────────

export const CreateDoctorBody = z.object({
    email: z.string().email('Invalid email format'),
    name: z.string().min(1, 'Name is required').max(200),
    specialization: z.string().min(1, 'Specialization is required'),
    consultationFee: z.number().min(0, 'Consultation fee must be non-negative').optional(),
    consentDetails: z.object({
        agreedToTerms: z.literal(true, {
            errorMap: () => ({ message: 'You must agree to the Terms and Privacy Policy' })
        }),
        policyVersion: z.string().optional(),
    }),
});

export const UpdateDoctorBody = z.object({
    name: z.string().min(1).max(200).optional(),
    specialization: z.string().optional(),
    consultationFee: z.number().min(0).optional(),
    phone: z.string().optional(),
    avatar: z.string().optional(),
    bio: z.string().max(2000).optional(),
    fcmToken: z.string().optional(),
}).refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
);

// ─── AI / COMMUNICATION SCHEMAS ──────────────────────────────────────────

export const SymptomCheckBody = z.object({
    text: z.string()
        .min(3, 'Symptom description must be at least 3 characters')
        .max(5000, 'Symptom description too long'),
});

export const ClinicalImageBody = z.object({
    imageBase64: z.string().min(1, 'Image data is required'),
    patientId: z.string().min(1, 'Patient ID is required'),
    prompt: z.string().max(2000).optional(),
});

export const PredictRiskBody = z.object({
    patientId: z.string().min(1, 'Patient ID is required'),
    symptoms: z.array(z.string()).optional(),
    medicalHistory: z.string().max(10000).optional(),
});

export const SummarizeConsultationBody = z.object({
    transcript: z.string().min(1, 'Consultation transcript is required').max(50000),
    patientId: z.string().min(1, 'Patient ID is required'),
    doctorId: z.string().min(1, 'Doctor ID is required'),
});

// ─── CHAT / VIDEO SCHEMAS ────────────────────────────────────────────────

export const ChatWsEventBody = z.object({
    type: z.enum(['message', 'typing', 'read']),
    recipientId: z.string().min(1, 'Recipient ID is required'),
    content: z.string().max(10000).optional(),
    appointmentId: z.string().optional(),
});

export const VideoSessionBody = z.object({
    appointmentId: z.string().min(1, 'Appointment ID is required'),
});
