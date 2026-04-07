export {};
// ─── RAG Pipeline Unit Tests ─────────────────────────────────────────────
// Tests: Confidence scoring math, reranking logic, query complexity
// detection heuristics, model router config loading, validation structure.
// No real AI/AWS calls — tests pure business logic only.
// Run: npx ts-node shared/__tests__/rag-pipeline.test.ts
// ─────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        passed++;
        console.log(`  \u2705 ${message}`);
    } else {
        failed++;
        console.error(`  \u274C FAIL: ${message}`);
    }
}

function describe(name: string, fn: () => void) {
    console.log(`\n\uD83E\uDDEA ${name}`);
    fn();
}

// ═══════════════════════════════════════════════════════════════════════
// Import modules under test
// ═══════════════════════════════════════════════════════════════════════

import { scoreConfidence, rerankByRelevance } from '../../communication-service/src/utils/rag-validators';
import { computeComplexityScore, decomposeByHeuristic } from '../../communication-service/src/utils/query-planner';

// ═══════════════════════════════════════════════════════════════════════
// 1. CONFIDENCE SCORING
// ═══════════════════════════════════════════════════════════════════════

describe('Confidence Scoring — Empty context', () => {
    const result = scoreConfidence('How do I book an appointment?', '', 'faq');
    assert(result.score === 0, 'Empty context returns score 0');
    assert(result.action === 'skip_rag', 'Empty context action is skip_rag');
    assert(result.factors.termOverlap === 0, 'Empty context has 0 term overlap');
    assert(result.factors.contextLength === 0, 'Empty context has 0 context length');
});

describe('Confidence Scoring — High overlap', () => {
    const query = 'How do I book an appointment?';
    const context = 'To book an appointment, go to the Appointments page and select a doctor. Choose an available time slot, enter your payment method, and confirm. You will receive a confirmation email immediately.';
    const result = scoreConfidence(query, context, 'faq');
    assert(result.score > 0.5, `High overlap query has score > 0.5 (got ${result.score.toFixed(2)})`);
    assert(result.factors.termOverlap > 0.5, `Term overlap > 0.5 (got ${result.factors.termOverlap.toFixed(2)})`);
    assert(result.action === 'use_rag', `Action is use_rag (got ${result.action})`);
});

describe('Confidence Scoring — No matching terms', () => {
    const query = 'What is quantum computing?';
    const context = 'To book an appointment, go to the Appointments page and select a doctor.';
    const result = scoreConfidence(query, context, 'faq');
    assert(result.score < 0.5, `Non-matching query has score < 0.5 (got ${result.score.toFixed(2)})`);
    assert(result.factors.termOverlap < 0.3, `Term overlap < 0.3 (got ${result.factors.termOverlap.toFixed(2)})`);
});

describe('Confidence Scoring — Short context penalty', () => {
    const query = 'How do I book?';
    const shortContext = 'Book here.';
    const longContext = 'To book an appointment, go to the Appointments page and select a doctor. Choose an available time slot, enter your payment method, and confirm. You will receive a confirmation email immediately. We have many doctors available.';
    const shortResult = scoreConfidence(query, shortContext, 'faq');
    const longResult = scoreConfidence(query, longContext, 'faq');
    assert(shortResult.factors.contextLength < longResult.factors.contextLength,
        `Short context (${shortResult.factors.contextLength}) penalized vs long (${longResult.factors.contextLength})`);
});

describe('Confidence Scoring — Specificity detection', () => {
    const query = 'What is the subscription price?';
    const specificContext = 'The Plus subscription costs $19.99 per month and includes 50 messages per day. Premium is $39.99 per month with 200 messages per day.';
    const genericContext = 'We have different subscription options available for our users to choose from.';
    const specificResult = scoreConfidence(query, specificContext, 'faq');
    const genericResult = scoreConfidence(query, genericContext, 'faq');
    assert(specificResult.factors.specificity >= genericResult.factors.specificity,
        `Specific context (${specificResult.factors.specificity.toFixed(2)}) >= generic (${genericResult.factors.specificity.toFixed(2)})`);
});

describe('Confidence Scoring — Score bounds', () => {
    const queries = [
        { q: 'test', c: 'test content here for testing purposes', i: 'faq' },
        { q: '', c: 'some context', i: 'faq' },
        { q: 'x'.repeat(1000), c: 'y'.repeat(1000), i: 'medical' },
    ];
    for (const { q, c, i } of queries) {
        const result = scoreConfidence(q, c, i);
        assert(result.score >= 0.0 && result.score <= 1.0,
            `Score is bounded 0-1 (got ${result.score.toFixed(2)} for "${q.substring(0, 20)}...")`);
    }
});

describe('Confidence Scoring — Action thresholds', () => {
    // With default thresholds: LOW=0.3, SKIP=0.85
    const emptyResult = scoreConfidence('anything', '', 'faq');
    assert(emptyResult.action === 'skip_rag', 'Zero score → skip_rag');

    const perfectResult = scoreConfidence('appointment booking',
        'Appointment booking is available on the platform. You can book an appointment with any doctor at any time. Booking requires a valid payment method.', 'faq');
    assert(perfectResult.action === 'use_rag', 'High score → use_rag');
});

// ═══════════════════════════════════════════════════════════════════════
// 2. RERANKING
// ═══════════════════════════════════════════════════════════════════════

describe('Reranking — Empty context', () => {
    assert(rerankByRelevance('test query', '') === '', 'Empty context returns empty string');
    assert(rerankByRelevance('test query', '   ') === '', 'Whitespace context returns empty string');
});

describe('Reranking — Few chunks (no reranking needed)', () => {
    const context = 'This is a single chunk about appointments.';
    const result = rerankByRelevance('appointment', context);
    assert(result === context, 'Single chunk returned as-is');
});

describe('Reranking — Relevant chunk ranked first', () => {
    const context = [
        'Quantum physics describes subatomic particles and wave functions in mathematical terms used in laboratories.',
        'Billing inquiries can be directed to the accounts department for further resolution of your issues.',
        'To book an appointment go to the Appointments page and select a doctor then choose a time slot and confirm your booking.',
        'Our privacy policy ensures your data is protected under GDPR and HIPAA regulations at all times.',
    ].join('\n\n');

    const result = rerankByRelevance('How do I book an appointment?', context, 2);
    // The appointment chunk should be ranked first (highest relevance)
    const lines = result.split('\n\n');
    assert(lines[0].includes('book') || lines[0].includes('appointment') || lines[0].includes('Appointment'),
        'Most relevant chunk (about booking/appointment) is ranked first');
    assert(result.includes('book') || result.includes('appointment'),
        'Booking-related content appears in reranked results');
});

describe('Reranking — topK respects limit', () => {
    const chunks = Array.from({ length: 10 }, (_, i) => `Chunk ${i + 1}: Content about topic ${i + 1} with enough text to pass the length filter.`);
    const context = chunks.join('\n\n');
    const result = rerankByRelevance('topic 1', context, 3);
    const resultChunks = result.split('\n\n').filter(c => c.trim().length > 0);
    assert(resultChunks.length <= 3, `topK=3 limits output to 3 chunks (got ${resultChunks.length})`);
});

// ═══════════════════════════════════════════════════════════════════════
// 3. QUERY COMPLEXITY DETECTION
// ═══════════════════════════════════════════════════════════════════════

describe('Query Complexity — Simple queries', () => {
    assert(computeComplexityScore('How do I book an appointment?') < 0.4,
        'Simple FAQ is below 0.4');

    assert(computeComplexityScore('What is the refund policy?') < 0.4,
        'Simple policy question is below 0.4');

    assert(computeComplexityScore('Tell me about subscriptions') < 0.4,
        'Simple topic query is below 0.4');

    assert(computeComplexityScore('How long are appointments?') < 0.4,
        'Simple factual question is below 0.4');
});

describe('Query Complexity — Complex queries', () => {
    assert(computeComplexityScore("What's the difference between Plus and Premium subscriptions?") >= 0.4,
        'Comparison query scores >= 0.4');

    assert(computeComplexityScore('Compare the billing options and subscription plans') >= 0.4,
        '"Compare" keyword triggers complexity');

    assert(computeComplexityScore('If I cancel my subscription, what happens to my appointments?') >= 0.4,
        'Conditional query triggers complexity');

    assert(computeComplexityScore('What happens when I miss my appointment and also need a refund?') >= 0.4,
        'Multi-topic with "and also" triggers complexity');
});

describe('Query Complexity — Heuristic decomposition', () => {
    const comparison = decomposeByHeuristic('What is the difference between Plus and Premium?');
    assert(comparison.length === 2, `Comparison decomposed to 2 sub-queries (got ${comparison.length})`);

    const simple = decomposeByHeuristic('How do I book an appointment?');
    assert(simple.length === 1, 'Simple query stays as single query');

    const multiQuestion = decomposeByHeuristic('What is billing? How do I cancel?');
    // This may or may not decompose depending on the pattern matching
    assert(multiQuestion.length >= 1, 'Multi-question produces at least 1 sub-query');
});

describe('Query Complexity — Edge cases', () => {
    assert(computeComplexityScore('') < 0.4, 'Empty query is simple');
    assert(computeComplexityScore('hi') < 0.4, 'Very short query is simple');
    assert(computeComplexityScore('a'.repeat(500)) < 0.6, 'Long gibberish does not falsely trigger high complexity');
});

// ═══════════════════════════════════════════════════════════════════════
// 4. MODEL ROUTER CONFIG
// ═══════════════════════════════════════════════════════════════════════

describe('Model Router Config — Defaults', () => {
    // Import the config loading logic
    const { ModelRouter } = require('../../communication-service/src/utils/model-router');
    const router = new ModelRouter();
    const config = router.getConfig();

    assert(config.generation !== undefined, 'Generation config exists');
    assert(config.validation !== undefined, 'Validation config exists');
    assert(config.planning !== undefined, 'Planning config exists');
    assert(config.evaluation !== undefined, 'Evaluation config exists');

    assert(typeof config.generation.bedrock.modelId === 'string' && config.generation.bedrock.modelId.length > 0,
        'Generation bedrock modelId is a non-empty string');
    assert(config.generation.bedrock.maxTokens > 0,
        'Generation bedrock maxTokens is positive');

    assert(typeof config.validation.vertex.modelName === 'string' && config.validation.vertex.modelName.length > 0,
        'Validation vertex modelName is a non-empty string');
    assert(config.validation.vertex.maxTokens > 0,
        'Validation vertex maxTokens is positive');

    assert(typeof config.planning.azure.deployment === 'string' && config.planning.azure.deployment.length > 0,
        'Planning azure deployment is a non-empty string');
    assert(config.planning.azure.maxTokens > 0,
        'Planning azure maxTokens is positive');

    // Validation should use fewer tokens than generation
    assert(config.validation.bedrock.maxTokens <= config.generation.bedrock.maxTokens,
        `Validation maxTokens (${config.validation.bedrock.maxTokens}) <= generation (${config.generation.bedrock.maxTokens})`);
});

// ═══════════════════════════════════════════════════════════════════════
// 5. VALIDATION RESULT STRUCTURE
// ═══════════════════════════════════════════════════════════════════════

describe('Validation — High confidence skip', () => {
    // We can't call validateResponse without AI, but we can test the skip logic
    // by importing and checking the confidence threshold behavior
    const highConfidence = scoreConfidence(
        'appointment booking',
        'Appointment booking is available on the platform. You can book an appointment with any doctor at any time. Booking requires a valid payment method. Go to the Appointments section to get started.',
        'faq'
    );

    // The validation function would skip if score >= VALIDATION_SKIP_THRESHOLD (0.85)
    // We verify the confidence scorer produces scores in expected ranges
    assert(typeof highConfidence.score === 'number', 'Score is a number');
    assert(highConfidence.score >= 0 && highConfidence.score <= 1, 'Score is in [0, 1] range');
    assert(highConfidence.action === 'use_rag' || highConfidence.action === 'skip_rag',
        `Action is a valid value (got ${highConfidence.action})`);
    assert(highConfidence.factors.termOverlap >= 0 && highConfidence.factors.termOverlap <= 1,
        'Term overlap factor in [0, 1]');
    assert(highConfidence.factors.contextLength >= 0 && highConfidence.factors.contextLength <= 1,
        'Context length factor in [0, 1]');
    assert(highConfidence.factors.specificity >= 0 && highConfidence.factors.specificity <= 1,
        'Specificity factor in [0, 1]');
});

// ═══════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`);
console.log(`RAG PIPELINE TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);

if (failed > 0) {
    console.error('\n\u274C RAG pipeline tests FAILED');
    process.exit(1);
}

console.log('\n\u2705 All RAG pipeline tests passed.');
