// ─── FEATURE #21: SDOH (Social Determinants of Health) ─────────────────────
// Z-codes (ICD-10-CM) for social risk factors: housing, food, transportation,
// education, employment, social isolation, violence, financial strain.
// FHIR Observation resources with SDOH categories.
// Screening questionnaires (AHC-HRSN, PRAPARE) with scoring.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getRegionalClient } from '../../../../shared/aws-config';
import { writeAuditLog } from '../../../../shared/audit';

const TABLE_SDOH = process.env.TABLE_SDOH || 'mediconnect-sdoh-assessments';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// ─── Z-Codes (ICD-10-CM Social Determinant Codes) ──────────────────────────

interface SDOHCode {
    code: string;
    display: string;
    category: string;
    loinc: string;
    severity: 'low' | 'moderate' | 'high';
}

const SDOH_ZCODES: SDOHCode[] = [
    // Housing instability
    { code: 'Z59.0', display: 'Homelessness', category: 'Housing Instability', loinc: '71802-3', severity: 'high' },
    { code: 'Z59.1', display: 'Inadequate housing', category: 'Housing Instability', loinc: '71802-3', severity: 'moderate' },
    { code: 'Z59.8', display: 'Other problems related to housing', category: 'Housing Instability', loinc: '71802-3', severity: 'low' },

    // Food insecurity
    { code: 'Z59.4', display: 'Lack of adequate food', category: 'Food Insecurity', loinc: '88122-7', severity: 'high' },
    { code: 'Z59.48', display: 'Other specified lack of adequate food', category: 'Food Insecurity', loinc: '88122-7', severity: 'moderate' },

    // Transportation
    { code: 'Z59.82', display: 'Transportation insecurity', category: 'Transportation Access', loinc: '93030-5', severity: 'moderate' },

    // Financial strain
    { code: 'Z59.6', display: 'Low income', category: 'Financial Strain', loinc: '76513-1', severity: 'moderate' },
    { code: 'Z59.7', display: 'Insufficient social insurance and welfare support', category: 'Financial Strain', loinc: '76513-1', severity: 'moderate' },

    // Education & literacy
    { code: 'Z55.0', display: 'Illiteracy and low-level literacy', category: 'Education Access', loinc: '82589-3', severity: 'moderate' },
    { code: 'Z55.9', display: 'Problems related to education unspecified', category: 'Education Access', loinc: '82589-3', severity: 'low' },

    // Employment
    { code: 'Z56.0', display: 'Unemployment, unspecified', category: 'Employment Status', loinc: '67875-5', severity: 'moderate' },
    { code: 'Z56.9', display: 'Unspecified problems related to employment', category: 'Employment Status', loinc: '67875-5', severity: 'low' },

    // Social isolation
    { code: 'Z60.2', display: 'Problems related to living alone', category: 'Social Isolation', loinc: '93159-2', severity: 'moderate' },
    { code: 'Z60.4', display: 'Social exclusion and rejection', category: 'Social Isolation', loinc: '93159-2', severity: 'moderate' },

    // Interpersonal violence
    { code: 'Z63.0', display: 'Problems in relationship with spouse or partner', category: 'Interpersonal Violence', loinc: '95618-5', severity: 'high' },
    { code: 'Z65.4', display: 'Victim of crime and terrorism', category: 'Interpersonal Violence', loinc: '95618-5', severity: 'high' },

    // Stress
    { code: 'Z73.3', display: 'Stress, not elsewhere classified', category: 'Stress', loinc: '93038-8', severity: 'moderate' },

    // Veteran status
    { code: 'Z91.82', display: 'Personal history of military service', category: 'Veteran Status', loinc: '93035-4', severity: 'low' },
];

// ─── Screening Questionnaires (AHC-HRSN inspired) ──────────────────────────

interface ScreeningQuestion {
    id: string;
    text: string;
    category: string;
    loinc: string;
    options: { code: string; display: string; score: number }[];
}

const SCREENING_QUESTIONS: ScreeningQuestion[] = [
    {
        id: 'housing-1',
        text: 'What is your living situation today?',
        category: 'Housing Instability',
        loinc: '71802-3',
        options: [
            { code: 'LA31993-1', display: 'I have a steady place to live', score: 0 },
            { code: 'LA31994-9', display: 'I have a place to live today, but I am worried about losing it in the future', score: 1 },
            { code: 'LA31995-6', display: 'I do not have a steady place to live', score: 2 },
        ]
    },
    {
        id: 'food-1',
        text: 'Within the past 12 months, you worried that your food would run out before you got money to buy more.',
        category: 'Food Insecurity',
        loinc: '88122-7',
        options: [
            { code: 'LA28397-0', display: 'Often true', score: 2 },
            { code: 'LA6729-3', display: 'Sometimes true', score: 1 },
            { code: 'LA28398-8', display: 'Never true', score: 0 },
        ]
    },
    {
        id: 'transport-1',
        text: 'In the past 12 months, has lack of reliable transportation kept you from medical appointments or getting medications?',
        category: 'Transportation Access',
        loinc: '93030-5',
        options: [
            { code: 'LA33-6', display: 'Yes', score: 1 },
            { code: 'LA32-8', display: 'No', score: 0 },
        ]
    },
    {
        id: 'financial-1',
        text: 'How hard is it for you to pay for the very basics like food, housing, medical care, and heating?',
        category: 'Financial Strain',
        loinc: '76513-1',
        options: [
            { code: 'LA31980-8', display: 'Very hard', score: 3 },
            { code: 'LA31981-6', display: 'Somewhat hard', score: 2 },
            { code: 'LA31982-4', display: 'Not hard at all', score: 0 },
        ]
    },
    {
        id: 'safety-1',
        text: 'Do you feel physically and emotionally safe where you currently live?',
        category: 'Interpersonal Violence',
        loinc: '95618-5',
        options: [
            { code: 'LA33-6', display: 'Yes', score: 0 },
            { code: 'LA32-8', display: 'No', score: 2 },
            { code: 'LA14072-5', display: 'Unsure', score: 1 },
        ]
    },
    {
        id: 'social-1',
        text: 'How often do you feel lonely or isolated from those around you?',
        category: 'Social Isolation',
        loinc: '93159-2',
        options: [
            { code: 'LA6270-8', display: 'Never', score: 0 },
            { code: 'LA10066-1', display: 'Rarely', score: 0 },
            { code: 'LA10082-8', display: 'Sometimes', score: 1 },
            { code: 'LA10044-8', display: 'Often', score: 2 },
            { code: 'LA9933-8', display: 'Always', score: 3 },
        ]
    },
];

// ─── GET /sdoh/z-codes — List all SDOH Z-codes ─────────────────────────────

export const getSDOHCodes = async (_req: Request, res: Response) => {
    const categories = [...new Set(SDOH_ZCODES.map(z => z.category))];
    const grouped = categories.map(cat => ({
        category: cat,
        codes: SDOH_ZCODES.filter(z => z.category === cat),
    }));

    res.json({
        resourceType: 'CodeSystem',
        id: 'sdoh-z-codes',
        url: 'http://hl7.org/fhir/sid/icd-10-cm',
        name: 'SDOH_ZCodes',
        title: 'Social Determinants of Health Z-Codes (ICD-10-CM)',
        status: 'active',
        count: SDOH_ZCODES.length,
        categories: grouped,
    });
};

// ─── GET /sdoh/screening — Get screening questionnaire ──────────────────────

export const getScreeningQuestionnaire = async (_req: Request, res: Response) => {
    res.json({
        resourceType: 'Questionnaire',
        id: 'ahc-hrsn-screening',
        url: 'http://hl7.org/fhir/us/sdoh-clinicalcare/Questionnaire/SDOHCC-QuestionnaireHungerVitalSign',
        name: 'AHC_HRSN_Screening',
        title: 'Accountable Health Communities Health-Related Social Needs Screening',
        status: 'active',
        description: 'Screening tool for social determinants of health based on the AHC-HRSN model',
        item: SCREENING_QUESTIONS.map(q => ({
            linkId: q.id,
            text: q.text,
            type: 'choice',
            code: [{ system: 'http://loinc.org', code: q.loinc }],
            answerOption: q.options.map(o => ({
                valueCoding: { system: 'http://loinc.org', code: o.code, display: o.display },
            })),
        })),
    });
};

// ─── POST /sdoh/assessments — Submit screening assessment ───────────────────

export const submitSDOHAssessment = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { patientId, responses } = req.body;
        if (!patientId || !responses || !Array.isArray(responses)) {
            return res.status(400).json({ error: 'patientId and responses[] required' });
        }

        // Score each response
        let totalScore = 0;
        const scoredResponses: any[] = [];
        const identifiedRisks: any[] = [];

        for (const resp of responses) {
            const question = SCREENING_QUESTIONS.find(q => q.id === resp.questionId);
            if (!question) continue;

            const selectedOption = question.options.find(o => o.code === resp.answerCode);
            const score = selectedOption?.score || 0;
            totalScore += score;

            scoredResponses.push({
                questionId: resp.questionId,
                category: question.category,
                loinc: question.loinc,
                answerCode: resp.answerCode,
                answerDisplay: selectedOption?.display || 'Unknown',
                score,
            });

            // Identify risks (score > 0)
            if (score > 0) {
                const relatedCodes = SDOH_ZCODES.filter(z => z.category === question.category);
                identifiedRisks.push({
                    category: question.category,
                    severity: score >= 2 ? 'high' : 'moderate',
                    relatedZCodes: relatedCodes.map(z => ({ code: z.code, display: z.display })),
                    question: question.text,
                    answer: selectedOption?.display,
                });
            }
        }

        // Risk level based on total score
        const riskLevel = totalScore >= 8 ? 'high' : totalScore >= 4 ? 'moderate' : totalScore > 0 ? 'low' : 'none';

        const assessmentId = uuidv4();
        const now = new Date().toISOString();

        const assessment = {
            assessmentId,
            patientId,
            performedBy: user.id,
            status: 'final',
            responses: scoredResponses,
            totalScore,
            riskLevel,
            identifiedRisks,
            createdAt: now,
        };

        await db.send(new PutCommand({
            TableName: TABLE_SDOH,
            Item: assessment,
        }));

        await writeAuditLog(user.id, patientId, 'SDOH_ASSESSMENT_SUBMITTED', `SDOH screening: score=${totalScore}, risk=${riskLevel}`, { region, assessmentId });

        // ─── Gap #7 FIX: Generate FHIR Goal resources from identified risks ──
        const goals = identifiedRisks.map((risk: any, idx: number) => ({
            resourceType: 'Goal',
            id: `${assessmentId}-goal-${idx}`,
            lifecycleStatus: 'active',
            achievementStatus: {
                coding: [{ system: 'http://terminology.hl7.org/CodeSystem/goal-achievement', code: 'in-progress', display: 'In Progress' }],
            },
            category: [{
                coding: [{ system: 'http://hl7.org/fhir/us/sdoh-clinicalcare/CodeSystem/SDOHCC-CodeSystemTemporaryCodes', code: 'sdoh-category-unspecified', display: risk.category }],
            }],
            priority: {
                coding: [{ system: 'http://terminology.hl7.org/CodeSystem/goal-priority', code: risk.severity === 'high' ? 'high-priority' : 'medium-priority', display: risk.severity === 'high' ? 'High Priority' : 'Medium Priority' }],
            },
            description: {
                text: `Address ${risk.category} risk identified in SDOH screening`,
            },
            subject: { reference: `Patient/${patientId}` },
            startDate: now.split('T')[0],
            target: [{
                measure: { coding: [{ system: 'http://loinc.org', code: '88124-3', display: 'Food insecurity risk' }] },
                detailString: `Reduce ${risk.category} risk from ${risk.severity} to low/none`,
                dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            }],
            addresses: risk.relatedZCodes.map((z: any) => ({
                coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: z.code, display: z.display }],
            })),
        }));

        // Return as FHIR QuestionnaireResponse with embedded Goals
        res.status(201).json({
            resourceType: 'QuestionnaireResponse',
            id: assessmentId,
            questionnaire: 'Questionnaire/ahc-hrsn-screening',
            status: 'completed',
            subject: { reference: `Patient/${patientId}` },
            authored: now,
            item: scoredResponses.map(r => ({
                linkId: r.questionId,
                answer: [{ valueCoding: { code: r.answerCode, display: r.answerDisplay } }],
            })),
            extension: [
                { url: 'http://mediconnect.health/fhir/sdoh-total-score', valueInteger: totalScore },
                { url: 'http://mediconnect.health/fhir/sdoh-risk-level', valueString: riskLevel },
            ],
            identifiedRisks,
            goals,
        });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to submit SDOH assessment', details: error.message });
    }
};

// ─── GET /sdoh/assessments/:patientId — Get patient's SDOH history ──────────

export const getPatientSDOHAssessments = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new QueryCommand({
            TableName: TABLE_SDOH,
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        const assessments = (Items || [])
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((a: any) => ({
                id: a.assessmentId,
                resourceType: 'QuestionnaireResponse',
                status: a.status,
                subject: { reference: `Patient/${patientId}` },
                authored: a.createdAt,
                totalScore: a.totalScore,
                riskLevel: a.riskLevel,
                identifiedRisks: a.identifiedRisks,
            }));

        res.json({ resourceType: 'Bundle', type: 'searchset', total: assessments.length, entry: assessments });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get SDOH assessments', details: error.message });
    }
};

// ─── GET /sdoh/observations/:patientId — FHIR Observations for SDOH ────────

export const getSDOHObservations = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const region = extractRegion(req);
        const db = getRegionalClient(region);

        const { Items } = await db.send(new QueryCommand({
            TableName: TABLE_SDOH,
            IndexName: 'patientId-index',
            KeyConditionExpression: 'patientId = :pid',
            ExpressionAttributeValues: { ':pid': patientId },
        }));

        // Convert identified risks to FHIR Observations
        const observations: any[] = [];
        for (const assessment of (Items || [])) {
            for (const risk of (assessment.identifiedRisks || [])) {
                for (const zCode of (risk.relatedZCodes || [])) {
                    observations.push({
                        resourceType: 'Observation',
                        id: `${assessment.assessmentId}-${zCode.code}`,
                        meta: { profile: ['http://hl7.org/fhir/us/sdoh-clinicalcare/StructureDefinition/SDOHCC-ObservationScreeningResponse'] },
                        status: 'final',
                        category: [
                            { coding: [{ system: 'http://hl7.org/fhir/us/sdoh-clinicalcare/CodeSystem/SDOHCC-CodeSystemTemporaryCodes', code: 'sdoh-category-unspecified', display: risk.category }] },
                            { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'social-history' }] },
                        ],
                        code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: zCode.code, display: zCode.display }] },
                        subject: { reference: `Patient/${patientId}` },
                        effectiveDateTime: assessment.createdAt,
                        valueCodeableConcept: {
                            coding: [{ system: 'http://snomed.info/sct', code: '373066001', display: risk.severity === 'high' ? 'Yes (at risk)' : 'Possible risk' }],
                        },
                    });
                }
            }
        }

        res.json({ resourceType: 'Bundle', type: 'searchset', total: observations.length, entry: observations });

    } catch (error: any) {
        res.status(500).json({ error: 'Failed to get SDOH observations', details: error.message });
    }
};
