import { setting } from './settings';

export type Jurisdiction = 'US' | 'EU';

/** Auth middleware owns user.region; a caller-controlled header alone is insufficient. */
export function requestJurisdiction(request: {
  user?: { region?: unknown };
  headers: Record<string, unknown>;
}): Jurisdiction {
  const jurisdiction = resolveAuthRegion(request.user?.region);
  const header = request.headers['x-user-region'];
  if (header !== undefined && resolveAuthRegion(header) !== jurisdiction) {
    throw new Error('REGIONAL_CONTEXT_MISMATCH');
  }
  return jurisdiction;
}

/** Selects a verifier; identity is established only after its pool signature check succeeds. */
export function resolveAuthRegion(value: unknown): Jurisdiction {
  if (typeof value !== 'string' || !value.trim()) throw new Error('INVALID_AUTH_REGION');
  const normalized = value.trim().toUpperCase();
  if (normalized === 'US' || normalized === setting('PRIVACY_US_REGION').toUpperCase()) return 'US';
  if (normalized === 'EU' || normalized === setting('PRIVACY_EU_REGION').toUpperCase()) return 'EU';
  throw new Error('INVALID_AUTH_REGION');
}
