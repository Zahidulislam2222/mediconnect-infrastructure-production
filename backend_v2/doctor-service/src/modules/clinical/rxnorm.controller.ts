import { Request, Response } from "express";
import { getRegionalClient } from '../../../../shared/aws-config';
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { writeAuditLog } from '../../../../shared/audit';
import { safeLog, safeError } from '../../../../shared/logger';

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";
const TABLE_DRUG_CACHE = "mediconnect-drug-cache";
const CACHE_TTL_HOURS = 24;

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

// --- NLM API Helpers ---

async function rxnormFetch(path: string): Promise<any> {
    const url = `${RXNORM_BASE}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`RxNorm API ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}

function mapSeverity(description: string): "critical" | "high" | "moderate" | "low" {
    const d = description.toLowerCase();
    if (d.includes("contraindicated") || d.includes("serious") || d.includes("life-threatening")) return "critical";
    if (d.includes("major") || d.includes("severe")) return "high";
    if (d.includes("moderate")) return "moderate";
    return "low";
}

// --- Cache helpers ---

async function getCachedDrug(rxcui: string, region: string): Promise<any | null> {
    try {
        const db = getRegionalClient(region);
        const res = await db.send(new GetCommand({
            TableName: TABLE_DRUG_CACHE,
            Key: { cacheKey: `rxcui:${rxcui}` }
        }));
        if (res.Item && res.Item.expiresAt > Math.floor(Date.now() / 1000)) {
            return res.Item.data;
        }
    } catch { /* cache miss */ }
    return null;
}

async function setCachedDrug(rxcui: string, data: any, region: string): Promise<void> {
    try {
        const db = getRegionalClient(region);
        await db.send(new PutCommand({
            TableName: TABLE_DRUG_CACHE,
            Item: {
                cacheKey: `rxcui:${rxcui}`,
                data,
                expiresAt: Math.floor(Date.now() / 1000) + CACHE_TTL_HOURS * 3600,
                updatedAt: new Date().toISOString()
            }
        }));
    } catch { /* non-critical */ }
}

// --- Controllers ---

/** GET /drugs/rxnorm/search?name=aspirin */
export const searchDrugs = async (req: Request, res: Response) => {
    const name = (req.query.name as string || "").trim();
    if (!name || name.length < 2) return res.status(400).json({ error: "name query param required (min 2 chars)" });

    try {
        // Get approximate matches for better results
        const [drugRes, suggestRes] = await Promise.all([
            rxnormFetch(`/drugs.json?name=${encodeURIComponent(name)}`),
            rxnormFetch(`/approximateTerm.json?term=${encodeURIComponent(name)}&maxEntries=10`)
        ]);

        const results: any[] = [];
        const seen = new Set<string>();

        // Parse drug concept groups
        const groups = drugRes?.drugGroup?.conceptGroup || [];
        for (const group of groups) {
            for (const prop of group.conceptProperties || []) {
                if (!seen.has(prop.rxcui)) {
                    seen.add(prop.rxcui);
                    results.push({
                        rxcui: prop.rxcui,
                        name: prop.name,
                        synonym: prop.synonym || prop.name,
                        tty: prop.tty,
                        system: "http://www.nlm.nih.gov/research/umls/rxnorm",
                        coding: {
                            system: "http://www.nlm.nih.gov/research/umls/rxnorm",
                            code: prop.rxcui,
                            display: prop.name
                        }
                    });
                }
            }
        }

        // Add approximate matches not already included
        const candidates = suggestRes?.approximateGroup?.candidate || [];
        for (const c of candidates) {
            if (c.rxcui && !seen.has(c.rxcui)) {
                seen.add(c.rxcui);
                results.push({
                    rxcui: c.rxcui,
                    name: c.name || name,
                    score: c.score,
                    tty: c.tty,
                    system: "http://www.nlm.nih.gov/research/umls/rxnorm",
                    coding: {
                        system: "http://www.nlm.nih.gov/research/umls/rxnorm",
                        code: c.rxcui,
                        display: c.name || name
                    }
                });
            }
        }

        res.json({
            resourceType: "Bundle",
            type: "searchset",
            total: results.length,
            entry: results.map(r => ({
                resource: {
                    resourceType: "Medication",
                    id: r.rxcui,
                    code: { coding: [r.coding], text: r.name }
                }
            })),
            drugs: results
        });
    } catch (error: any) {
        safeError("RxNorm search failed", error.message);
        res.status(502).json({ error: "RxNorm API unavailable", details: error.message });
    }
};

/** GET /drugs/rxnorm/:rxcui/info */
export const getDrugInfo = async (req: Request, res: Response) => {
    const { rxcui } = req.params;
    const region = extractRegion(req);

    if (!rxcui || !/^\d+$/.test(rxcui)) return res.status(400).json({ error: "Valid numeric RxCUI required" });

    try {
        const cached = await getCachedDrug(rxcui, region);
        if (cached) return res.json(cached);

        const [propsRes, relatedRes] = await Promise.all([
            rxnormFetch(`/rxcui/${rxcui}/properties.json`),
            rxnormFetch(`/rxcui/${rxcui}/allrelated.json`)
        ]);

        const props = propsRes?.properties || {};
        const relatedGroups = relatedRes?.allRelatedGroup?.conceptGroup || [];

        const ingredients: any[] = [];
        const brands: any[] = [];
        for (const g of relatedGroups) {
            for (const cp of g.conceptProperties || []) {
                if (g.tty === "IN" || g.tty === "MIN") ingredients.push({ rxcui: cp.rxcui, name: cp.name });
                if (g.tty === "BN") brands.push({ rxcui: cp.rxcui, name: cp.name });
            }
        }

        const result = {
            resourceType: "Medication",
            id: rxcui,
            code: {
                coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: rxcui, display: props.name }],
                text: props.name
            },
            rxcui,
            name: props.name,
            tty: props.tty,
            ingredients,
            brands
        };

        await setCachedDrug(rxcui, result, region);
        res.json(result);
    } catch (error: any) {
        safeError("RxNorm info failed", error.message);
        res.status(502).json({ error: "RxNorm API unavailable" });
    }
};

/** GET /drugs/rxnorm/:rxcui/interactions */
export const getDrugInteractions = async (req: Request, res: Response) => {
    const { rxcui } = req.params;
    if (!rxcui || !/^\d+$/.test(rxcui)) return res.status(400).json({ error: "Valid numeric RxCUI required" });

    try {
        const data = await rxnormFetch(`/interaction/interaction.json?rxcui=${rxcui}`);
        const pairs = data?.interactionTypeGroup || [];
        const interactions: any[] = [];

        for (const group of pairs) {
            for (const iType of group.interactionType || []) {
                for (const pair of iType.interactionPair || []) {
                    const concepts = pair.interactionConcept || [];
                    interactions.push({
                        severity: mapSeverity(pair.severity || iType.comment || ""),
                        description: pair.description,
                        drugs: concepts.map((c: any) => ({
                            rxcui: c.minConceptItem?.rxcui,
                            name: c.minConceptItem?.name
                        })),
                        source: group.sourceName
                    });
                }
            }
        }

        interactions.sort((a, b) => {
            const order = { critical: 0, high: 1, moderate: 2, low: 3 };
            return (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3);
        });

        res.json({
            rxcui,
            total: interactions.length,
            hasCritical: interactions.some(i => i.severity === "critical"),
            hasHigh: interactions.some(i => i.severity === "high"),
            interactions
        });
    } catch (error: any) {
        safeError("RxNorm interactions failed", error.message);
        res.status(502).json({ error: "RxNorm API unavailable" });
    }
};

/** POST /prescriptions/check-interactions
 *  Body: { medications: [{ rxcui, name }], patientAllergies?: string[] }
 *  Returns pairwise interaction analysis with severity blocking
 */
export const checkInteractions = async (req: Request, res: Response) => {
    const { medications, patientAllergies } = req.body;
    const authUser = (req as any).user;
    const region = extractRegion(req);

    if (!medications || !Array.isArray(medications) || medications.length < 1) {
        return res.status(400).json({ error: "medications array required (min 1 item with rxcui)" });
    }

    const rxcuis = medications.map((m: any) => m.rxcui).filter(Boolean);
    if (rxcuis.length === 0) return res.status(400).json({ error: "At least one valid rxcui required" });

    try {
        const interactions: any[] = [];
        let hasCritical = false;
        let hasHigh = false;

        // Check pairwise interactions if multiple drugs
        if (rxcuis.length >= 2) {
            const data = await rxnormFetch(
                `/interaction/list.json?rxcuis=${rxcuis.join("+")}`
            );

            const groups = data?.fullInteractionTypeGroup || [];
            for (const group of groups) {
                for (const iType of group.fullInteractionType || []) {
                    for (const pair of iType.interactionPair || []) {
                        const severity = mapSeverity(pair.severity || "");
                        if (severity === "critical") hasCritical = true;
                        if (severity === "high") hasHigh = true;

                        const concepts = pair.interactionConcept || [];
                        interactions.push({
                            severity,
                            description: pair.description,
                            drugs: concepts.map((c: any) => ({
                                rxcui: c.minConceptItem?.rxcui,
                                name: c.minConceptItem?.name
                            })),
                            source: group.sourceName
                        });
                    }
                }
            }
        }

        // Check single-drug interactions for each medication
        const singleChecks = await Promise.all(
            rxcuis.map(async (rxcui: string) => {
                try {
                    const data = await rxnormFetch(`/interaction/interaction.json?rxcui=${rxcui}`);
                    const pairs = data?.interactionTypeGroup || [];
                    const results: any[] = [];
                    for (const group of pairs) {
                        for (const iType of group.interactionType || []) {
                            for (const pair of iType.interactionPair || []) {
                                const severity = mapSeverity(pair.severity || "");
                                if (severity === "critical") hasCritical = true;
                                if (severity === "high") hasHigh = true;
                                results.push({
                                    severity,
                                    description: pair.description,
                                    drugs: (pair.interactionConcept || []).map((c: any) => ({
                                        rxcui: c.minConceptItem?.rxcui,
                                        name: c.minConceptItem?.name
                                    })),
                                    source: group.sourceName
                                });
                            }
                        }
                    }
                    return results;
                } catch { return []; }
            })
        );

        // Drug-allergy cross-check (basic name matching against patient allergies)
        const allergyWarnings: any[] = [];
        if (patientAllergies && Array.isArray(patientAllergies)) {
            const allergySet = new Set(patientAllergies.map((a: string) => a.toLowerCase().trim()));
            for (const med of medications) {
                const medName = (med.name || "").toLowerCase();
                for (const allergy of allergySet) {
                    if (medName.includes(allergy) || allergy.includes(medName)) {
                        hasCritical = true;
                        allergyWarnings.push({
                            severity: "critical",
                            type: "drug-allergy",
                            drug: med.name,
                            allergy,
                            description: `Patient has documented allergy to "${allergy}" which may conflict with "${med.name}"`
                        });
                    }
                }
            }
        }

        interactions.sort((a, b) => {
            const order = { critical: 0, high: 1, moderate: 2, low: 3 };
            return (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3);
        });

        const blocked = hasCritical;

        // FHIR DetectedIssue resources
        const fhirIssues = interactions.slice(0, 20).map((i, idx) => ({
            resource: {
                resourceType: "DetectedIssue",
                id: `interaction-${idx}`,
                status: "final",
                severity: i.severity === "critical" || i.severity === "high" ? "high" : "moderate",
                code: {
                    coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "DRG", display: "Drug Interaction Alert" }]
                },
                detail: { text: i.description },
                implicated: i.drugs.map((d: any) => ({
                    reference: `Medication/${d.rxcui}`,
                    display: d.name
                }))
            }
        }));

        await writeAuditLog(
            authUser.sub, authUser.sub,
            "CHECK_DRUG_INTERACTIONS",
            `Checked ${rxcuis.length} drugs, found ${interactions.length} interactions, blocked=${blocked}`,
            { region, ipAddress: req.ip }
        );

        res.json({
            resourceType: "Bundle",
            type: "collection",
            blocked,
            hasCritical,
            hasHigh,
            summary: {
                drugsChecked: rxcuis.length,
                totalInteractions: interactions.length,
                critical: interactions.filter(i => i.severity === "critical").length,
                high: interactions.filter(i => i.severity === "high").length,
                moderate: interactions.filter(i => i.severity === "moderate").length,
                low: interactions.filter(i => i.severity === "low").length,
                allergyWarnings: allergyWarnings.length
            },
            interactions,
            allergyWarnings,
            entry: fhirIssues
        });
    } catch (error: any) {
        safeError("Interaction check failed", error.message);
        res.status(502).json({ error: "Drug interaction check failed", details: error.message });
    }
};
