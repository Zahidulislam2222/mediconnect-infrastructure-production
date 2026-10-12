import path from 'node:path';
import { federationProtocol as protocol } from './federation-protocol.mjs';

export const FEDERATION_ENVIRONMENT_NAMES = Object.freeze([
  'FEDERATION_IDENTITY_URL', 'FEDERATION_TOKEN_REFRESH_MS', 'FEDERATION_HTTP_TIMEOUT_MS',
  'FEDERATION_MAX_TOKEN_BYTES', 'FEDERATION_SHUTDOWN_TIMEOUT_MS',
]);

/** @typedef {{url:string, tokenFile:string, refreshMs:number, timeoutMs:number,
 * maximumBytes:number, shutdownMs:number}} FederationSettings */

/** One configuration boundary for the optional Cloud Run credential bootstrap.
 * @param {NodeJS.ProcessEnv} environment
 * @returns {Readonly<FederationSettings>|null}
 */
export function readFederationSettings(environment) {
  if (!environment.K_SERVICE) return null;
  /** @param {string} name */
  const text = name => {
    const value = environment[name];
    if (!value || value !== value.trim() || [...value].some(character =>
      character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) {
      throw new Error('Missing or invalid federation setting: ' + name);
    }
    return value;
  };
  /** @param {string} name */
  const positive = name => {
    const raw = text(name), value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
      throw new Error('Invalid federation limit: ' + name);
    }
    return value;
  };
  const raw = text('FEDERATION_IDENTITY_URL'), url = new URL(raw);
  if (url.username || url.password || raw.includes('@') || /[\\#]/.test(raw) ||
      url.hash || url.hostname !== protocol.metadataHost || url.port ||
      url.protocol !== 'http:' || !url.searchParams.get('audience')) {
    throw new Error('Invalid Google metadata identity endpoint');
  }
  const tokenFile = text('AWS_WEB_IDENTITY_TOKEN_FILE');
  if (!path.isAbsolute(tokenFile) || path.normalize(tokenFile) !== tokenFile) {
    throw new Error('Federation token file requires a normalized absolute path');
  }
  const refreshMs = positive('FEDERATION_TOKEN_REFRESH_MS');
  const timeoutMs = positive('FEDERATION_HTTP_TIMEOUT_MS');
  const shutdownMs = positive('FEDERATION_SHUTDOWN_TIMEOUT_MS');
  if ([refreshMs, timeoutMs, shutdownMs].some(value => value > protocol.maximumTimerMs) ||
      refreshMs <= timeoutMs) throw new Error('Invalid federation timer relationship');
  return Object.freeze({ url: url.href, tokenFile, refreshMs, timeoutMs, shutdownMs,
    maximumBytes: positive('FEDERATION_MAX_TOKEN_BYTES') });
}
