import { z } from 'zod';

export class AIUnavailableError extends Error {
    constructor() {
        super('AI_ASSESSMENT_UNAVAILABLE');
        this.name = 'AIUnavailableError';
    }
}

const assessment = z.object({
    risk: z.enum(['High', 'Medium', 'Low']),
    reason: z.string().trim().min(1),
});

export function parseClinicalAssessment(text: string) {
    try {
        // Accept JSON or a single JSON code fence, not arbitrary prose around JSON.
        const clean = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1').trim();
        return assessment.parse(JSON.parse(clean));
    } catch {
        throw new AIUnavailableError();
    }
}
