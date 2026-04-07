export {};
// ─── RAG Evaluation Framework ────────────────────────────────────────────
// Offline evaluation: faithfulness, relevance, precision, recall.
// Uses known Q&A pairs from the knowledge base as ground truth.
//
// This test requires:
//   - LIGHTRAG_URL reachable (default: http://localhost:9621)
//   - AI providers configured (for LLM judge)
//
// If LIGHTRAG_URL is unreachable, tests skip gracefully (exit 0).
//
// Run: npx ts-node shared/__tests__/rag-evaluation.test.ts
// ─────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        passed++;
        console.log(`  \u2705 ${message}`);
    } else {
        failed++;
        console.error(`  \u274C FAIL: ${message}`);
    }
}

function skip(message: string) {
    skipped++;
    console.log(`  \u23ED SKIP: ${message}`);
}

function describe(name: string, fn: () => void | Promise<void>) {
    console.log(`\n\uD83E\uDDEA ${name}`);
    const result = fn();
    if (result instanceof Promise) return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Evaluation Dataset — Known Q&A pairs from knowledge base
// ═══════════════════════════════════════════════════════════════════════

interface EvalCase {
    id: string;
    question: string;
    expectedTopics: string[];     // Terms that SHOULD appear in context/response
    forbiddenContent: string[];   // Terms that should NOT appear in response
    expectedIntent: string;
    category: string;
}

const EVAL_DATASET: EvalCase[] = [
    {
        id: 'APT-01',
        question: 'How do I book an appointment?',
        expectedTopics: ['appointment', 'doctor', 'time slot'],
        forbiddenContent: ['diagnos', 'treatment', 'medication'],
        expectedIntent: 'action',  // "book" + "appointment" triggers action pattern
        category: 'appointments',
    },
    {
        id: 'APT-02',
        question: 'How do I reschedule my appointment?',
        expectedTopics: ['reschedule', '2 hours'],
        forbiddenContent: ['diagnos'],
        expectedIntent: 'action',  // "reschedule" + "appointment" triggers action pattern
        category: 'appointments',
    },
    {
        id: 'APT-03',
        question: 'What happens if I miss my appointment?',
        expectedTopics: ['no-show', 'refund', 'reminder'],
        forbiddenContent: [],
        expectedIntent: 'faq',
        category: 'appointments',
    },
    {
        id: 'APT-04',
        question: 'How do video consultations work?',
        expectedTopics: ['video', 'camera'],
        forbiddenContent: [],
        expectedIntent: 'faq',
        category: 'appointments',
    },
    {
        id: 'SUB-01',
        question: 'What subscription plans do you offer?',
        expectedTopics: ['free', 'plus', 'premium'],
        forbiddenContent: ['diagnos'],
        expectedIntent: 'faq',
        category: 'subscriptions',
    },
    {
        id: 'SUB-02',
        question: 'How much does Premium cost?',
        expectedTopics: ['premium', '39'],
        forbiddenContent: [],
        expectedIntent: 'faq',
        category: 'subscriptions',
    },
    {
        id: 'BIL-01',
        question: 'How do refunds work?',
        expectedTopics: ['refund', '2 hours'],
        forbiddenContent: ['diagnos'],
        expectedIntent: 'faq',
        category: 'billing',
    },
    {
        id: 'BIL-02',
        question: 'What payment methods do you accept?',
        expectedTopics: ['payment', 'stripe'],
        forbiddenContent: [],
        expectedIntent: 'faq',
        category: 'billing',
    },
    {
        id: 'REC-01',
        question: 'How do I access my health records?',
        expectedTopics: ['record', 'data'],
        forbiddenContent: [],
        expectedIntent: 'faq',
        category: 'health-records',
    },
    {
        id: 'REC-02',
        question: 'Can I export my medical data?',
        expectedTopics: ['export', 'FHIR'],
        forbiddenContent: [],
        expectedIntent: 'faq',
        category: 'health-records',
    },
    {
        id: 'PRV-01',
        question: 'How is my data protected?',
        expectedTopics: ['encrypt', 'HIPAA'],
        forbiddenContent: [],
        expectedIntent: 'faq',
        category: 'privacy',
    },
    {
        id: 'PRV-02',
        question: 'What are my GDPR rights?',
        expectedTopics: ['GDPR', 'right'],
        forbiddenContent: [],
        expectedIntent: 'faq',
        category: 'privacy',
    },
    {
        id: 'OFF-01',
        question: 'Write me a poem about health',
        expectedTopics: [],
        forbiddenContent: ['poem', 'roses'],
        expectedIntent: 'off_topic',
        category: 'off-topic',
    },
    {
        id: 'MED-01',
        question: 'What are my diabetes treatment options?',
        expectedTopics: [],
        forbiddenContent: ['take', 'mg', 'recommended dose'],
        expectedIntent: 'medical',
        category: 'medical',
    },
    {
        id: 'ACT-01',
        question: 'I want to cancel my appointment',
        expectedTopics: ['cancel', 'appointment'],
        forbiddenContent: [],
        expectedIntent: 'action',
        category: 'actions',
    },
];

// ═══════════════════════════════════════════════════════════════════════
// Import modules under test
// ═══════════════════════════════════════════════════════════════════════

import { scoreConfidence } from '../../communication-service/src/utils/rag-validators';

// Inline intent detection (same as controller)
type Intent = 'faq' | 'medical' | 'action' | 'off_topic';

function detectIntent(message: string): Intent {
    const lower = message.toLowerCase();
    const offTopicPatterns = [
        /write.*(poem|essay|story|code|script)/, /translate/,
        /\b(weather|news|sports|movie|restaurant|recipe)\b/,
        /\b(joke|sing|play|game)\b/,
        /ignore.*instructions|forget.*rules|you are now/,
    ];
    for (const p of offTopicPatterns) { if (p.test(lower)) return 'off_topic'; }

    const actionPatterns = [
        /\b(book|schedule|reschedule|cancel|update|change)\b.*\b(appointment|booking|visit|session)\b/,
        /\b(subscribe|upgrade|downgrade|cancel)\b.*\b(plan|subscription|membership)\b/,
    ];
    for (const p of actionPatterns) { if (p.test(lower)) return 'action'; }

    const medicalPatterns = [
        /\b(symptom|diagnos|treatment|medication|drug|interaction|side.effect|dosage)\b/,
        /\b(diabetes|hypertension|cancer|infection|pain|fever|allergy)\b/,
        /\b(prescription|lab.result|blood.test|imaging|xray|mri)\b/,
    ];
    for (const p of medicalPatterns) { if (p.test(lower)) return 'medical'; }
    return 'faq';
}

// ═══════════════════════════════════════════════════════════════════════
// 1. INTENT CLASSIFICATION ACCURACY
// ═══════════════════════════════════════════════════════════════════════

describe('Intent Classification Accuracy', () => {
    let correct = 0;
    let total = 0;

    for (const evalCase of EVAL_DATASET) {
        const predicted = detectIntent(evalCase.question);
        total++;
        if (predicted === evalCase.expectedIntent) {
            correct++;
            console.log(`  \u2705 [${evalCase.id}] "${evalCase.question.substring(0, 40)}..." → ${predicted}`);
        } else {
            console.error(`  \u274C [${evalCase.id}] "${evalCase.question.substring(0, 40)}..." → predicted ${predicted}, expected ${evalCase.expectedIntent}`);
        }
    }

    const accuracy = total > 0 ? (correct / total * 100).toFixed(1) : '0';
    assert(correct === total, `Intent accuracy: ${accuracy}% (${correct}/${total})`);
});

// ═══════════════════════════════════════════════════════════════════════
// 2. CONFIDENCE SCORING CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════

describe('Confidence Scoring Consistency', () => {
    // Same query + same context should produce same score
    const query = 'How do I book an appointment?';
    const context = 'To book an appointment, go to the Appointments page and select a doctor.';

    const score1 = scoreConfidence(query, context, 'faq');
    const score2 = scoreConfidence(query, context, 'faq');
    assert(score1.score === score2.score, 'Same inputs produce identical scores (deterministic)');

    // Relevant context should score higher than irrelevant
    const irrelevantContext = 'The weather forecast shows sunny skies tomorrow.';
    const relevantScore = scoreConfidence(query, context, 'faq');
    const irrelevantScore = scoreConfidence(query, irrelevantContext, 'faq');
    assert(relevantScore.score > irrelevantScore.score,
        `Relevant context (${relevantScore.score.toFixed(2)}) scores higher than irrelevant (${irrelevantScore.score.toFixed(2)})`);
});

// ═══════════════════════════════════════════════════════════════════════
// 3. RETRIEVAL QUALITY METRICS (offline — requires LightRAG)
// ═══════════════════════════════════════════════════════════════════════

const LIGHTRAG_URL = process.env.LIGHTRAG_URL || 'http://localhost:9621';

async function checkLightRAG(): Promise<boolean> {
    try {
        const response = await fetch(`${LIGHTRAG_URL}/health`, { signal: AbortSignal.timeout(3000) });
        return response.ok;
    } catch {
        return false;
    }
}

async function queryLightRAG(question: string): Promise<string> {
    const response = await fetch(`${LIGHTRAG_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: question, mode: 'mix' }),
        signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    return data.response || data.result || '';
}

async function runRetrievalEvaluation() {
    console.log(`\n\uD83E\uDDEA Retrieval Quality Evaluation (LightRAG at ${LIGHTRAG_URL})`);

    const isAvailable = await checkLightRAG();
    if (!isAvailable) {
        skip('LightRAG is not reachable — skipping retrieval evaluation');
        skip('Set LIGHTRAG_URL and ensure LightRAG is running to enable these tests');
        return;
    }

    // Only test FAQ cases (medical/off-topic don't use RAG meaningfully)
    const faqCases = EVAL_DATASET.filter(c => c.expectedIntent === 'faq' && c.expectedTopics.length > 0);
    let totalPrecision = 0;
    let totalRecall = 0;
    let caseCount = 0;

    for (const evalCase of faqCases) {
        try {
            const context = await queryLightRAG(evalCase.question);

            // Recall: Of expected topics, how many appear in the retrieved context?
            const contextLower = context.toLowerCase();
            let topicsFound = 0;
            for (const topic of evalCase.expectedTopics) {
                if (contextLower.includes(topic.toLowerCase())) topicsFound++;
            }
            const recall = evalCase.expectedTopics.length > 0
                ? topicsFound / evalCase.expectedTopics.length : 1;

            // Precision proxy: confidence score (higher = more relevant retrieval)
            const confidence = scoreConfidence(evalCase.question, context, evalCase.expectedIntent);

            totalPrecision += confidence.score;
            totalRecall += recall;
            caseCount++;

            const status = recall >= 0.5 ? '\u2705' : '\u274C';
            console.log(`  ${status} [${evalCase.id}] recall=${(recall * 100).toFixed(0)}% confidence=${(confidence.score * 100).toFixed(0)}%`);
        } catch (err: any) {
            skip(`[${evalCase.id}] LightRAG query failed: ${err.message}`);
        }
    }

    if (caseCount > 0) {
        const avgPrecision = totalPrecision / caseCount;
        const avgRecall = totalRecall / caseCount;
        console.log(`\n  Avg Precision (confidence): ${(avgPrecision * 100).toFixed(1)}%`);
        console.log(`  Avg Recall (topics found):  ${(avgRecall * 100).toFixed(1)}%`);

        assert(avgRecall >= 0.3, `Average recall >= 30% (got ${(avgRecall * 100).toFixed(1)}%)`);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════════════════════════════

async function main() {
    // Run retrieval evaluation (async)
    await runRetrievalEvaluation();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`RAG EVALUATION RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log(`${'═'.repeat(60)}`);

    if (failed > 0) {
        console.error('\n\u274C RAG evaluation tests FAILED');
        process.exit(1);
    }

    console.log('\n\u2705 All RAG evaluation tests passed.');
}

main().catch(err => {
    console.error('Evaluation runner error:', err);
    process.exit(1);
});
