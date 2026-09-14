import { z } from 'zod';
import { AIUnavailableError } from './clinical-assessment';

const responseSchema = z.object({
    candidates: z.array(z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string() })).min(1) }),
    })).min(1),
});

/** Vertex protocol boundary: safety-blocked/malformed results are unavailable. */
export function parseVertexText(value: unknown): string {
    const parsed = responseSchema.safeParse(value);
    if (!parsed.success) throw new AIUnavailableError();
    const text = parsed.data.candidates[0].content.parts.map(part => part.text).join('').trim();
    if (!text) throw new AIUnavailableError();
    return text;
}
