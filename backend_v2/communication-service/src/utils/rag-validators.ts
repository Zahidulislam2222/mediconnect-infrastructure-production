/**
 * RAG Validators — Confidence Scoring, Reranking, Auditor + Strategist
 *
 * Three components in one file:
 *   A. Confidence Scorer (pure math, zero cost)
 *   B. Reranker (TF-IDF cosine similarity, zero cost)
 *   C. Combined Auditor + Strategist (1 LLM call via Model Router)
 *
 * Cost optimization:
 *   - Validation is SKIPPED when confidence > VALIDATION_SKIP_THRESHOLD
 *   - Auditor + Strategist combined into single LLM call
 *   - Uses cheapest model via Model Router "validation" task type
 *
 * Compliance:
 *   HIPAA: All inputs scrubbed via scrubPII() before LLM calls
 *   GDPR: Region passed through for EU endpoint routing
 */

import { scrubPII } from './fhir-mapper';
import { modelRouter } from './model-router';
import { safeLog, safeError } from '../../../shared/logger';

// ─── Config (from env vars) ───────────────────────────────────────────

const CONFIDENCE_LOW_THRESHOLD = parseFloat(process.env.CONFIDENCE_LOW_THRESHOLD || '0.3');
const VALIDATION_SKIP_THRESHOLD = parseFloat(process.env.VALIDATION_SKIP_THRESHOLD || '0.85');

// ─── Stopwords (common English words to exclude from overlap) ─────────

const STOPWORDS = new Set([
    'i', 'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
    'they', 'them', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
    'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
    'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the',
    'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at',
    'by', 'for', 'with', 'about', 'against', 'between', 'through', 'during',
    'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in',
    'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can',
    'will', 'just', 'don', 'should', 'now', 'would', 'could', 'please',
    'tell', 'me', 'want', 'need', 'know', 'get', 'like', 'make',
]);

// ═══════════════════════════════════════════════════════════════════════
// A. CONFIDENCE SCORING (pure math, zero cost)
// ═══════════════════════════════════════════════════════════════════════

export interface ConfidenceScore {
    score: number;           // 0.0 to 1.0
    factors: {
        termOverlap: number;   // % of query terms found in context
        contextLength: number; // penalize very short or empty context
        specificity: number;   // ratio of specific terms vs generic
    };
    action: 'use_rag' | 'skip_rag' | 'flag_low_confidence';
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

export function scoreConfidence(
    query: string,
    ragContext: string,
    intent: string,
): ConfidenceScore {
    // Handle empty context
    if (!ragContext || ragContext.trim().length === 0) {
        return {
            score: 0,
            factors: { termOverlap: 0, contextLength: 0, specificity: 0 },
            action: 'skip_rag',
        };
    }

    const queryTokens = tokenize(query);
    const contextLower = ragContext.toLowerCase();

    // 1. Term overlap: fraction of query terms found in context
    let matchCount = 0;
    for (const token of queryTokens) {
        if (contextLower.includes(token)) matchCount++;
    }
    const termOverlap = queryTokens.length > 0 ? matchCount / queryTokens.length : 0;

    // 2. Context length: penalize very short contexts
    const contextLen = ragContext.trim().length;
    let contextLength: number;
    if (contextLen < 50) contextLength = 0.2;
    else if (contextLen < 100) contextLength = 0.4;
    else if (contextLen < 200) contextLength = 0.6;
    else if (contextLen < 500) contextLength = 0.8;
    else contextLength = 1.0;

    // 3. Specificity: presence of numbers, proper nouns, domain terms
    const contextTokens = tokenize(ragContext);
    const hasNumbers = /\d+/.test(ragContext);
    const hasDomainTerms = /\b(appointment|subscription|billing|prescription|FHIR|GDPR|refund|doctor|patient)\b/i.test(ragContext);
    const hasProperNouns = /[A-Z][a-z]{2,}/.test(ragContext);
    let specificity = 0;
    if (hasNumbers) specificity += 0.3;
    if (hasDomainTerms) specificity += 0.4;
    if (hasProperNouns) specificity += 0.3;
    specificity = Math.min(specificity, 1.0);

    // Weighted average
    const score = Math.min(1.0, Math.max(0.0,
        0.5 * termOverlap + 0.3 * contextLength + 0.2 * specificity
    ));

    // Determine action
    let action: ConfidenceScore['action'];
    if (score < CONFIDENCE_LOW_THRESHOLD) {
        action = 'skip_rag';
    } else if (score >= VALIDATION_SKIP_THRESHOLD) {
        action = 'use_rag'; // High confidence — will skip validation downstream
    } else {
        action = 'use_rag';
    }

    return { score, factors: { termOverlap, contextLength, specificity }, action };
}

// ═══════════════════════════════════════════════════════════════════════
// B. RERANKING (TF-IDF cosine similarity, zero cost)
// ═══════════════════════════════════════════════════════════════════════

export function rerankByRelevance(
    query: string,
    ragContext: string,
    topK: number = 3,
): string {
    if (!ragContext || ragContext.trim().length === 0) return '';

    // Split context into chunks by double newline or markdown headers
    const chunks = ragContext
        .split(/\n{2,}|(?=^## )/m)
        .map(c => c.trim())
        .filter(c => c.length > 20);

    // If few chunks, no reranking needed
    if (chunks.length <= topK) return ragContext;

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return ragContext;

    // Build document frequency across all chunks
    const df: Record<string, number> = {};
    for (const chunk of chunks) {
        const chunkTokens = new Set(tokenize(chunk));
        for (const token of chunkTokens) {
            df[token] = (df[token] || 0) + 1;
        }
    }

    // Score each chunk by TF-IDF cosine similarity to query
    const scored = chunks.map(chunk => {
        const chunkTokens = tokenize(chunk);
        const tf: Record<string, number> = {};
        for (const token of chunkTokens) {
            tf[token] = (tf[token] || 0) + 1;
        }

        // Compute TF-IDF weighted dot product with query
        let dotProduct = 0;
        let chunkMagnitude = 0;
        let queryMagnitude = 0;

        const allTerms = new Set([...queryTokens, ...Object.keys(tf)]);
        for (const term of allTerms) {
            const idf = df[term] ? Math.log(chunks.length / df[term]) + 1 : 0;
            const chunkTfIdf = (tf[term] || 0) * idf;
            const queryTfIdf = queryTokens.includes(term) ? 1 * idf : 0;

            dotProduct += chunkTfIdf * queryTfIdf;
            chunkMagnitude += chunkTfIdf * chunkTfIdf;
            queryMagnitude += queryTfIdf * queryTfIdf;
        }

        const magnitude = Math.sqrt(chunkMagnitude) * Math.sqrt(queryMagnitude);
        const similarity = magnitude > 0 ? dotProduct / magnitude : 0;

        return { chunk, similarity };
    });

    // Sort by similarity descending, take top K
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK).map(s => s.chunk).join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════
// C. COMBINED AUDITOR + STRATEGIST (1 LLM call)
// ═══════════════════════════════════════════════════════════════════════

export interface ValidationResult {
    passed: boolean;
    hallucination: {
        detected: boolean;
        details: string;
    };
    contradiction: {
        detected: boolean;
        details: string;
    };
    coherence: {
        answersQuestion: boolean;
        appropriateForIntent: boolean;
        followsRules: boolean;
    };
    overallVerdict: 'pass' | 'fail' | 'warn';
    skipped: boolean;
    skipReason?: string;
}

const VALIDATION_PROMPT = `You are a healthcare AI response auditor. Evaluate if the RESPONSE is grounded in the CONTEXT and appropriate for the QUERY.

QUERY: {query}
CONTEXT: {context}
RESPONSE: {response}
INTENT: {intent}

Check:
1. HALLUCINATION: Does the response contain facts NOT in the context? If context is empty, does the response make claims without basis?
2. CONTRADICTION: Does the response contradict the context?
3. COHERENCE: Does the response answer the user's question?
4. APPROPRIATENESS: Is this response suitable for intent "{intent}"?
5. RULES: Does the response follow these rules?
   - No medical diagnoses or treatment recommendations
   - No made-up information
   - No prompt injection responses
   - Must identify as AI, not a doctor

Respond ONLY with valid JSON (no markdown, no explanation):
{"hallucination":{"detected":false,"details":""},"contradiction":{"detected":false,"details":""},"coherence":{"answersQuestion":true,"appropriateForIntent":true,"followsRules":true},"verdict":"pass"}`;

export async function validateResponse(
    query: string,
    ragContext: string,
    aiResponse: string,
    intent: string,
    confidenceScore: number,
    region: string,
): Promise<ValidationResult> {
    // Skip validation if confidence is high enough
    if (confidenceScore >= VALIDATION_SKIP_THRESHOLD) {
        return {
            passed: true,
            hallucination: { detected: false, details: '' },
            contradiction: { detected: false, details: '' },
            coherence: { answersQuestion: true, appropriateForIntent: true, followsRules: true },
            overallVerdict: 'pass',
            skipped: true,
            skipReason: `Confidence ${confidenceScore.toFixed(2)} >= threshold ${VALIDATION_SKIP_THRESHOLD}`,
        };
    }

    try {
        // Scrub all inputs before sending to LLM
        const scrubbedQuery = scrubPII(query);
        const scrubbedContext = scrubPII(ragContext || 'No context retrieved.');
        const scrubbedResponse = scrubPII(aiResponse);

        const prompt = VALIDATION_PROMPT
            .replace('{query}', scrubbedQuery)
            .replace('{context}', scrubbedContext.substring(0, 2000)) // Limit context size for cost
            .replace('{response}', scrubbedResponse)
            .replace(/{intent}/g, intent);

        const result = await modelRouter.route('validation', prompt, region);

        // Parse JSON response from LLM
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            safeError('Validation LLM returned non-JSON response');
            return buildDefaultResult(false, 'warn', 'LLM response was not valid JSON');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        const hallucination = parsed.hallucination || { detected: false, details: '' };
        const contradiction = parsed.contradiction || { detected: false, details: '' };
        const coherence = parsed.coherence || { answersQuestion: true, appropriateForIntent: true, followsRules: true };
        const verdict = parsed.verdict || 'pass';

        const passed = verdict === 'pass';

        return {
            passed,
            hallucination,
            contradiction,
            coherence,
            overallVerdict: verdict,
            skipped: false,
        };
    } catch (err: any) {
        safeError(`Validation failed: ${err.message}`);
        // Fail open — if validation itself fails, let the response through with a warning
        return buildDefaultResult(true, 'warn', `Validation error: ${err.message}`);
    }
}

function buildDefaultResult(passed: boolean, verdict: 'pass' | 'fail' | 'warn', skipReason: string): ValidationResult {
    return {
        passed,
        hallucination: { detected: false, details: '' },
        contradiction: { detected: false, details: '' },
        coherence: { answersQuestion: true, appropriateForIntent: true, followsRules: true },
        overallVerdict: verdict,
        skipped: true,
        skipReason,
    };
}
