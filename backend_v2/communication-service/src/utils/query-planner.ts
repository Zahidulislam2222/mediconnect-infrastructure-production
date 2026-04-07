/**
 * Query Planner — Complex query decomposition
 *
 * Detects if a query needs multi-step retrieval, decomposes into sub-queries,
 * and combines results from multiple LightRAG calls.
 *
 * Cost optimization:
 *   - Heuristic detection first (free regex/keyword matching)
 *   - LLM fallback only for ambiguous cases (0.4-0.6 complexity score)
 *   - Hard cap: max 3 sub-queries per request
 *   - Simple queries (majority) pass through unchanged — zero overhead
 *
 * Compliance:
 *   HIPAA: All inputs scrubbed via scrubPII() before LLM calls
 *   GDPR: Region passed through for EU endpoint routing
 */

import { scrubPII } from './fhir-mapper';
import { modelRouter } from './model-router';
import { scoreConfidence } from './rag-validators';
import { safeLog, safeError } from '../../../shared/logger';

// ─── Types ─────────────────────────────────────────────────────────────

export interface QueryPlan {
    isComplex: boolean;
    subQueries: string[];
    reasoning?: string;
    estimatedCalls: number;
}

export interface CombinedContext {
    context: string;
    subResults: Array<{
        subQuery: string;
        result: string;
        confidenceScore: number;
    }>;
}

// ─── Complexity Detection (heuristic, free) ────────────────────────────

const MAX_SUB_QUERIES = 3;

// Patterns that indicate multi-topic queries
const COMPARISON_PATTERNS = [
    /\b(compare|vs\.?|versus|difference(?:s)?\s+between|which\s+is\s+better)\b/i,
    /\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?)\b/i,
];

const CONJUNCTION_PATTERNS = [
    /\b(and\s+also|as\s+well\s+as|in\s+addition\s+to)\b/i,
    /\b(both|and)\b.*\b(appointment|subscription|billing|prescription|record|refund|cancel)\b/i,
];

const CONDITIONAL_PATTERNS = [
    /\bif\b.{5,}\b(then|what\s+happens|will)\b/i,
    /\bwhat\s+happens\s+(when|if)\b/i,
    /\bin\s+case\s+of\b/i,
];

// Topic keywords from the chatbot's domain
const TOPIC_KEYWORDS = [
    'appointment', 'booking', 'schedule', 'reschedule', 'cancel',
    'subscription', 'plan', 'upgrade', 'downgrade', 'plus', 'premium', 'free',
    'billing', 'payment', 'refund', 'invoice', 'charge',
    'prescription', 'medication', 'drug',
    'record', 'health', 'data', 'export', 'fhir', 'gdpr',
    'doctor', 'patient', 'video', 'consultation',
    'privacy', 'account', 'profile', 'password', 'mfa',
];

function computeComplexityScore(query: string): number {
    const lower = query.toLowerCase();
    let score = 0;

    // Check comparison patterns (+0.4 each, max contribution 0.4)
    for (const pattern of COMPARISON_PATTERNS) {
        if (pattern.test(lower)) { score += 0.4; break; }
    }

    // Check conjunction patterns (+0.3 each, max contribution 0.3)
    for (const pattern of CONJUNCTION_PATTERNS) {
        if (pattern.test(lower)) { score += 0.3; break; }
    }

    // Check conditional patterns (+0.3 each, max contribution 0.3)
    for (const pattern of CONDITIONAL_PATTERNS) {
        if (pattern.test(lower)) { score += 0.3; break; }
    }

    // Multiple question marks (+0.3)
    const questionMarks = (query.match(/\?/g) || []).length;
    if (questionMarks > 1) score += 0.3;

    // Count distinct topic keywords
    const foundTopics = new Set<string>();
    for (const keyword of TOPIC_KEYWORDS) {
        if (lower.includes(keyword)) foundTopics.add(keyword);
    }
    // More than 2 distinct topics → +0.2 per extra topic (capped)
    if (foundTopics.size > 2) {
        score += Math.min(0.3, (foundTopics.size - 2) * 0.15);
    }

    // Word count: very long queries are more likely complex
    const wordCount = query.split(/\s+/).length;
    if (wordCount > 20) score += 0.1;

    return Math.min(1.0, score);
}

function decomposeByHeuristic(query: string): string[] {
    const lower = query.toLowerCase();

    // Try splitting by "and" connecting different topics
    const andParts = query.split(/\band\b|\balso\b|\bas well as\b/i)
        .map(p => p.trim())
        .filter(p => p.length > 10);

    if (andParts.length >= 2 && andParts.length <= MAX_SUB_QUERIES) {
        // Verify each part has a topic keyword (not just filler)
        const validParts = andParts.filter(part => {
            const partLower = part.toLowerCase();
            return TOPIC_KEYWORDS.some(kw => partLower.includes(kw));
        });
        if (validParts.length >= 2) return validParts.slice(0, MAX_SUB_QUERIES);
    }

    // Try splitting by question marks
    const questionParts = query.split(/\?/)
        .map(p => p.trim())
        .filter(p => p.length > 10);

    if (questionParts.length >= 2 && questionParts.length <= MAX_SUB_QUERIES) {
        return questionParts.slice(0, MAX_SUB_QUERIES).map(p => p + '?');
    }

    // For comparison queries, create two queries for each side
    const compMatch = query.match(/difference(?:s)?\s+between\s+(.+?)\s+and\s+(.+?)(?:\?|$)/i)
        || query.match(/compare\s+(.+?)\s+(?:and|vs\.?|versus)\s+(.+?)(?:\?|$)/i);
    if (compMatch) {
        return [
            `What is ${compMatch[1].trim()}?`,
            `What is ${compMatch[2].trim()}?`,
        ];
    }

    // Fallback: return original as single query
    return [query];
}

// ─── LLM-based decomposition (only for ambiguous cases) ────────────────

const PLANNING_PROMPT = `You are a query planner for a healthcare chatbot. Determine if this query needs to be split into sub-queries for separate information retrieval.

The chatbot covers: appointments, billing, subscriptions, health records, prescriptions, privacy, and account settings.

Query: "{query}"

If the query asks about ONE topic, respond:
{"complex":false,"subQueries":[]}

If the query asks about MULTIPLE topics or needs information from different areas, split it into max 3 focused sub-queries:
{"complex":true,"subQueries":["sub-query 1","sub-query 2"]}

Respond ONLY with valid JSON:`;

async function decomposeByLLM(query: string, region: string): Promise<string[]> {
    try {
        const scrubbedQuery = scrubPII(query);
        const prompt = PLANNING_PROMPT.replace('{query}', scrubbedQuery);
        const result = await modelRouter.route('planning', prompt, region);

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return [query];

        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.complex && Array.isArray(parsed.subQueries) && parsed.subQueries.length > 0) {
            return parsed.subQueries.slice(0, MAX_SUB_QUERIES);
        }
        return [query];
    } catch (err: any) {
        safeError(`Query planning LLM failed: ${err.message}`);
        return [query]; // Fail gracefully — treat as simple query
    }
}

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Analyze query complexity and create a retrieval plan.
 * Uses heuristics first (free), LLM only for ambiguous cases.
 */
export async function planQuery(
    query: string,
    intent: string,
    region: string,
): Promise<QueryPlan> {
    // Off-topic and action intents are always simple
    if (intent === 'off_topic' || intent === 'action') {
        return { isComplex: false, subQueries: [query], estimatedCalls: 1 };
    }

    const complexityScore = computeComplexityScore(query);

    // Clearly simple
    if (complexityScore < 0.4) {
        return {
            isComplex: false,
            subQueries: [query],
            reasoning: `Complexity score ${complexityScore.toFixed(2)} < 0.4`,
            estimatedCalls: 1,
        };
    }

    // Clearly complex — use heuristic decomposition
    if (complexityScore >= 0.6) {
        const subQueries = decomposeByHeuristic(query);
        const isComplex = subQueries.length > 1;
        return {
            isComplex,
            subQueries,
            reasoning: `Complexity score ${complexityScore.toFixed(2)} >= 0.6 (heuristic)`,
            estimatedCalls: subQueries.length,
        };
    }

    // Ambiguous zone (0.4-0.6) — ask LLM
    safeLog(`Query planner: ambiguous complexity ${complexityScore.toFixed(2)}, using LLM`);
    const subQueries = await decomposeByLLM(query, region);
    const isComplex = subQueries.length > 1;
    return {
        isComplex,
        subQueries,
        reasoning: `Complexity score ${complexityScore.toFixed(2)} in ambiguous zone, LLM decomposed to ${subQueries.length} queries`,
        estimatedCalls: subQueries.length,
    };
}

/**
 * Execute a query plan by running sub-queries against LightRAG and combining results.
 */
export async function executeQueryPlan(
    plan: QueryPlan,
    queryFn: (query: string, mode: 'naive' | 'mix') => Promise<string>,
    intent: string,
): Promise<CombinedContext> {
    const ragMode = intent === 'faq' || intent === 'action' ? 'naive' : 'mix';

    if (!plan.isComplex || plan.subQueries.length <= 1) {
        // Simple query — single retrieval
        const result = await queryFn(plan.subQueries[0], ragMode);
        const confidence = scoreConfidence(plan.subQueries[0], result, intent);
        return {
            context: result,
            subResults: [{
                subQuery: plan.subQueries[0],
                result,
                confidenceScore: confidence.score,
            }],
        };
    }

    // Complex query — parallel sub-queries
    const subResults = await Promise.all(
        plan.subQueries.map(async (subQuery) => {
            const result = await queryFn(subQuery, ragMode);
            const confidence = scoreConfidence(subQuery, result, intent);
            return { subQuery, result, confidenceScore: confidence.score };
        })
    );

    // Combine results with source labels, filtering out empty results
    const combinedParts = subResults
        .filter(r => r.result && r.result.trim().length > 0)
        .map(r => `[About: ${r.subQuery}]\n${r.result}`);

    return {
        context: combinedParts.join('\n\n---\n\n'),
        subResults,
    };
}

// Export for testing
export { computeComplexityScore, decomposeByHeuristic };
