/**
 * Subscription Controller — Discount Pass Model (Cash-Pay Only)
 *
 * Manages patient subscriptions: create, cancel, upgrade, family members.
 * All discount calculations are SERVER-SIDE only (loophole #2).
 * Subscription status is NEVER active until invoice.paid webhook (loophole #3).
 *
 * Stripe objects used:
 *   - Customer: one per patient
 *   - Subscription: links customer to a Price (Plus/Premium)
 *   - Customer Portal: self-service card update, invoice history
 */

import { Request, Response } from 'express';
import Stripe from 'stripe';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient, getSSMParameter } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';
import { safeLog, safeError } from '../../../shared/logger';
import {
    PlanId,
    SubscriptionStatus,
    PLANS,
    TABLE_SUBSCRIPTIONS,
    FAMILY_MAX_MEMBERS,
    FAMILY_CHANGES_PER_YEAR,
    MIN_SUBSCRIPTION_AGE,
    SubscriptionRecord,
} from '../../../shared/subscription';

// ─── HELPERS ────────────────────────────────────────────────────────────

async function getStripe(region: string): Promise<Stripe> {
    const secretKey = await getSSMParameter('/mediconnect/prod/stripe/secret_key', region);
    return new Stripe(secretKey!, { apiVersion: '2024-12-18.acacia' });
}

async function getStripePriceId(planId: PlanId, region: string): Promise<string> {
    const paramName = planId === PlanId.PLUS
        ? '/mediconnect/prod/stripe/plus_price_id'
        : '/mediconnect/prod/stripe/premium_price_id';
    const priceId = await getSSMParameter(paramName, region);
    if (!priceId) throw new Error(`Stripe price ID not configured for plan: ${planId}`);
    return priceId;
}

function getRegion(req: Request): string {
    return (req.headers['x-user-region'] as string) || 'us-east-1';
}

async function getSubscription(patientId: string, region: string): Promise<SubscriptionRecord | null> {
    const db = getRegionalClient(region);
    const result = await db.send(new GetCommand({
        TableName: TABLE_SUBSCRIPTIONS,
        Key: { patientId },
    }));
    return (result.Item as SubscriptionRecord) || null;
}

// ─── CREATE SUBSCRIPTION ────────────────────────────────────────────────

/**
 * POST /subscriptions/create
 * Creates a Stripe Customer (if needed) + Subscription.
 * Does NOT write to DB — waits for invoice.paid webhook (loophole #3).
 * Returns client_secret for frontend payment confirmation.
 */
export async function createSubscription(req: Request, res: Response) {
    try {
        const { planId, consentTermsVersion } = req.body;
        const user = (req as any).user;
        const region = getRegion(req);

        // Age check (loophole #14)
        if (user.dob) {
            const age = Math.floor((Date.now() - new Date(user.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            if (age < MIN_SUBSCRIPTION_AGE) {
                return res.status(403).json({
                    error: 'MINIMUM_AGE_REQUIRED',
                    message: `Must be at least ${MIN_SUBSCRIPTION_AGE} years old to subscribe`,
                });
            }
        }

        // Check for existing active subscription
        const existing = await getSubscription(user.id, region);
        if (existing && (existing.status === SubscriptionStatus.ACTIVE || existing.status === SubscriptionStatus.PAST_DUE)) {
            return res.status(409).json({
                error: 'SUBSCRIPTION_EXISTS',
                message: 'Active subscription already exists. Cancel or upgrade instead.',
                currentPlan: existing.planId,
            });
        }

        const stripe = await getStripe(region);
        const priceId = await getStripePriceId(planId as PlanId, region);

        // Create or retrieve Stripe Customer
        let stripeCustomerId = existing?.stripeCustomerId;
        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { patientId: user.id, region },
            });
            stripeCustomerId = customer.id;
        }

        // Create subscription — payment_behavior ensures charge is attempted
        const subscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items: [{ price: priceId }],
            payment_behavior: 'default_incomplete',
            payment_settings: { save_default_payment_method: 'on_subscription' },
            expand: ['latest_invoice.payment_intent'],
            metadata: {
                patientId: user.id,
                planId,
                region,
                consentTimestamp: new Date().toISOString(),
                consentTermsVersion,
            },
        });

        const invoice = subscription.latest_invoice as Stripe.Invoice;
        const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

        await writeAuditLog({
            action: 'SUBSCRIPTION_INITIATED',
            actorId: user.id,
            resource: `subscription/${subscription.id}`,
            detail: `Plan: ${planId}, Status: ${subscription.status}`,
            region,
        });

        safeLog(`Subscription created: ${subscription.id} for patient ${user.id}, plan: ${planId}`);

        res.status(201).json({
            subscriptionId: subscription.id,
            clientSecret: paymentIntent.client_secret,
            status: subscription.status,
            planId,
        });
    } catch (err: any) {
        safeError('Failed to create subscription', err);
        res.status(500).json({ error: 'SUBSCRIPTION_CREATE_FAILED', message: err.message });
    }
}

// ─── CANCEL SUBSCRIPTION ────────────────────────────────────────────────

/**
 * POST /subscriptions/cancel
 * Cancels at period end — patient keeps access until cycle ends (loophole #7).
 * No mid-cycle refund.
 */
export async function cancelSubscription(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const region = getRegion(req);
        const { reason } = req.body;

        const sub = await getSubscription(user.id, region);
        if (!sub || sub.status === SubscriptionStatus.CANCELLED) {
            return res.status(404).json({ error: 'NO_ACTIVE_SUBSCRIPTION' });
        }

        const stripe = await getStripe(region);
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
            cancel_at_period_end: true,
            metadata: { cancelReason: reason || 'user_requested' },
        });

        const db = getRegionalClient(region);
        await db.send(new UpdateCommand({
            TableName: TABLE_SUBSCRIPTIONS,
            Key: { patientId: user.id },
            UpdateExpression: 'SET cancelAtPeriodEnd = :true, updatedAt = :now',
            ExpressionAttributeValues: {
                ':true': true,
                ':now': new Date().toISOString(),
            },
        }));

        await writeAuditLog({
            action: 'SUBSCRIPTION_CANCEL_REQUESTED',
            actorId: user.id,
            resource: `subscription/${sub.stripeSubscriptionId}`,
            detail: `Cancels at period end: ${sub.cycleEnd}. Reason: ${reason || 'none'}`,
            region,
        });

        res.json({
            message: 'Subscription will cancel at end of billing period',
            accessUntil: sub.cycleEnd,
            cancelAtPeriodEnd: true,
        });
    } catch (err: any) {
        safeError('Failed to cancel subscription', err);
        res.status(500).json({ error: 'CANCEL_FAILED', message: err.message });
    }
}

// ─── UPGRADE / DOWNGRADE ────────────────────────────────────────────────

/**
 * POST /subscriptions/upgrade
 * Changes plan (Plus ↔ Premium). Stripe handles proration.
 */
export async function upgradeSubscription(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const region = getRegion(req);
        const { newPlanId } = req.body;

        const sub = await getSubscription(user.id, region);
        if (!sub || sub.status !== SubscriptionStatus.ACTIVE) {
            return res.status(404).json({ error: 'NO_ACTIVE_SUBSCRIPTION' });
        }

        if (sub.planId === newPlanId) {
            return res.status(400).json({ error: 'SAME_PLAN', message: 'Already on this plan' });
        }

        const stripe = await getStripe(region);
        const newPriceId = await getStripePriceId(newPlanId as PlanId, region);

        // Get current subscription items
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
        const itemId = stripeSub.items.data[0].id;

        // Update with proration
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
            items: [{ id: itemId, price: newPriceId }],
            proration_behavior: 'create_prorations',
            metadata: { planId: newPlanId },
        });

        // Update local DB
        const plan = PLANS[newPlanId as PlanId];
        const db = getRegionalClient(region);
        await db.send(new UpdateCommand({
            TableName: TABLE_SUBSCRIPTIONS,
            Key: { patientId: user.id },
            UpdateExpression: 'SET planId = :plan, discountPercent = :disc, stripePriceId = :price, updatedAt = :now, cancelAtPeriodEnd = :false',
            ExpressionAttributeValues: {
                ':plan': newPlanId,
                ':disc': plan.discountPercent,
                ':price': newPriceId,
                ':now': new Date().toISOString(),
                ':false': false,
            },
        }));

        await writeAuditLog({
            action: 'SUBSCRIPTION_UPGRADED',
            actorId: user.id,
            resource: `subscription/${sub.stripeSubscriptionId}`,
            detail: `${sub.planId} → ${newPlanId}`,
            region,
        });

        res.json({ message: `Upgraded to ${plan.name}`, planId: newPlanId, discountPercent: plan.discountPercent });
    } catch (err: any) {
        safeError('Failed to upgrade subscription', err);
        res.status(500).json({ error: 'UPGRADE_FAILED', message: err.message });
    }
}

// ─── GET STATUS ─────────────────────────────────────────────────────────

/**
 * GET /subscriptions/status
 * Returns subscription from DB, not JWT (loophole #10).
 */
export async function getSubscriptionStatus(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const region = getRegion(req);

        const sub = await getSubscription(user.id, region);
        if (!sub) {
            return res.json({ planId: PlanId.FREE, status: 'none', discountPercent: 0 });
        }

        res.json({
            planId: sub.planId,
            status: sub.status,
            discountPercent: sub.discountPercent,
            freeGpVisitsRemaining: sub.freeGpVisitsRemaining,
            familyMembers: sub.familyMembers,
            cycleStart: sub.cycleStart,
            cycleEnd: sub.cycleEnd,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        });
    } catch (err: any) {
        safeError('Failed to get subscription status', err);
        res.status(500).json({ error: 'STATUS_FAILED', message: err.message });
    }
}

// ─── FAMILY MANAGEMENT (Premium Only) ───────────────────────────────────

/**
 * POST /subscriptions/family/add
 * Add a family member to share discount (loophole #5, #12).
 * Only primary account holder can add. Max 4 members, 2 changes/year.
 */
export async function addFamilyMember(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const region = getRegion(req);
        const { memberId, relationship } = req.body;

        const sub = await getSubscription(user.id, region);
        if (!sub || sub.status !== SubscriptionStatus.ACTIVE) {
            return res.status(404).json({ error: 'NO_ACTIVE_SUBSCRIPTION' });
        }

        if (sub.planId !== PlanId.PREMIUM) {
            return res.status(403).json({ error: 'PREMIUM_REQUIRED', message: 'Family sharing requires Premium plan' });
        }

        if (sub.familyMembers.length >= FAMILY_MAX_MEMBERS) {
            return res.status(400).json({
                error: 'FAMILY_LIMIT_REACHED',
                message: `Maximum ${FAMILY_MAX_MEMBERS} family members allowed`,
            });
        }

        if (sub.familyChangesThisYear >= FAMILY_CHANGES_PER_YEAR) {
            return res.status(400).json({
                error: 'FAMILY_CHANGES_EXHAUSTED',
                message: `Maximum ${FAMILY_CHANGES_PER_YEAR} family changes per year`,
            });
        }

        if (sub.familyMembers.includes(memberId)) {
            return res.status(409).json({ error: 'ALREADY_MEMBER' });
        }

        // Verify member is not already on another subscription
        const memberSub = await getSubscription(memberId, region);
        if (memberSub && memberSub.status === SubscriptionStatus.ACTIVE) {
            return res.status(409).json({
                error: 'MEMBER_HAS_SUBSCRIPTION',
                message: 'This person already has their own subscription',
            });
        }

        const db = getRegionalClient(region);
        await db.send(new UpdateCommand({
            TableName: TABLE_SUBSCRIPTIONS,
            Key: { patientId: user.id },
            UpdateExpression: 'SET familyMembers = list_append(familyMembers, :member), familyChangesThisYear = familyChangesThisYear + :one, updatedAt = :now',
            ExpressionAttributeValues: {
                ':member': [memberId],
                ':one': 1,
                ':now': new Date().toISOString(),
            },
        }));

        await writeAuditLog({
            action: 'FAMILY_MEMBER_ADDED',
            actorId: user.id,
            resource: `subscription/${sub.stripeSubscriptionId}/family/${memberId}`,
            detail: `Relationship: ${relationship}`,
            region,
        });

        res.json({ message: 'Family member added', memberId, familySize: sub.familyMembers.length + 1 });
    } catch (err: any) {
        safeError('Failed to add family member', err);
        res.status(500).json({ error: 'FAMILY_ADD_FAILED', message: err.message });
    }
}

/**
 * POST /subscriptions/family/remove
 * Remove a family member.
 */
export async function removeFamilyMember(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const region = getRegion(req);
        const { memberId } = req.body;

        const sub = await getSubscription(user.id, region);
        if (!sub) {
            return res.status(404).json({ error: 'NO_ACTIVE_SUBSCRIPTION' });
        }

        const memberIndex = sub.familyMembers.indexOf(memberId);
        if (memberIndex === -1) {
            return res.status(404).json({ error: 'MEMBER_NOT_FOUND' });
        }

        const db = getRegionalClient(region);
        await db.send(new UpdateCommand({
            TableName: TABLE_SUBSCRIPTIONS,
            Key: { patientId: user.id },
            UpdateExpression: `REMOVE familyMembers[${memberIndex}] SET familyChangesThisYear = familyChangesThisYear + :one, updatedAt = :now`,
            ExpressionAttributeValues: {
                ':one': 1,
                ':now': new Date().toISOString(),
            },
        }));

        await writeAuditLog({
            action: 'FAMILY_MEMBER_REMOVED',
            actorId: user.id,
            resource: `subscription/${sub.stripeSubscriptionId}/family/${memberId}`,
            detail: `Removed from family plan`,
            region,
        });

        res.json({ message: 'Family member removed', memberId });
    } catch (err: any) {
        safeError('Failed to remove family member', err);
        res.status(500).json({ error: 'FAMILY_REMOVE_FAILED', message: err.message });
    }
}

// ─── STRIPE CUSTOMER PORTAL ─────────────────────────────────────────────

/**
 * GET /subscriptions/portal
 * Returns Stripe Customer Portal URL for self-service:
 * - Update payment method
 * - View invoices
 * - Cancel subscription
 */
export async function getCustomerPortal(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const region = getRegion(req);

        const sub = await getSubscription(user.id, region);
        if (!sub?.stripeCustomerId) {
            return res.status(404).json({ error: 'NO_STRIPE_CUSTOMER' });
        }

        const stripe = await getStripe(region);
        const session = await stripe.billingPortal.sessions.create({
            customer: sub.stripeCustomerId,
            return_url: `${process.env.FRONTEND_URL || 'https://mediconnect.health'}/account/subscription`,
        });

        res.json({ url: session.url });
    } catch (err: any) {
        safeError('Failed to create portal session', err);
        res.status(500).json({ error: 'PORTAL_FAILED', message: err.message });
    }
}
