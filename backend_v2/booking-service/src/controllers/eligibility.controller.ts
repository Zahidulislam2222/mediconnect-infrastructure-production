// ─── FEATURE #24: Insurance Eligibility Check ─────────────────────────────
// Real-time insurance eligibility verification before appointment booking.
// FHIR CoverageEligibilityRequest/Response resources.
// Checks: active coverage, co-pay amounts, deductible status, in-network,
// service-specific benefits, and coverage limits.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../shared/aws-config';
import { writeAuditLog } from '../../../shared/audit';

const TABLE_ELIGIBILITY = process.env.TABLE_ELIGIBILITY || 'mediconnect-eligibility-checks';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Built-in Insurance Plans (Demo/Sandbox) ───────────────────────────────

interface InsurancePlan {
    payerId: string;
    payerName: string;
    planType: string;
    coverageTypes: string[];
}

const INSURANCE_PLANS: InsurancePlan[] = [
    { payerId: 'BCBS-001', payerName: 'Blue Cross Blue Shield', planType: 'PPO', coverageTypes: ['medical', 'mental-health', 'preventive', 'prescription'] },
    { payerId: 'AETNA-001', payerName: 'Aetna', planType: 'HMO', coverageTypes: ['medical', 'mental-health', 'preventive'] },
    { payerId: 'UHC-001', payerName: 'UnitedHealthcare', planType: 'EPO', coverageTypes: ['medical', 'mental-health', 'preventive', 'prescription', 'vision'] },
    { payerId: 'CIGNA-001', payerName: 'Cigna', planType: 'PPO', coverageTypes: ['medical', 'mental-health', 'preventive', 'prescription'] },
    { payerId: 'HUMANA-001', payerName: 'Humana', planType: 'HMO', coverageTypes: ['medical', 'preventive'] },
    { payerId: 'KAISER-001', payerName: 'Kaiser Permanente', planType: 'HMO', coverageTypes: ['medical', 'mental-health', 'preventive', 'prescription', 'vision', 'dental'] },
    { payerId: 'MEDICARE-001', payerName: 'Medicare', planType: 'Government', coverageTypes: ['medical', 'preventive', 'prescription'] },
    { payerId: 'MEDICAID-001', payerName: 'Medicaid', planType: 'Government', coverageTypes: ['medical', 'mental-health', 'preventive', 'prescription', 'dental', 'vision'] },
];

// ─── Service Categories for Benefit Check ───────────────────────────────────

const SERVICE_CATEGORIES = [
    { code: 'medical', display: 'Medical Care' },
    { code: 'mental-health', display: 'Mental Health / Behavioral' },
    { code: 'preventive', display: 'Preventive Care' },
    { code: 'prescription', display: 'Prescription Drugs' },
    { code: 'dental', display: 'Dental Care' },
    { code: 'vision', display: 'Vision Care' },
    { code: 'emergency', display: 'Emergency Services' },
    { code: 'inpatient', display: 'Inpatient Hospital' },
    { code: 'outpatient', display: 'Outpatient Surgery' },
    { code: 'rehab', display: 'Rehabilitation Services' },
    { code: 'dme', display: 'Durable Medical Equipment' },
    { code: 'lab', display: 'Laboratory Services' },
];

// ─── Helper: Simulate eligibility response ──────────────────────────────────

function simulateEligibility(plan: InsurancePlan, serviceCategory: string, memberId: string): any {
    const isCovered = plan.coverageTypes.includes(serviceCategory);
    const isPreventive = serviceCategory === 'preventive';

    // Simulated benefit amounts based on plan type
    const benefits: any = {
        PPO: { copay: 30, coinsurance: 20, deductible: 1500, deductibleMet: 750, outOfPocketMax: 6000, outOfPocketUsed: 1200, inNetwork: true },
        HMO: { copay: 20, coinsurance: 10, deductible: 500, deductibleMet: 500, outOfPocketMax: 4000, outOfPocketUsed: 800, inNetwork: true },
        EPO: { copay: 25, coinsurance: 15, deductible: 1000, deductibleMet: 600, outOfPocketMax: 5000, outOfPocketUsed: 1000, inNetwork: true },
        Government: { copay: 0, coinsurance: 0, deductible: 0, deductibleMet: 0, outOfPocketMax: 0, outOfPocketUsed: 0, inNetwork: true },
    };

    const planBenefits = benefits[plan.planType] || benefits.PPO;

    return {
        eligible: isCovered,
        active: true,
        coverageStart: '2025-01-01',
        coverageEnd: '2025-12-31',
        planName: `${plan.payerName} ${plan.planType}`,
        memberId,
        groupNumber: `GRP-${memberId.slice(-4)}`,
        serviceCategory,
        serviceCategoryDisplay: SERVICE_CATEGORIES.find(s => s.code === serviceCategory)?.display || serviceCategory,
        benefits: isCovered ? {
            copay: isPreventive ? 0 : planBenefits.copay,
            coinsurancePercent: isPreventive ? 0 : planBenefits.coinsurance,
            deductible: { annual: planBenefits.deductible, met: planBenefits.deductibleMet, remaining: Math.max(0, planBenefits.deductible - planBenefits.deductibleMet) },
            outOfPocketMax: { annual: planBenefits.outOfPocketMax, used: planBenefits.outOfPocketUsed, remaining: Math.max(0, planBenefits.outOfPocketMax - planBenefits.outOfPocketUsed) },
            inNetwork: planBenefits.inNetwork,
            priorAuthRequired: ['inpatient', 'outpatient', 'dme', 'rehab'].includes(serviceCategory),
            referralRequired: plan.planType === 'HMO' && !isPreventive,
        } : null,
        message: isCovered
            ? (isPreventive ? 'Covered at 100% — no cost sharing for preventive services' : 'Service covered under plan')
            : `${serviceCategory} is not covered under this plan`,
    };
}

// ─── Helper: Build FHIR CoverageEligibilityResponse ─────────────────────────

function toFHIRResponse(check: any): any {
    const result = check.result;
    return {
        resourceType: 'CoverageEligibilityResponse',
        id: check.checkId,
        status: 'active',
        purpose: ['benefits'],
        patient: { reference: `Patient/${check.patientId}` },
        created: check.createdAt,
        insurer: { display: result.planName },
        outcome: result.eligible ? 'complete' : 'error',
        disposition: result.message,
        insurance: [{
            coverage: {
                display: result.planName,
                identifier: { value: result.memberId },
            },
            inforce: result.active,
            item: result.benefits ? [{
                category: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/ex-benefitcategory', code: result.serviceCategory }] },
                network: { coding: [{ code: result.benefits.inNetwork ? 'in' : 'out' }] },
                benefit: [
                    { type: { coding: [{ code: 'copay' }] }, allowedMoney: { value: result.benefits.copay, currency: 'USD' } },
                    { type: { coding: [{ code: 'coinsurance' }] }, allowedUnsignedInt: result.benefits.coinsurancePercent },
                    { type: { coding: [{ code: 'deductible' }] }, allowedMoney: { value: result.benefits.deductible.annual, currency: 'USD' }, usedMoney: { value: result.benefits.deductible.met, currency: 'USD' } },
                ],
                authorizationRequired: result.benefits.priorAuthRequired,
            }] : [],
        }],
    };
}

// ─── POST /eligibility/check — Run eligibility verification ─────────────────

export const checkEligibility = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { patientId, payerId, memberId, serviceCategory, serviceDate } = req.body;
        if (!patientId || !payerId || !memberId) {
            return res.status(400).json({ error: 'patientId, payerId, and memberId are required' });
        }

        const plan = INSURANCE_PLANS.find(p => p.payerId === payerId);
        if (!plan) {
            return res.status(400).json({
                error: `Unknown payer. Valid payerIds: ${INSURANCE_PLANS.map(p => p.payerId).join(', ')}`,
                availablePayers: INSURANCE_PLANS.map(p => ({ payerId: p.payerId, name: p.payerName })),
            });
        }

        const category = serviceCategory || 'medical';
        const result = simulateEligibility(plan, category, memberId);

        const checkId = uuidv4();
        const now = new Date().toISOString();

        const check = {
            checkId,
            patientId,
            performedBy: user.id,
            payerId,
            memberId,
            serviceCategory: category,
            serviceDate: serviceDate || now.split('T')[0],
            result,
            createdAt: now,
        };

        await db.send(new PutCommand({ TableName: TABLE_ELIGIBILITY, Item: check }));

        await writeAuditLog(user.id, patientId, 'ELIGIBILITY_CHECKED', `Eligibility check: ${plan.payerName} — ${result.eligible ? 'eligible' : 'not covered'}`, { region, checkId, payerId });

        res.json(toFHIRResponse(check));

    } catch (error: any) {
        res.status(500).json({ error: 'Eligibility check failed', details: error.message });
    }
};

// ─── GET /eligibility/:patientId — Get patient's eligibility history ────────

export const getEligibilityHistory = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new QueryCommand({
            TableName: TABLE_ELIGIBILITY,
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        const checks = (Items || [])
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((c: any) => toFHIRResponse(c));

        res.json({ resourceType: 'Bundle', type: 'searchset', total: checks.length, entry: checks });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get eligibility history', details: error.message });
    }
};

// ─── GET /eligibility/payers — List available insurance payers ──────────────

export const getAvailablePayers = async (_req: Request, res: Response) => {
    res.json({
        payers: INSURANCE_PLANS.map(p => ({
            payerId: p.payerId,
            name: p.payerName,
            planType: p.planType,
            coverageTypes: p.coverageTypes,
        })),
        serviceCategories: SERVICE_CATEGORIES,
    });
};

// ─── POST /eligibility/batch — Batch eligibility check (multiple services) ──

export const batchEligibilityCheck = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { patientId, payerId, memberId, serviceCategories } = req.body;
        if (!patientId || !payerId || !memberId || !serviceCategories || !Array.isArray(serviceCategories)) {
            return res.status(400).json({ error: 'patientId, payerId, memberId, and serviceCategories[] required' });
        }

        const plan = INSURANCE_PLANS.find(p => p.payerId === payerId);
        if (!plan) {
            return res.status(400).json({ error: 'Unknown payer' });
        }

        const results = serviceCategories.map((cat: string) => {
            const result = simulateEligibility(plan, cat, memberId);
            return { serviceCategory: cat, ...result };
        });

        const checkId = uuidv4();
        const now = new Date().toISOString();

        await db.send(new PutCommand({
            TableName: TABLE_ELIGIBILITY,
            Item: {
                checkId,
                patientId,
                performedBy: user.id,
                payerId,
                memberId,
                serviceCategory: 'batch',
                result: { batchResults: results },
                createdAt: now,
            },
        }));

        await writeAuditLog(user.id, patientId, 'ELIGIBILITY_BATCH_CHECK', `Batch eligibility: ${serviceCategories.length} services checked`, { region, checkId });

        res.json({
            checkId,
            patientId,
            payer: { payerId: plan.payerId, name: plan.payerName, planType: plan.planType },
            memberId,
            results,
            checkedAt: now,
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Batch eligibility check failed', details: error.message });
    }
};
