import { Request, Response } from "express";
import { safeError } from '../../../../shared/logger';

// SNOMED CT public browser API (free, no API key)
const SNOMED_BASE = "https://browser.ihtsdotools.org/snowstorm/snomed-ct";
const SNOMED_EDITION = "MAIN/SNOMEDCT-US";
const SNOMED_SYSTEM = "http://snomed.info/sct";

async function snomedFetch(path: string): Promise<any> {
    const url = `${SNOMED_BASE}/${SNOMED_EDITION}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const res = await fetch(url, {
            headers: { Accept: "application/json", "Accept-Language": "en" },
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`SNOMED API ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}

/** GET /terminology/snomed/search?term=diabetes&semantic=disorder&limit=20 */
export const searchSNOMED = async (req: Request, res: Response) => {
    const term = (req.query.term as string || "").trim();
    const semantic = req.query.semantic as string || "";
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    if (!term || term.length < 2) return res.status(400).json({ error: "term query param required (min 2 chars)" });

    try {
        const params = new URLSearchParams({
            term,
            activeFilter: "true",
            limit: String(limit),
            offset: "0"
        });
        if (semantic) params.set("semanticTag", semantic);

        const data = await snomedFetch(`/concepts?${params.toString()}`);
        const items = data?.items || [];

        const results = items.map((item: any) => ({
            conceptId: item.conceptId,
            term: item.pt?.term || item.fsn?.term || "",
            fsn: item.fsn?.term || "",
            active: item.active,
            definitionStatus: item.definitionStatus,
            semanticTag: extractSemanticTag(item.fsn?.term || ""),
            coding: {
                system: SNOMED_SYSTEM,
                code: item.conceptId,
                display: item.pt?.term || item.fsn?.term || ""
            }
        }));

        res.json({
            resourceType: "Bundle",
            type: "searchset",
            total: data?.total || results.length,
            entry: results.map((r: any) => ({
                resource: {
                    resourceType: "CodeSystem",
                    concept: [{
                        code: r.conceptId,
                        display: r.term,
                        designation: [{ value: r.fsn, use: { code: "900000000000003001", display: "Fully specified name" } }]
                    }]
                }
            })),
            concepts: results
        });
    } catch (error: any) {
        safeError("SNOMED search failed", error.message);
        res.status(502).json({ error: "SNOMED API unavailable", details: error.message });
    }
};

/** GET /terminology/snomed/:conceptId */
export const getSNOMEDConcept = async (req: Request, res: Response) => {
    const { conceptId } = req.params;
    if (!conceptId || !/^\d+$/.test(conceptId)) return res.status(400).json({ error: "Valid SNOMED concept ID required" });

    try {
        const [concept, children] = await Promise.all([
            snomedFetch(`/concepts/${conceptId}`),
            snomedFetch(`/concepts/${conceptId}/children?form=inferred&offset=0&limit=50`).catch(() => [])
        ]);

        if (!concept || !concept.conceptId) return res.status(404).json({ error: "Concept not found" });

        const descriptions = (concept.descriptions || [])
            .filter((d: any) => d.active)
            .map((d: any) => ({
                term: d.term,
                type: d.type,
                lang: d.lang,
                acceptability: d.acceptabilityMap
            }));

        const result = {
            conceptId: concept.conceptId,
            term: concept.pt?.term || concept.fsn?.term || "",
            fsn: concept.fsn?.term || "",
            active: concept.active,
            definitionStatus: concept.definitionStatus,
            effectiveTime: concept.effectiveTime,
            moduleId: concept.moduleId,
            semanticTag: extractSemanticTag(concept.fsn?.term || ""),
            descriptions,
            children: (Array.isArray(children) ? children : children?.items || []).map((c: any) => ({
                conceptId: c.conceptId,
                term: c.pt?.term || c.fsn?.term || "",
                definitionStatus: c.definitionStatus,
                active: c.active
            })),
            coding: {
                system: SNOMED_SYSTEM,
                code: concept.conceptId,
                display: concept.pt?.term || concept.fsn?.term || ""
            }
        };

        res.json(result);
    } catch (error: any) {
        safeError("SNOMED concept fetch failed", error.message);
        res.status(502).json({ error: "SNOMED API unavailable", details: error.message });
    }
};

/** GET /terminology/snomed/:conceptId/children */
export const getSNOMEDChildren = async (req: Request, res: Response) => {
    const { conceptId } = req.params;
    if (!conceptId || !/^\d+$/.test(conceptId)) return res.status(400).json({ error: "Valid SNOMED concept ID required" });

    try {
        const data = await snomedFetch(`/concepts/${conceptId}/children?form=inferred&offset=0&limit=100`);
        const items = Array.isArray(data) ? data : data?.items || [];

        res.json({
            parentConceptId: conceptId,
            total: items.length,
            children: items.map((c: any) => ({
                conceptId: c.conceptId,
                term: c.pt?.term || c.fsn?.term || "",
                fsn: c.fsn?.term || "",
                active: c.active,
                definitionStatus: c.definitionStatus,
                coding: {
                    system: SNOMED_SYSTEM,
                    code: c.conceptId,
                    display: c.pt?.term || c.fsn?.term || ""
                }
            }))
        });
    } catch (error: any) {
        safeError("SNOMED children fetch failed", error.message);
        res.status(502).json({ error: "SNOMED API unavailable", details: error.message });
    }
};

// --- Common SNOMED Root Concepts for Clinical Use ---

/** GET /terminology/snomed/common/findings — Common clinical findings root concepts */
export const getCommonFindings = async (_req: Request, res: Response) => {
    const commonRoots = [
        { conceptId: "404684003", term: "Clinical finding", semantic: "finding" },
        { conceptId: "71388002", term: "Procedure", semantic: "procedure" },
        { conceptId: "413350009", term: "Finding with explicit context", semantic: "finding" },
        { conceptId: "272379006", term: "Event", semantic: "event" },
        { conceptId: "243796009", term: "Situation with explicit context", semantic: "situation" },
        { conceptId: "363787002", term: "Observable entity", semantic: "observable entity" },
        { conceptId: "123037004", term: "Body structure", semantic: "body structure" },
        { conceptId: "105590001", term: "Substance", semantic: "substance" },
        { conceptId: "373873005", term: "Pharmaceutical / biologic product", semantic: "product" },
        { conceptId: "78621006", term: "Physical force", semantic: "physical force" },
    ];

    res.json({
        system: SNOMED_SYSTEM,
        total: commonRoots.length,
        roots: commonRoots.map(r => ({
            ...r,
            coding: { system: SNOMED_SYSTEM, code: r.conceptId, display: r.term }
        }))
    });
};

function extractSemanticTag(fsn: string): string {
    const match = fsn.match(/\(([^)]+)\)$/);
    return match ? match[1] : "";
}
