/**
 * Doctor Tier & Rate Management
 *
 * Handles doctor tier assignment, rate changes with 10% quarterly cap (loophole #4),
 * earnings visibility, and Stripe Connect account linking for payouts.
 */

import { Request, Response, NextFunction } from 'express';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';
import { safeLog, safeError } from '../../../shared/logger';
import {
    DoctorTier,
    DOCTOR_TIERS,
    isDoctorRateIncreaseAllowed,
    evaluateTierUpgrade,
    DoctorRateChange,
    TABLE_DOCTOR_PAYOUTS,
} from '../../../shared/subscription';

const TABLE_DOCTORS = process.env.DYNAMO_TABLE || 'mediconnect-doctors';

const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || 'us-east-1');
};

// ─── UPDATE DOCTOR RATE (Loophole #4: 10% quarterly cap) ───────────────

export const updateDoctorRate = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const db = getRegionalClient(region);
    const doctorId = (req as any).user?.sub || (req as any).user?.id;
    const { newRate } = req.body;

    if (!doctorId) return res.status(401).json({ error: 'UNAUTHORIZED' });

    // Get current doctor record
    const result = await db.send(new GetCommand({
        TableName: TABLE_DOCTORS,
        Key: { doctorId },
    }));

    if (!result.Item) return res.status(404).json({ error: 'DOCTOR_NOT_FOUND' });

    const currentRate = Number(result.Item.consultationFee) || 0;
    const rateHistory: DoctorRateChange[] = result.Item.rateHistory || [];

    // Enforce rate cap (loophole #4)
    const check = isDoctorRateIncreaseAllowed(currentRate, newRate, rateHistory);
    if (!check.allowed) {
        return res.status(403).json({
            error: 'RATE_INCREASE_BLOCKED',
            message: check.reason,
            currentRate,
            requestedRate: newRate,
            maxAllowed: Math.round(currentRate * 1.1 * 100) / 100,
        });
    }

    const rateChange: DoctorRateChange = {
        rate: newRate,
        effectiveDate: new Date().toISOString(),
        approvedBy: doctorId,
    };

    await db.send(new UpdateCommand({
        TableName: TABLE_DOCTORS,
        Key: { doctorId },
        UpdateExpression: 'SET consultationFee = :rate, rateHistory = list_append(if_not_exists(rateHistory, :empty), :change), updatedAt = :now',
        ExpressionAttributeValues: {
            ':rate': newRate,
            ':change': [rateChange],
            ':empty': [],
            ':now': new Date().toISOString(),
        },
    }));

    await writeAuditLog({
        action: 'DOCTOR_RATE_UPDATED',
        actorId: doctorId,
        resource: `doctor/${doctorId}/rate`,
        detail: `Rate changed: $${currentRate} → $${newRate}`,
        region,
    });

    res.json({
        message: 'Rate updated',
        previousRate: currentRate,
        newRate,
        nextChangeAllowedAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });
});

// ─── SET DOCTOR TIER (Admin Only) ───────────────────────────────────────

export const setDoctorTier = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const db = getRegionalClient(region);
    const adminId = (req as any).user?.sub || (req as any).user?.id;
    const { doctorId } = req.params;
    const { tier } = req.body;

    if (!(req as any).user?.isAdmin) {
        return res.status(403).json({ error: 'ADMIN_REQUIRED' });
    }

    const tierConfig = DOCTOR_TIERS[tier as DoctorTier];
    if (!tierConfig) return res.status(400).json({ error: 'INVALID_TIER' });

    await db.send(new UpdateCommand({
        TableName: TABLE_DOCTORS,
        Key: { doctorId },
        UpdateExpression: 'SET tier = :tier, doctorPercentage = :dp, platformPercentage = :pp, updatedAt = :now',
        ExpressionAttributeValues: {
            ':tier': tier,
            ':dp': tierConfig.doctorPercentage,
            ':pp': tierConfig.platformPercentage,
            ':now': new Date().toISOString(),
        },
    }));

    await writeAuditLog({
        action: 'DOCTOR_TIER_SET',
        actorId: adminId,
        resource: `doctor/${doctorId}/tier`,
        detail: `Tier set to ${tier} (${tierConfig.doctorPercentage}/${tierConfig.platformPercentage})`,
        region,
    });

    res.json({ message: `Doctor tier set to ${tier}`, ...tierConfig });
});

// ─── GET DOCTOR TIER INFO ───────────────────────────────────────────────

export const getDoctorTier = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const db = getRegionalClient(region);
    const doctorId = (req as any).user?.sub || (req as any).user?.id || req.params.doctorId;

    const result = await db.send(new GetCommand({
        TableName: TABLE_DOCTORS,
        Key: { doctorId },
    }));

    if (!result.Item) return res.status(404).json({ error: 'DOCTOR_NOT_FOUND' });

    const tier = (result.Item.tier as DoctorTier) || DoctorTier.NEW;
    const tierConfig = DOCTOR_TIERS[tier];

    // Check for auto-upgrade eligibility
    const monthsOnPlatform = result.Item.joinedDate
        ? Math.floor((Date.now() - new Date(result.Item.joinedDate).getTime()) / (30 * 24 * 60 * 60 * 1000))
        : 0;
    const rating = result.Item.rating || 0;
    const upgradeEligible = evaluateTierUpgrade(tier, monthsOnPlatform, rating);

    res.json({
        tier,
        doctorPercentage: tierConfig.doctorPercentage,
        platformPercentage: tierConfig.platformPercentage,
        consultationFee: result.Item.consultationFee,
        rateHistory: result.Item.rateHistory || [],
        upgradeEligibleTo: upgradeEligible,
        monthsOnPlatform,
        rating,
    });
});

// ─── GET DOCTOR EARNINGS ────────────────────────────────────────────────

export const getDoctorEarnings = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const db = getRegionalClient(region);
    const doctorId = (req as any).user?.sub || (req as any).user?.id;

    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
    const result = await db.send(new QueryCommand({
        TableName: TABLE_DOCTOR_PAYOUTS,
        KeyConditionExpression: 'doctorId = :did',
        ExpressionAttributeValues: { ':did': doctorId },
        ScanIndexForward: false, // newest first
        Limit: 12, // last 12 payouts (~3 months weekly)
    }));

    const payouts = result.Items || [];
    const totalEarnings = payouts.reduce((sum: number, p: any) => sum + (p.netPayout || 0), 0);
    const totalVisits = payouts.reduce((sum: number, p: any) => sum + (p.totalVisits || 0), 0);

    res.json({
        payouts,
        summary: {
            totalEarnings: Math.round(totalEarnings * 100) / 100,
            totalVisits,
            periodsCovered: payouts.length,
        },
    });
});

// ─── LINK STRIPE CONNECT ACCOUNT ────────────────────────────────────────

export const linkStripeConnect = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const db = getRegionalClient(region);
    const doctorId = (req as any).user?.sub || (req as any).user?.id;
    const { stripeConnectAccountId } = req.body;

    if (!stripeConnectAccountId?.startsWith('acct_')) {
        return res.status(400).json({ error: 'INVALID_ACCOUNT_ID', message: 'Must be a valid Stripe Connect account ID' });
    }

    await db.send(new UpdateCommand({
        TableName: TABLE_DOCTORS,
        Key: { doctorId },
        UpdateExpression: 'SET stripeConnectAccountId = :acid, updatedAt = :now',
        ExpressionAttributeValues: {
            ':acid': stripeConnectAccountId,
            ':now': new Date().toISOString(),
        },
    }));

    await writeAuditLog({
        action: 'STRIPE_CONNECT_LINKED',
        actorId: doctorId,
        resource: `doctor/${doctorId}/stripe-connect`,
        detail: `Linked Stripe Connect account`,
        region,
    });

    res.json({ message: 'Stripe Connect account linked' });
});
