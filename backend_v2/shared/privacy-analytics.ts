import { z } from 'zod';

const jobSchema = z.object({ status: z.object({ state: z.string(), errorResult: z.unknown().optional(), errors: z.array(z.unknown()).optional() }) });
export interface ErasureQuery {
  endpoint: string; projectId: string; location: string; jobId: string; token: string;
  query: string; hashedId: string; maxPolls: number; pollDelayMs: number; timeoutMs: number;
}

/** A submitted BigQuery job is not completion; reuse its durable ID and inspect DONE/errors. */
export async function completeErasureQuery(config: ErasureQuery, request: typeof fetch = fetch) {
  const base = `${config.endpoint}/projects/${encodeURIComponent(config.projectId)}/jobs`;
  const headers = { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' };
  const created = await request(base, {
    method: 'POST', headers, signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      jobReference: { projectId: config.projectId, jobId: config.jobId, location: config.location },
      configuration: { query: { query: config.query, useLegacySql: false, parameterMode: 'NAMED',
        queryParameters: [{ name: 'hashedId', parameterType: { type: 'STRING' }, parameterValue: { value: config.hashedId } }] } },
    }),
  });
  if (!created.ok && created.status !== 409) throw new Error('PRIVACY_ANALYTICS_SUBMISSION_FAILED');
  let candidate: unknown = created.ok ? await created.json() : null;
  for (let attempt = 0; attempt < config.maxPolls; attempt++) {
    if (candidate !== null) {
      const job = jobSchema.parse(candidate);
      if (job.status.errorResult || job.status.errors?.length) throw new Error('PRIVACY_ANALYTICS_JOB_FAILED');
      if (job.status.state === 'DONE') return;
    }
    const response = await request(`${base}/${encodeURIComponent(config.jobId)}?location=${encodeURIComponent(config.location)}`, {
      headers, signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) throw new Error('PRIVACY_ANALYTICS_STATUS_FAILED');
    candidate = await response.json();
    const job = jobSchema.parse(candidate);
    if (job.status.errorResult || job.status.errors?.length) throw new Error('PRIVACY_ANALYTICS_JOB_FAILED');
    if (job.status.state === 'DONE') return;
    if (attempt + 1 < config.maxPolls) await new Promise(resolve => setTimeout(resolve, config.pollDelayMs));
  }
  throw new Error('PRIVACY_ANALYTICS_PENDING');
}

interface QueryField { name: string; type?: string; mode?: string; fields?: QueryField[] }
function decodeRow(fields: QueryField[], row: any): Record<string, unknown> {
  if (!Array.isArray(row?.f) || row.f.length !== fields.length) throw new Error('PRIVACY_ANALYTICS_INVALID_ROW');
  const decode = (field: QueryField, value: any): unknown => {
    if (value === null) return null;
    if (field.mode === 'REPEATED') {
      if (!Array.isArray(value)) throw new Error('PRIVACY_ANALYTICS_INVALID_REPEATED_FIELD');
      return value.map(cell => decode({ ...field, mode: 'NULLABLE' }, cell.v));
    }
    return field.type === 'RECORD' || field.type === 'STRUCT' ? decodeRow(field.fields || [], value) : value;
  };
  return Object.fromEntries(fields.map((field, index) => [field.name, decode(field, row.f[index].v)]));
}

/** Exports require a finished job and every result page, including empty intermediate pages. */
export async function completeAnalyticsExport(config: ErasureQuery & { maxPages: number }, request: typeof fetch = fetch) {
  await completeErasureQuery(config, request);
  const rows: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  let fields: QueryField[] | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < config.maxPages; page++) {
    const query = new URLSearchParams({ location: config.location, ...(pageToken ? { pageToken } : {}) });
    const response = await request(`${config.endpoint}/projects/${encodeURIComponent(config.projectId)}/queries/${encodeURIComponent(config.jobId)}?${query}`, {
      headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) throw new Error('PRIVACY_ANALYTICS_RESULTS_UNAVAILABLE');
    const data = await response.json() as any;
    if (data.jobComplete !== true || data.errors?.length) throw new Error('PRIVACY_ANALYTICS_RESULTS_INCOMPLETE');
    fields = data.schema?.fields || fields;
    if (!Array.isArray(fields)) throw new Error('PRIVACY_ANALYTICS_SCHEMA_MISSING');
    rows.push(...(data.rows || []).map((row: any) => decodeRow(fields!, row)));
    pageToken = data.pageToken;
    if (!pageToken) return rows;
    if (seen.has(pageToken)) throw new Error('PRIVACY_ANALYTICS_RESULTS_STALLED');
    seen.add(pageToken);
  }
  throw new Error('PRIVACY_ANALYTICS_RESULTS_PAGE_LIMIT');
}
