import { randomUUID } from 'crypto';

/** Authentication material is not included in a personal-record export. */
export function scrubExportCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubExportCredentials);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|secret|token|credential|privatekey/i.test(key)).map(([key, entry]) => [key, scrubExportCredentials(entry)]));
}

/** Raw application records are valid Binary payloads, not pretend clinical FHIR resources. */
export function createPortabilityBundle(collections: Record<string, unknown>) {
  const entry = Object.entries(collections).map(([collection, records]) => {
    const id = randomUUID();
    return { fullUrl: `urn:uuid:${id}`, resource: { resourceType: 'Binary', id,
      contentType: 'application/json', data: Buffer.from(JSON.stringify({ collection, records: scrubExportCredentials(records) }), 'utf8').toString('base64') } };
  });
  return { resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(), entry };
}
