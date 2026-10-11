/**
 * Subscription — Discount Pass Model (Cash-Pay Only)
 *
 * MediConnect subscription system. Patients pay a monthly fee for discounted
 * doctor visits. Platform NEVER loses money — every transaction has positive margin.
 *
 * Model:  Discount Pass (NOT credits, NOT insurance)
 * Legal:  Cash-pay only — no Medicare/Medicaid/insurance
 * Ruling: Halal (Ijara — service contract with transparent pricing)
 *
 * Loopholes addressed in this file:
 *   #2  — Server-side discount only (calculateDiscountedPrice)
 *   #4  — Doctor rate cap (isDoctorRateIncreaseAllowed)
 *   #10 — Never trust JWT for discount (types enforce DB lookup)
 */

import { z } from 'zod';
import { setting } from './settings';
import policySource from './content/subscription.json';

// ─── SUBSCRIPTION PLANS ─────────────────────────────────────────────────

export enum PlanId {
    FREE = 'free',
    PLUS = 'plus',
    PREMIUM = 'premium',
}

export enum SubscriptionStatus {
    ACTIVE = 'active',
    PAST_DUE = 'past_due',
    CANCELLED = 'cancelled',
    INCOMPLETE = 'incomplete',
}

export interface PlanConfig {
    planId: PlanId;
    name: string;
    priceMonthly: number;       // USD
    discountPercent: number;    // 0, 20, or 30
    platformFeePercent: number; // what platform keeps from visit
    freeGpVisitsPerMonth: number;
    familyMaxMembers: number;
    priorityBooking: boolean;
    chatFollowUps: boolean;
}

// ─── DOCTOR TIERS ───────────────────────────────────────────────────────

export enum DoctorTier {
    NEW = 'new',
    ESTABLISHED = 'established',
    TOP = 'top',
}

export interface DoctorTierConfig {
    tier: DoctorTier;
    doctorPercentage: number;   // what doctor keeps
    platformPercentage: number; // what platform keeps
    minMonths: number;          // months on platform to qualify
    minRating: number;          // minimum rating to qualify
}

const percentage = z.number().finite().min(0).max(100);
const nonnegativeInteger = z.number().int().nonnegative();
const policySchema = z.object({
    PLANS: z.record(z.nativeEnum(PlanId), z.object({
        planId: z.nativeEnum(PlanId), name: z.string().min(1), priceMonthly: z.number().finite().nonnegative(),
        discountPercent: percentage, platformFeePercent: percentage, freeGpVisitsPerMonth: nonnegativeInteger,
        familyMaxMembers: nonnegativeInteger, priorityBooking: z.boolean(), chatFollowUps: z.boolean(),
    }).strict()),
    DOCTOR_TIERS: z.record(z.nativeEnum(DoctorTier), z.object({
        tier: z.nativeEnum(DoctorTier), doctorPercentage: percentage, platformPercentage: percentage,
        minMonths: nonnegativeInteger, minRating: z.number().min(0).max(5),
    }).strict()),
    MAX_RATE_INCREASE_PERCENT: percentage,
    PAYOUT_HOLD_DAYS: nonnegativeInteger, FAMILY_MAX_MEMBERS: nonnegativeInteger,
    FAMILY_CHANGES_PER_YEAR: nonnegativeInteger, QUARTER_DAYS: z.number().int().positive(),
    MIN_SUBSCRIPTION_AGE: nonnegativeInteger, GRACE_PERIOD_DAYS: nonnegativeInteger,
    GP_SPECIALTIES: z.array(z.string().min(1)).nonempty(),
}).strict().superRefine((value, context) => {
    for (const id of Object.values(PlanId)) {
        if (value.PLANS[id]?.planId !== id) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Missing or mismatched plan' });
    }
    for (const tier of Object.values(DoctorTier)) {
        const entry = value.DOCTOR_TIERS[tier];
        if (!entry || entry.tier !== tier || entry.doctorPercentage + entry.platformPercentage !== 100) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: 'Missing or invalid tier shares' });
        }
    }
});
export function validateSubscriptionPolicy(value: unknown) { return policySchema.parse(value); }
const policy = validateSubscriptionPolicy(policySource);
export const PLANS = policy.PLANS as Record<PlanId, PlanConfig>;
export const DOCTOR_TIERS = policy.DOCTOR_TIERS as Record<DoctorTier, DoctorTierConfig>;

// ─── CONSTANTS ──────────────────────────────────────────────────────────

/** Max rate increase per quarter (loophole #4) */
export const MAX_RATE_INCREASE_PERCENT = policy.MAX_RATE_INCREASE_PERCENT;

/** Days to hold doctor payouts after visit (loophole #8 — refund protection) */
export const PAYOUT_HOLD_DAYS = policy.PAYOUT_HOLD_DAYS;

/** Max family members on Premium plan (loophole #5) */
export const FAMILY_MAX_MEMBERS = policy.FAMILY_MAX_MEMBERS;

/** Max family member changes per year (loophole #5) */
export const FAMILY_CHANGES_PER_YEAR = policy.FAMILY_CHANGES_PER_YEAR;

/** Days in a quarter for rate cap calculation */
export const QUARTER_DAYS = policy.QUARTER_DAYS;

/** Minimum age for subscription (loophole #14) */
export const MIN_SUBSCRIPTION_AGE = policy.MIN_SUBSCRIPTION_AGE;

/** Grace period days after payment failure before cancellation */
export const GRACE_PERIOD_DAYS = policy.GRACE_PERIOD_DAYS;

/** GP specialty identifiers (for free GP visit on Premium) */
export const GP_SPECIALTIES = policy.GP_SPECIALTIES;

// ─── DynamoDB TABLE NAMES ───────────────────────────────────────────────

export const TABLE_SUBSCRIPTIONS = setting("TABLE_SUBSCRIPTIONS");
export const TABLE_DOCTOR_PAYOUTS = setting("TABLE_DOCTOR_PAYOUTS");

// ─── TYPES — DynamoDB Records ───────────────────────────────────────────

export interface SubscriptionRecord {
    patientId: string;
    planId: PlanId;
    status: SubscriptionStatus;
    discountPercent: number;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    freeGpVisitsRemaining: number;
    familyMembers: string[];
    familyChangesThisYear: number;
    cycleStart: string;
    cycleEnd: string;
    cancelAtPeriodEnd: boolean;
    disputeFrozen: boolean;
    consentTimestamp: string;
    consentTermsVersion: string;
    createdAt: string;
    updatedAt: string;
}

export interface DoctorPayoutRecord {
    doctorId: string;
    periodEndPayoutId: string; // SK: periodEnd#payoutId
    periodStart: string;
    periodEnd: string;
    totalVisits: number;
    payPerVisitEarnings: number;
    subscriptionEarnings: number;
    grossEarnings: number;
    platformFee: number;
    netPayout: number;
    stripeTransferId: string;
    status: 'pending' | 'paid' | 'failed';
    paidAt?: string;
}

export interface DoctorRateChange {
    rate: number;
    effectiveDate: string;
    approvedBy: string;
}

// ─── DISCOUNT CALCULATION (Server-Side Only — Loophole #2) ──────────────

/**
 * Calculate the discounted price for a visit.
 * CRITICAL: This is the ONLY place discounts are calculated.
 * Never accept discount values from the client.
 *
 * @param doctorRate - Doctor's full rate (from DB, not client)
 * @param planId - Patient's plan (from DB, not JWT)
 * @returns { originalPrice, discountedPrice, discountPercent, savings }
 */
export function calculateDiscountedPrice(
    doctorRate: number,
    planId: PlanId,
): {
    originalPrice: number;
    discountedPrice: number;
    discountPercent: number;
    savings: number;
} {
    const plan = PLANS[planId];
    if (!plan) {
        return { originalPrice: doctorRate, discountedPrice: doctorRate, discountPercent: 0, savings: 0 };
    }

    const discountPercent = plan.discountPercent;
    const discountedPrice = Math.round(doctorRate * (1 - discountPercent / 100) * 100) / 100;
    const savings = Math.round((doctorRate - discountedPrice) * 100) / 100;

    return { originalPrice: doctorRate, discountedPrice, discountPercent, savings };
}

/**
 * Calculate platform and doctor shares from a visit payment.
 *
 * @param paymentAmount - Amount actually charged (discounted or full)
 * @param doctorTier - Doctor's tier (from DB)
 * @returns { doctorShare, platformShare }
 */
export function calculateShares(
    paymentAmount: number,
    doctorTier: DoctorTier,
): {
    doctorShare: number;
    platformShare: number;
    doctorPercentage: number;
    platformPercentage: number;
} {
    const tierConfig = DOCTOR_TIERS[doctorTier] || DOCTOR_TIERS[DoctorTier.NEW];
    const doctorShare = Math.round(paymentAmount * tierConfig.doctorPercentage / 100 * 100) / 100;
    const platformShare = Math.round((paymentAmount - doctorShare) * 100) / 100;

    return {
        doctorShare,
        platformShare,
        doctorPercentage: tierConfig.doctorPercentage,
        platformPercentage: tierConfig.platformPercentage,
    };
}

// ─── RATE CAP ENFORCEMENT (Loophole #4) ─────────────────────────────────

/**
 * Check if a doctor's rate increase is within the allowed 10% per quarter.
 *
 * @param currentRate - Doctor's current rate
 * @param newRate - Proposed new rate
 * @param rateHistory - Array of past rate changes
 * @returns { allowed, reason }
 */
export function isDoctorRateIncreaseAllowed(
    currentRate: number,
    newRate: number,
    rateHistory: DoctorRateChange[],
): { allowed: boolean; reason: string } {
    // Rate decreases are always allowed
    if (newRate <= currentRate) {
        return { allowed: true, reason: 'Rate decrease — always permitted' };
    }

    // Check percentage increase
    const increasePercent = ((newRate - currentRate) / currentRate) * 100;
    if (increasePercent > MAX_RATE_INCREASE_PERCENT) {
        return {
            allowed: false,
            reason: `Rate increase of ${increasePercent.toFixed(1)}% exceeds maximum ${MAX_RATE_INCREASE_PERCENT}% per quarter`,
        };
    }

    // Check if there was a rate change within the last quarter
    const quarterAgo = new Date();
    quarterAgo.setDate(quarterAgo.getDate() - QUARTER_DAYS);

    const recentChanges = rateHistory.filter(
        (change) => new Date(change.effectiveDate) > quarterAgo && change.rate > 0,
    );

    if (recentChanges.length > 0) {
        const lastChange = recentChanges[recentChanges.length - 1];
        return {
            allowed: false,
            reason: `Rate was already changed on ${lastChange.effectiveDate}. Next change allowed after ${QUARTER_DAYS} days.`,
        };
    }

    return { allowed: true, reason: 'Rate increase within allowed limits' };
}

/**
 * Check if a doctor is a GP (eligible for free Premium visit).
 */
export function isGpSpecialty(specialty: string): boolean {
    return GP_SPECIALTIES.includes(specialty?.toLowerCase?.() || '');
}

/**
 * Check if a doctor qualifies for an automatic tier upgrade.
 */
export function evaluateTierUpgrade(
    currentTier: DoctorTier,
    monthsOnPlatform: number,
    rating: number,
): DoctorTier | null {
    if (currentTier === DoctorTier.TOP) return null;

    if (currentTier === DoctorTier.ESTABLISHED &&
        monthsOnPlatform >= DOCTOR_TIERS[DoctorTier.TOP].minMonths &&
        rating >= DOCTOR_TIERS[DoctorTier.TOP].minRating) {
        return DoctorTier.TOP;
    }

    if (currentTier === DoctorTier.NEW &&
        monthsOnPlatform >= DOCTOR_TIERS[DoctorTier.ESTABLISHED].minMonths &&
        rating >= DOCTOR_TIERS[DoctorTier.ESTABLISHED].minRating) {
        return DoctorTier.ESTABLISHED;
    }

    return null;
}

// ─── ZOD SCHEMAS ────────────────────────────────────────────────────────

export const CreateSubscriptionSchema = z.object({
    planId: z.enum([PlanId.PLUS, PlanId.PREMIUM]),
    consentTermsVersion: z.string().min(1),
});

export const CancelSubscriptionSchema = z.object({
    reason: z.string().max(500).optional(),
});

export const UpgradeSubscriptionSchema = z.object({
    newPlanId: z.enum([PlanId.PLUS, PlanId.PREMIUM]),
});

export const AddFamilyMemberSchema = z.object({
    memberId: z.string().uuid(),
    relationship: z.enum(['spouse', 'child', 'parent', 'sibling']),
});

export const RemoveFamilyMemberSchema = z.object({
    memberId: z.string().uuid(),
});

export const UpdateDoctorRateSchema = z.object({
    newRate: z.number().positive().max(10000),
});

export const SetDoctorTierSchema = z.object({
    tier: z.enum([DoctorTier.NEW, DoctorTier.ESTABLISHED, DoctorTier.TOP]),
});
