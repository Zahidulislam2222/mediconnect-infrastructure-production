/**
 * Doctor Payout Controller — Weekly Stripe Connect Transfers
 *
 * Calculates doctor earnings from completed appointments, applies the
 * doctor's tier percentage, enforces 7-day hold (loophole #8), and
 * transfers via Stripe Connect.
 *
 * Triggered by admin or scheduled job (not automatic — requires review).
 */

import { Request, Response, NextFunction } from 'express';
import { QueryCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import Stripe from 'stripe';
import { getRegionalClient, getSSMParameter } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';
import { safeLog, safeError } from '../../../shared/logger';
import { randomUUID } from 'crypto';
import {
    DoctorTier,
    DOCTOR_TIERS,
    PAYOUT_HOLD_DAYS,
    TABLE_DOCTOR_PAYOUTS,
    calculateShares,
} from '../../../shared/subscription';

const TABLE_APPOINTMENTS = process.env.TABLE_APPOINTMENTS || 'mediconnect-appointments';
const TABLE_DOCTORS = process.env.TABLE_DOCTORS || 'mediconnect-doctors';

const catchAsync = (fn: any) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || 'us-east-1');
};

// ─── CALCULATE PENDING PAYOUTS ──────────────────────────────────────────

/**
 * GET /admin/payouts/pending
 * Admin reviews pending payouts before execution.
 */
export const getPendingPayouts = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const db = getRegionalClient(region);

    if (!(req as any).user?.isAdmin) {
        return res.status(403).json({ error: 'ADMIN_REQUIRED' });
    }

    // Find all completed appointments older than PAYOUT_HOLD_DAYS (loophole #8)
    const holdCutoff = new Date();
    holdCutoff.setDate(holdCutoff.getDate() - PAYOUT_HOLD_DAYS);
    const cutoffStr = holdCutoff.toISOString();

    // Get completed appointments eligible for payout
    const result = await db.send(new QueryCommand({
        TableName: TABLE_APPOINTMENTS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#s = :completed',
        FilterExpression: 'createdAt <= :cutoff AND (attribute_not_exists(payoutProcessed) OR payoutProcessed = :false)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
            ':completed': 'COMPLETED',
            ':cutoff': cutoffStr,
            ':false': false,
        },
    }));

    // Group by doctor
    const doctorEarnings: Record<string, {
        doctorId: string;
        visitCount: number;
        payPerVisitTotal: number;
        subscriptionTotal: number;
        appointments: string[];
    }> = {};

    for (const apt of result.Items || []) {
        const doctorId = apt.doctorId;
        if (!doctorEarnings[doctorId]) {
            doctorEarnings[doctorId] = {
                doctorId,
                visitCount: 0,
                payPerVisitTotal: 0,
                subscriptionTotal: 0,
                appointments: [],
            };
        }

        const earning = doctorEarnings[doctorId];
        earning.visitCount++;
        earning.appointments.push(apt.appointmentId);

        const amount = apt.amountPaid || 0;
        if (apt.subscriptionId) {
            earning.subscriptionTotal += amount;
        } else {
            earning.payPerVisitTotal += amount;
        }
    }

    // Enrich with doctor tier info
    const payoutSummaries = [];
    for (const [doctorId, earning] of Object.entries(doctorEarnings)) {
        const doctorResult = await db.send(new QueryCommand({
            TableName: TABLE_DOCTORS,
            KeyConditionExpression: 'doctorId = :did',
            ExpressionAttributeValues: { ':did': doctorId },
            Limit: 1,
        }));

        const doctor = doctorResult.Items?.[0];
        const tier = (doctor?.tier as DoctorTier) || DoctorTier.NEW;
        const grossEarnings = earning.payPerVisitTotal + earning.subscriptionTotal;
        const shares = calculateShares(grossEarnings, tier);

        payoutSummaries.push({
            doctorId,
            doctorName: doctor?.name || 'Unknown',
            tier,
            visitCount: earning.visitCount,
            payPerVisitEarnings: earning.payPerVisitTotal,
            subscriptionEarnings: earning.subscriptionTotal,
            grossEarnings,
            platformFee: shares.platformShare,
            netPayout: shares.doctorShare,
            doctorPercentage: shares.doctorPercentage,
            stripeConnectAccountId: doctor?.stripeConnectAccountId,
            appointments: earning.appointments,
        });
    }

    res.json({
        holdDays: PAYOUT_HOLD_DAYS,
        cutoffDate: cutoffStr,
        doctors: payoutSummaries,
        totalNetPayout: payoutSummaries.reduce((s, p) => s + p.netPayout, 0),
        totalPlatformFee: payoutSummaries.reduce((s, p) => s + p.platformFee, 0),
    });
});

// ─── EXECUTE PAYOUTS ────────────────────────────────────────────────────

/**
 * POST /admin/payouts/execute
 * Admin triggers payout after reviewing. Creates Stripe Connect transfers.
 */
export const executePayouts = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const db = getRegionalClient(region);
    const adminId = (req as any).user?.sub || (req as any).user?.id;

    if (!(req as any).user?.isAdmin) {
        return res.status(403).json({ error: 'ADMIN_REQUIRED' });
    }

    const { doctorIds } = req.body; // optional: specific doctors, or all pending
    const stripeKey = await getSSMParameter('/mediconnect/prod/stripe/secret_key', region, true);
    if (!stripeKey) throw new Error('Stripe secret not found');
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });

    const holdCutoff = new Date();
    holdCutoff.setDate(holdCutoff.getDate() - PAYOUT_HOLD_DAYS);
    const cutoffStr = holdCutoff.toISOString();
    const periodEnd = new Date().toISOString().split('T')[0];
    const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get eligible appointments
    const result = await db.send(new QueryCommand({
        TableName: TABLE_APPOINTMENTS,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#s = :completed',
        FilterExpression: 'createdAt <= :cutoff AND (attribute_not_exists(payoutProcessed) OR payoutProcessed = :false)',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
            ':completed': 'COMPLETED',
            ':cutoff': cutoffStr,
            ':false': false,
        },
    }));

    // Group by doctor
    const byDoctor: Record<string, any[]> = {};
    for (const apt of result.Items || []) {
        if (doctorIds && !doctorIds.includes(apt.doctorId)) continue;
        if (!byDoctor[apt.doctorId]) byDoctor[apt.doctorId] = [];
        byDoctor[apt.doctorId].push(apt);
    }

    const results = [];

    for (const [doctorId, appointments] of Object.entries(byDoctor)) {
        const doctorResult = await db.send(new QueryCommand({
            TableName: TABLE_DOCTORS,
            KeyConditionExpression: 'doctorId = :did',
            ExpressionAttributeValues: { ':did': doctorId },
            Limit: 1,
        }));

        const doctor = doctorResult.Items?.[0];
        const tier = (doctor?.tier as DoctorTier) || DoctorTier.NEW;
        const connectAccountId = doctor?.stripeConnectAccountId;

        const grossEarnings = appointments.reduce((s: number, a: any) => s + (a.amountPaid || 0), 0);
        const payPerVisit = appointments.filter((a: any) => !a.subscriptionId).reduce((s: number, a: any) => s + (a.amountPaid || 0), 0);
        const subscriptionVisits = grossEarnings - payPerVisit;
        const shares = calculateShares(grossEarnings, tier);
        const payoutId = randomUUID();

        let transferId = '';
        let payoutStatus: 'paid' | 'pending' | 'failed' = 'pending';

        // Transfer via Stripe Connect (if account linked)
        if (connectAccountId && shares.doctorShare > 0) {
            try {
                const transfer = await stripe.transfers.create({
                    amount: Math.round(shares.doctorShare * 100), // cents
                    currency: 'usd',
                    destination: connectAccountId,
                    metadata: {
                        doctorId,
                        payoutId,
                        periodStart,
                        periodEnd,
                        visitCount: String(appointments.length),
                    },
                });
                transferId = transfer.id;
                payoutStatus = 'paid';
            } catch (err: any) {
                safeError(`Stripe transfer failed for doctor ${doctorId}: ${err.message}`);
                payoutStatus = 'failed';
            }
        } else {
            safeLog(`Doctor ${doctorId} has no Stripe Connect account — payout held`);
        }

        // Write payout record
        await db.send(new PutCommand({
            TableName: TABLE_DOCTOR_PAYOUTS,
            Item: {
                doctorId,
                periodEndPayoutId: `${periodEnd}#${payoutId}`,
                periodStart,
                periodEnd,
                totalVisits: appointments.length,
                payPerVisitEarnings: Math.round(payPerVisit * 100) / 100,
                subscriptionEarnings: Math.round(subscriptionVisits * 100) / 100,
                grossEarnings: Math.round(grossEarnings * 100) / 100,
                platformFee: Math.round(shares.platformShare * 100) / 100,
                netPayout: Math.round(shares.doctorShare * 100) / 100,
                stripeTransferId: transferId,
                status: payoutStatus,
                paidAt: payoutStatus === 'paid' ? new Date().toISOString() : undefined,
            },
        }));

        // Mark appointments as payout-processed
        for (const apt of appointments) {
            await db.send(new UpdateCommand({
                TableName: TABLE_APPOINTMENTS,
                Key: { appointmentId: apt.appointmentId },
                UpdateExpression: 'SET payoutProcessed = :true, payoutId = :pid',
                ExpressionAttributeValues: { ':true': true, ':pid': payoutId },
            }));
        }

        results.push({
            doctorId,
            tier,
            visits: appointments.length,
            netPayout: shares.doctorShare,
            status: payoutStatus,
            transferId: transferId || null,
        });
    }

    await writeAuditLog({
        action: 'PAYOUTS_EXECUTED',
        actorId: adminId,
        resource: 'payouts/weekly',
        detail: `${results.length} doctors, total: $${results.reduce((s, r) => s + r.netPayout, 0).toFixed(2)}`,
        region,
    });

    res.json({
        message: `Payouts processed for ${results.length} doctors`,
        results,
    });
});

// ─── PAYOUT HISTORY ─────────────────────────────────────────────────────

/**
 * GET /admin/payouts/history
 * Admin views past payouts.
 */
export const getPayoutHistory = catchAsync(async (req: Request, res: Response) => {
    const region = extractRegion(req);
    const db = getRegionalClient(region);

    if (!(req as any).user?.isAdmin) {
        return res.status(403).json({ error: 'ADMIN_REQUIRED' });
    }

    const result = await db.send(new ScanCommand({
        TableName: TABLE_DOCTOR_PAYOUTS,
        Limit: 100,
    }));

    res.json({ payouts: result.Items || [] });
});
