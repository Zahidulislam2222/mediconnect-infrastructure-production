// ─── FEATURE #10: ICD-11 Support ───────────────────────────────────────────
// WHO ICD-11 API integration for clinical coding.
// ICD-10 ↔ ICD-11 cross-mapping. Dual coding support.
// API: https://icd.who.int/icdapi (free, requires token)
// Fallback: built-in common ICD-11 codes for offline use.
// ────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import { writeAuditLog } from '../../../../shared/audit';

const extractRegion = (req: Request): string => {
    const raw = req.headers['x-user-region'];
    return Array.isArray(raw) ? raw[0] : (raw || 'us-east-1');
};

// WHO ICD-11 API config
const ICD11_API_BASE = 'https://id.who.int';
const ICD11_LINEARIZATION = 'mms'; // Mortality and Morbidity Statistics

// Token cache
let tokenCache: { token: string; expires: number } | null = null;

// ─── WHO OAuth2 Token ──────────────────────────────────────────────────────

async function getWHOToken(): Promise<string | null> {
    // Check cache
    if (tokenCache && Date.now() < tokenCache.expires) {
        return tokenCache.token;
    }

    const clientId = process.env.WHO_ICD11_CLIENT_ID;
    const clientSecret = process.env.WHO_ICD11_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return null; // Will fall back to built-in codes
    }

    try {
        const response = await fetch('https://icdaccessmanagement.who.int/connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                scope: 'icdapi_access',
                grant_type: 'client_credentials',
            }),
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) return null;

        const data: any = await response.json();
        tokenCache = {
            token: data.access_token,
            expires: Date.now() + ((data.expires_in - 60) * 1000), // refresh 60s early
        };
        return tokenCache.token;
    } catch {
        return null;
    }
}

// ─── WHO API Fetch Helper ──────────────────────────────────────────────────

async function whoFetch(path: string, token: string): Promise<any> {
    const response = await fetch(`${ICD11_API_BASE}${path}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Accept-Language': 'en',
            'API-Version': 'v2',
        },
        signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`WHO API ${response.status}`);
    return response.json();
}

// ─── Built-in ICD-11 Common Codes (Offline Fallback) ───────────────────────

const COMMON_ICD11_CODES: Array<{
    code: string;
    title: string;
    chapter: string;
    icd10Equivalent: string;
    category: string;
}> = [
    // Infectious diseases
    { code: '1A00', title: 'Cholera', chapter: '01', icd10Equivalent: 'A00', category: 'Infectious' },
    { code: '1C62.1', title: 'COVID-19, virus identified', chapter: '01', icd10Equivalent: 'U07.1', category: 'Infectious' },
    { code: '1C62.0', title: 'COVID-19, virus not identified', chapter: '01', icd10Equivalent: 'U07.2', category: 'Infectious' },
    { code: '1B10', title: 'Tuberculosis of lung', chapter: '01', icd10Equivalent: 'A15', category: 'Infectious' },

    // Neoplasms
    { code: '2C25', title: 'Malignant neoplasm of breast', chapter: '02', icd10Equivalent: 'C50', category: 'Neoplasm' },
    { code: '2C82', title: 'Malignant neoplasm of prostate', chapter: '02', icd10Equivalent: 'C61', category: 'Neoplasm' },
    { code: '2B90', title: 'Malignant neoplasm of colon', chapter: '02', icd10Equivalent: 'C18', category: 'Neoplasm' },

    // Endocrine
    { code: '5A10', title: 'Type 1 diabetes mellitus', chapter: '05', icd10Equivalent: 'E10', category: 'Endocrine' },
    { code: '5A11', title: 'Type 2 diabetes mellitus', chapter: '05', icd10Equivalent: 'E11', category: 'Endocrine' },
    { code: '5B80', title: 'Obesity', chapter: '05', icd10Equivalent: 'E66', category: 'Endocrine' },
    { code: '5A00', title: 'Hypothyroidism', chapter: '05', icd10Equivalent: 'E03', category: 'Endocrine' },

    // Mental/behavioral
    { code: '6A70', title: 'Depressive episode', chapter: '06', icd10Equivalent: 'F32', category: 'Mental' },
    { code: '6A80', title: 'Generalised anxiety disorder', chapter: '06', icd10Equivalent: 'F41.1', category: 'Mental' },
    { code: '6D10', title: 'Attention deficit hyperactivity disorder', chapter: '06', icd10Equivalent: 'F90', category: 'Mental' },

    // Circulatory
    { code: 'BA00', title: 'Essential hypertension', chapter: '11', icd10Equivalent: 'I10', category: 'Circulatory' },
    { code: 'BA80', title: 'Acute myocardial infarction', chapter: '11', icd10Equivalent: 'I21', category: 'Circulatory' },
    { code: 'BA01', title: 'Heart failure', chapter: '11', icd10Equivalent: 'I50', category: 'Circulatory' },
    { code: 'BD10', title: 'Atrial fibrillation', chapter: '11', icd10Equivalent: 'I48', category: 'Circulatory' },
    { code: '8B20', title: 'Cerebral infarction (stroke)', chapter: '08', icd10Equivalent: 'I63', category: 'Circulatory' },

    // Respiratory
    { code: 'CA40', title: 'Asthma', chapter: '12', icd10Equivalent: 'J45', category: 'Respiratory' },
    { code: 'CA22', title: 'COPD', chapter: '12', icd10Equivalent: 'J44', category: 'Respiratory' },
    { code: 'CA07', title: 'Pneumonia', chapter: '12', icd10Equivalent: 'J18', category: 'Respiratory' },

    // Digestive
    { code: 'DA23', title: 'Gastro-oesophageal reflux disease', chapter: '13', icd10Equivalent: 'K21', category: 'Digestive' },
    { code: 'DB92', title: 'Cholelithiasis', chapter: '13', icd10Equivalent: 'K80', category: 'Digestive' },

    // Musculoskeletal
    { code: 'FA20', title: 'Rheumatoid arthritis', chapter: '15', icd10Equivalent: 'M05-M06', category: 'Musculoskeletal' },
    { code: 'FA01', title: 'Osteoarthritis of knee', chapter: '15', icd10Equivalent: 'M17', category: 'Musculoskeletal' },
    { code: 'FA70', title: 'Low back pain', chapter: '15', icd10Equivalent: 'M54.5', category: 'Musculoskeletal' },

    // Genitourinary
    { code: 'GB61', title: 'Chronic kidney disease', chapter: '16', icd10Equivalent: 'N18', category: 'Genitourinary' },
    { code: 'GC08', title: 'Urinary tract infection', chapter: '16', icd10Equivalent: 'N39.0', category: 'Genitourinary' },

    // Injury
    { code: 'NA10', title: 'Fracture of femur', chapter: '22', icd10Equivalent: 'S72', category: 'Injury' },

    // Pregnancy
    { code: 'JA20', title: 'Pre-eclampsia', chapter: '18', icd10Equivalent: 'O14', category: 'Pregnancy' },
    { code: 'JA65', title: 'Gestational diabetes', chapter: '18', icd10Equivalent: 'O24.4', category: 'Pregnancy' },
];

// ─── ICD-10 to ICD-11 Cross-Mapping (Built-in) ────────────────────────────

const ICD10_TO_ICD11_MAP: Record<string, { code: string; title: string }[]> = {};
for (const item of COMMON_ICD11_CODES) {
    // Handle ranges like "M05-M06"
    const icd10Codes = item.icd10Equivalent.split('-').map(c => c.trim());
    for (const icd10 of icd10Codes) {
        if (!ICD10_TO_ICD11_MAP[icd10]) ICD10_TO_ICD11_MAP[icd10] = [];
        ICD10_TO_ICD11_MAP[icd10].push({ code: item.code, title: item.title });
    }
}

// ─── GET /terminology/icd11/search ─────────────────────────────────────────

export const searchICD11 = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const region = extractRegion(req);
        const query = (req.query.q as string || '').trim();
        const category = req.query.category as string;

        if (!query || query.length < 2) {
            return res.status(400).json({ error: 'Search query must be at least 2 characters' });
        }

        // Try WHO API first
        const token = await getWHOToken();
        if (token) {
            try {
                const data = await whoFetch(
                    `/icd/release/11/2024-01/${ICD11_LINEARIZATION}/search?q=${encodeURIComponent(query)}&subtreeFilterUsesFoundationDescendants=false&includeKeywordResult=false&useFlexisearch=true&flatResults=true&highlightingEnabled=false`,
                    token
                );

                const results = (data.destinationEntities || []).slice(0, 20).map((entity: any) => ({
                    code: entity.theCode || '',
                    title: entity.title || '',
                    score: entity.score,
                    chapter: entity.chapter || '',
                    isLeaf: entity.isLeaf,
                    source: 'WHO_ICD11_API',
                    fhir: {
                        resourceType: 'CodeSystem',
                        concept: {
                            code: entity.theCode,
                            display: entity.title,
                        },
                        url: 'http://id.who.int/icd/release/11/2024-01/mms',
                    }
                }));

                await writeAuditLog(user.id, 'ICD11', 'SEARCH_ICD11', `ICD-11 search: "${query}" → ${results.length} results (API)`, { region });

                return res.json({
                    source: 'WHO_ICD11_API',
                    query,
                    total: results.length,
                    results
                });
            } catch {
                // Fall through to built-in codes
            }
        }

        // Fallback: built-in codes
        const lowerQuery = query.toLowerCase();
        let results = COMMON_ICD11_CODES.filter(item =>
            item.title.toLowerCase().includes(lowerQuery) ||
            item.code.toLowerCase().includes(lowerQuery) ||
            item.icd10Equivalent.toLowerCase().includes(lowerQuery)
        );

        if (category) {
            results = results.filter(item => item.category.toLowerCase() === category.toLowerCase());
        }

        const mapped = results.map(item => ({
            code: item.code,
            title: item.title,
            chapter: item.chapter,
            icd10Equivalent: item.icd10Equivalent,
            category: item.category,
            source: 'BUILT_IN',
            fhir: {
                resourceType: 'CodeSystem',
                concept: {
                    code: item.code,
                    display: item.title,
                },
                url: 'http://id.who.int/icd/release/11/2024-01/mms',
            }
        }));

        await writeAuditLog(user.id, 'ICD11', 'SEARCH_ICD11', `ICD-11 search: "${query}" → ${mapped.length} results (built-in)`, { region });

        res.json({
            source: 'BUILT_IN',
            query,
            total: mapped.length,
            results: mapped,
            note: 'Using built-in codes. Set WHO_ICD11_CLIENT_ID and WHO_ICD11_CLIENT_SECRET for full API access.'
        });
    } catch (error: any) {
        console.error('ICD-11 search error:', error);
        res.status(500).json({ error: 'ICD-11 search failed' });
    }
};

// ─── GET /terminology/icd11/:code ──────────────────────────────────────────

export const getICD11Code = async (req: Request, res: Response) => {
    try {
        const { code } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        // Try WHO API
        const token = await getWHOToken();
        if (token) {
            try {
                const data = await whoFetch(
                    `/icd/release/11/2024-01/${ICD11_LINEARIZATION}/codeinfo/${encodeURIComponent(code)}?flexiblemode=true`,
                    token
                );

                if (data.stemId) {
                    // Get full entity details
                    const entityPath = new URL(data.stemId).pathname;
                    const entity = await whoFetch(entityPath, token);

                    await writeAuditLog(user.id, 'ICD11', 'LOOKUP_ICD11', `ICD-11 lookup: ${code}`, { region });

                    return res.json({
                        source: 'WHO_ICD11_API',
                        code,
                        title: entity.title?.['@value'] || '',
                        definition: entity.definition?.['@value'] || '',
                        longDefinition: entity.longDefinition?.['@value'] || '',
                        codingNote: entity.codingNote?.['@value'] || '',
                        parent: entity.parent?.[0] || '',
                        exclusions: (entity.exclusion || []).map((e: any) => ({
                            label: e.label?.['@value'],
                            reference: e.foundationReference
                        })),
                        fhir: {
                            resourceType: 'CodeSystem',
                            concept: { code, display: entity.title?.['@value'] || '' },
                            url: 'http://id.who.int/icd/release/11/2024-01/mms',
                        }
                    });
                }
            } catch {
                // Fall through
            }
        }

        // Fallback: built-in
        const found = COMMON_ICD11_CODES.find(item =>
            item.code.toLowerCase() === code.toLowerCase()
        );

        if (!found) {
            return res.status(404).json({ error: `ICD-11 code not found: ${code}` });
        }

        await writeAuditLog(user.id, 'ICD11', 'LOOKUP_ICD11', `ICD-11 lookup: ${code}`, { region });

        res.json({
            source: 'BUILT_IN',
            code: found.code,
            title: found.title,
            chapter: found.chapter,
            icd10Equivalent: found.icd10Equivalent,
            category: found.category,
            fhir: {
                resourceType: 'CodeSystem',
                concept: { code: found.code, display: found.title },
                url: 'http://id.who.int/icd/release/11/2024-01/mms',
            }
        });
    } catch (error: any) {
        console.error('ICD-11 lookup error:', error);
        res.status(500).json({ error: 'ICD-11 lookup failed' });
    }
};

// ─── GET /terminology/icd11/crossmap/:icd10code ────────────────────────────

export const crossmapICD10toICD11 = async (req: Request, res: Response) => {
    try {
        const { icd10code } = req.params;
        const user = (req as any).user;
        const region = extractRegion(req);

        const upperCode = icd10code.toUpperCase().trim();

        // Try WHO API crossmap
        const token = await getWHOToken();
        if (token) {
            try {
                const data = await whoFetch(
                    `/icd/release/11/2024-01/${ICD11_LINEARIZATION}/autocode?searchText=${encodeURIComponent(upperCode)}`,
                    token
                );

                if (data.theCode) {
                    await writeAuditLog(user.id, 'ICD11', 'CROSSMAP_ICD', `ICD-10→ICD-11 crossmap: ${upperCode} → ${data.theCode}`, { region });

                    return res.json({
                        source: 'WHO_ICD11_API',
                        icd10: upperCode,
                        icd11: {
                            code: data.theCode,
                            title: data.title || '',
                        },
                        fhir: {
                            resourceType: 'ConceptMap',
                            source: 'http://hl7.org/fhir/sid/icd-10',
                            target: 'http://id.who.int/icd/release/11/2024-01/mms',
                            group: [{
                                element: [{ code: upperCode, target: [{ code: data.theCode, display: data.title, equivalence: 'equivalent' }] }]
                            }]
                        }
                    });
                }
            } catch {
                // Fall through
            }
        }

        // Fallback: built-in mapping
        const mappings = ICD10_TO_ICD11_MAP[upperCode];
        if (!mappings || mappings.length === 0) {
            return res.status(404).json({
                error: `No ICD-11 mapping found for ICD-10 code: ${upperCode}`,
                note: 'Set WHO_ICD11_CLIENT_ID and WHO_ICD11_CLIENT_SECRET for full crossmap API access.'
            });
        }

        await writeAuditLog(user.id, 'ICD11', 'CROSSMAP_ICD', `ICD-10→ICD-11 crossmap: ${upperCode} → ${mappings.map(m => m.code).join(', ')}`, { region });

        res.json({
            source: 'BUILT_IN',
            icd10: upperCode,
            mappings: mappings.map(m => ({
                icd11Code: m.code,
                title: m.title,
            })),
            fhir: {
                resourceType: 'ConceptMap',
                source: 'http://hl7.org/fhir/sid/icd-10',
                target: 'http://id.who.int/icd/release/11/2024-01/mms',
                group: [{
                    element: [{
                        code: upperCode,
                        target: mappings.map(m => ({ code: m.code, display: m.title, equivalence: 'equivalent' }))
                    }]
                }]
            }
        });
    } catch (error: any) {
        console.error('ICD crossmap error:', error);
        res.status(500).json({ error: 'ICD crossmap failed' });
    }
};

// ─── GET /terminology/icd11/categories ─────────────────────────────────────

export const getICD11Categories = async (_req: Request, res: Response) => {
    const categories = [...new Set(COMMON_ICD11_CODES.map(c => c.category))];
    const grouped = categories.map(cat => ({
        category: cat,
        count: COMMON_ICD11_CODES.filter(c => c.category === cat).length,
        codes: COMMON_ICD11_CODES.filter(c => c.category === cat).map(c => ({
            code: c.code,
            title: c.title,
            icd10Equivalent: c.icd10Equivalent,
        }))
    }));

    res.json({
        total: COMMON_ICD11_CODES.length,
        categories: grouped
    });
};
