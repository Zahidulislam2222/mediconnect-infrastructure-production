import { Request, Response } from "express";
import { safeError } from '../../../../shared/logger';

const OPENFDA_BASE = "https://api.fda.gov/drug";
const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

async function apiFetch(url: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`API ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}

function parseNDCResult(result: any): any {
    const openfda = result.openfda || {};
    return {
        ndc: openfda.product_ndc?.[0] || openfda.package_ndc?.[0] || "",
        packageNdc: openfda.package_ndc || [],
        brandName: openfda.brand_name?.[0] || result.products?.[0]?.brand_name || "",
        genericName: openfda.generic_name?.[0] || "",
        manufacturer: openfda.manufacturer_name?.[0] || result.products?.[0]?.marketing_category || "",
        route: openfda.route || [],
        dosageForm: result.products?.[0]?.dosage_form || openfda.dosage_form?.[0] || "",
        activeIngredients: result.products?.[0]?.active_ingredients?.map((i: any) => ({
            name: i.name,
            strength: i.strength
        })) || [],
        rxcui: openfda.rxcui || [],
        splId: openfda.spl_id?.[0] || "",
        productType: openfda.product_type?.[0] || "",
        coding: {
            system: "http://hl7.org/fhir/sid/ndc",
            code: openfda.product_ndc?.[0] || "",
            display: openfda.brand_name?.[0] || openfda.generic_name?.[0] || ""
        }
    };
}

/** GET /drugs/ndc/lookup/:ndc */
export const lookupNDC = async (req: Request, res: Response) => {
    const { ndc } = req.params;
    if (!ndc) return res.status(400).json({ error: "NDC code required" });

    // Normalize NDC: remove dashes for search
    const normalized = ndc.replace(/-/g, "");

    try {
        // Try openFDA first
        const data = await apiFetch(
            `${OPENFDA_BASE}/ndc.json?search=product_ndc:"${ndc}"+OR+package_ndc:"${ndc}"&limit=1`
        );

        if (!data.results?.length) {
            return res.status(404).json({ error: "NDC not found", ndc });
        }

        const result = data.results[0];
        const parsed = {
            ndc,
            packageNdc: result.packaging?.map((p: any) => p.package_ndc) || [],
            brandName: result.brand_name || "",
            genericName: result.generic_name || "",
            manufacturer: result.labeler_name || "",
            route: result.route || [],
            dosageForm: result.dosage_form || "",
            activeIngredients: result.active_ingredients?.map((i: any) => ({
                name: i.name,
                strength: i.strength
            })) || [],
            productType: result.product_type || "",
            deaSchedule: result.dea_schedule || "",
            marketingCategory: result.marketing_category || "",
            listing_expiration_date: result.listing_expiration_date || "",
            coding: {
                system: "http://hl7.org/fhir/sid/ndc",
                code: ndc,
                display: result.brand_name || result.generic_name || ""
            }
        };

        // Cross-reference with RxNorm for RxCUI
        let rxcui: string | null = null;
        try {
            const rxData = await apiFetch(`${RXNORM_BASE}/ndcstatus.json?ndc=${normalized}`);
            rxcui = rxData?.ndcStatus?.rxcui || null;
        } catch { /* non-critical */ }

        res.json({
            resourceType: "Medication",
            id: ndc,
            code: {
                coding: [
                    parsed.coding,
                    ...(rxcui ? [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: rxcui }] : [])
                ],
                text: parsed.brandName || parsed.genericName
            },
            ...parsed,
            rxcui
        });
    } catch (error: any) {
        safeError("NDC lookup failed", error.message);
        res.status(502).json({ error: "FDA API unavailable", details: error.message });
    }
};

/** GET /drugs/ndc/search?name=aspirin&limit=10 */
export const searchNDC = async (req: Request, res: Response) => {
    const name = (req.query.name as string || "").trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    if (!name || name.length < 2) return res.status(400).json({ error: "name query param required (min 2 chars)" });

    try {
        const data = await apiFetch(
            `${OPENFDA_BASE}/ndc.json?search=(brand_name:"${encodeURIComponent(name)}"+OR+generic_name:"${encodeURIComponent(name)}")&limit=${limit}`
        );

        const results = (data.results || []).map((r: any) => ({
            ndc: r.product_ndc || "",
            packageNdc: r.packaging?.map((p: any) => p.package_ndc) || [],
            brandName: r.brand_name || "",
            genericName: r.generic_name || "",
            manufacturer: r.labeler_name || "",
            dosageForm: r.dosage_form || "",
            route: r.route || [],
            activeIngredients: r.active_ingredients?.map((i: any) => ({
                name: i.name,
                strength: i.strength
            })) || [],
            deaSchedule: r.dea_schedule || "",
            coding: {
                system: "http://hl7.org/fhir/sid/ndc",
                code: r.product_ndc || "",
                display: r.brand_name || r.generic_name || ""
            }
        }));

        res.json({
            resourceType: "Bundle",
            type: "searchset",
            total: results.length,
            entry: results.map((r: any) => ({
                resource: {
                    resourceType: "Medication",
                    id: r.ndc,
                    code: { coding: [r.coding], text: r.brandName || r.genericName }
                }
            })),
            drugs: results
        });
    } catch (error: any) {
        safeError("NDC search failed", error.message);
        res.status(502).json({ error: "FDA API unavailable", details: error.message });
    }
};
