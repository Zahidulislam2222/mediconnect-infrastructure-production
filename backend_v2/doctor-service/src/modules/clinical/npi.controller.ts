import { Request, Response } from "express";
import { writeAuditLog } from '../../../../shared/audit';
import { safeError } from '../../../../shared/logger';

const NPPES_BASE = "https://npiregistry.cms.hhs.gov/api";

const extractRegion = (req: Request): string => {
    const rawRegion = req.headers['x-user-region'];
    return Array.isArray(rawRegion) ? rawRegion[0] : (rawRegion || "us-east-1");
};

interface NPPESResult {
    npi: string;
    name: string;
    credential: string;
    gender: string;
    enumeration_type: string;
    address: any;
    taxonomies: any[];
    identifiers: any[];
}

function parseNPPESResult(r: any): NPPESResult {
    const basic = r.basic || {};
    const addresses = r.addresses || [];
    const primaryAddr = addresses.find((a: any) => a.address_purpose === "LOCATION") || addresses[0] || {};

    return {
        npi: r.number,
        name: basic.organization_name || `${basic.first_name || ""} ${basic.last_name || ""}`.trim(),
        credential: basic.credential || "",
        gender: basic.gender || "",
        enumeration_type: r.enumeration_type === "NPI-1" ? "Individual" : "Organization",
        address: {
            line: [primaryAddr.address_1, primaryAddr.address_2].filter(Boolean),
            city: primaryAddr.city,
            state: primaryAddr.state,
            postalCode: primaryAddr.postal_code,
            country: primaryAddr.country_code
        },
        taxonomies: (r.taxonomies || []).map((t: any) => ({
            code: t.code,
            description: t.desc,
            primary: t.primary,
            state: t.state,
            license: t.license
        })),
        identifiers: (r.identifiers || []).map((id: any) => ({
            code: id.code,
            type: id.desc,
            issuer: id.issuer,
            state: id.state
        }))
    };
}

/** NPI Luhn checksum validation (10-digit NPI format) */
function isValidNPIFormat(npi: string): boolean {
    if (!/^\d{10}$/.test(npi)) return false;

    // NPI uses Luhn algorithm with prefix 80840
    const prefixed = "80840" + npi;
    let sum = 0;
    let alternate = false;
    for (let i = prefixed.length - 1; i >= 0; i--) {
        let n = parseInt(prefixed[i], 10);
        if (alternate) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alternate = !alternate;
    }
    return sum % 10 === 0;
}

/** GET /doctors/npi/validate/:npi */
export const validateNPI = async (req: Request, res: Response) => {
    const { npi } = req.params;
    const authUser = (req as any).user;
    const region = extractRegion(req);

    if (!npi) return res.status(400).json({ error: "NPI number required" });

    // Format validation
    const formatValid = isValidNPIFormat(npi);
    if (!formatValid) {
        return res.json({
            npi,
            valid: false,
            formatValid: false,
            registryFound: false,
            reason: "Invalid NPI format (must be 10 digits passing Luhn check)"
        });
    }

    try {
        // Registry lookup
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(
            `${NPPES_BASE}/?number=${npi}&version=2.1`,
            { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (!response.ok) throw new Error(`NPPES API ${response.status}`);
        const data = await response.json();

        const resultCount = data.result_count || 0;
        if (resultCount === 0) {
            return res.json({
                npi,
                valid: false,
                formatValid: true,
                registryFound: false,
                reason: "NPI not found in NPPES registry"
            });
        }

        const provider = parseNPPESResult(data.results[0]);

        // Build FHIR Practitioner identifier
        const fhirIdentifier = {
            system: "http://hl7.org/fhir/sid/us-npi",
            value: npi
        };

        await writeAuditLog(authUser.sub, authUser.sub, "VALIDATE_NPI", `NPI: ${npi}, Found: ${provider.name}`, { region, ipAddress: req.ip });

        res.json({
            npi,
            valid: true,
            formatValid: true,
            registryFound: true,
            provider,
            fhirIdentifier
        });
    } catch (error: any) {
        safeError("NPI validation failed", error.message);
        res.status(502).json({ error: "NPPES API unavailable", details: error.message });
    }
};

/** GET /doctors/npi/lookup?name=Smith&state=NY&taxonomy=207R00000X */
export const lookupNPI = async (req: Request, res: Response) => {
    const { name, state, taxonomy, city, first_name, last_name, organization_name } = req.query;

    if (!name && !first_name && !last_name && !organization_name) {
        return res.status(400).json({ error: "At least one search parameter required (name, first_name, last_name, or organization_name)" });
    }

    try {
        const params = new URLSearchParams({ version: "2.1", limit: "20" });
        if (name) {
            // Try to split full name into first/last
            const parts = (name as string).trim().split(/\s+/);
            if (parts.length >= 2) {
                params.set("first_name", parts[0]);
                params.set("last_name", parts.slice(1).join(" "));
            } else {
                params.set("last_name", parts[0]);
            }
        }
        if (first_name) params.set("first_name", first_name as string);
        if (last_name) params.set("last_name", last_name as string);
        if (organization_name) params.set("organization_name", organization_name as string);
        if (state) params.set("state", (state as string).toUpperCase());
        if (taxonomy) params.set("taxonomy_description", taxonomy as string);
        if (city) params.set("city", city as string);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${NPPES_BASE}/?${params.toString()}`, { signal: controller.signal });
        clearTimeout(timeout);

        if (!response.ok) throw new Error(`NPPES API ${response.status}`);
        const data = await response.json();

        const results = (data.results || []).map(parseNPPESResult);

        res.json({
            resourceType: "Bundle",
            type: "searchset",
            total: results.length,
            entry: results.map((r: NPPESResult) => ({
                resource: {
                    resourceType: "Practitioner",
                    id: r.npi,
                    identifier: [{ system: "http://hl7.org/fhir/sid/us-npi", value: r.npi }],
                    name: [{ text: r.name }],
                    gender: r.gender === "M" ? "male" : r.gender === "F" ? "female" : "unknown",
                    address: [r.address],
                    qualification: r.taxonomies.map((t: any) => ({
                        code: { coding: [{ system: "http://nucc.org/provider-taxonomy", code: t.code, display: t.description }] }
                    }))
                }
            })),
            providers: results
        });
    } catch (error: any) {
        safeError("NPI lookup failed", error.message);
        res.status(502).json({ error: "NPPES API unavailable", details: error.message });
    }
};
