import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { federationProtocol as protocol } from './federation-protocol.mjs';

/** Refresh a complete bounded token without truncating the last good credential.
 * @param {import('./federation-settings.mjs').FederationSettings} settings
 * @param {AbortSignal} signal
 * @param {typeof fetch} [transport]
 */
export async function refreshFederationToken(settings, signal, transport = fetch) {
  const response = await transport(settings.url, {
    headers: { [protocol.metadataHeader]: protocol.metadataFlavor }, redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(settings.timeoutMs)]),
  });
  if (!response.ok || response.headers.get(protocol.metadataHeader) !== protocol.metadataFlavor || !response.body) {
    await response.body?.cancel();
    throw new Error('Federation identity response rejected');
  }
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > settings.maximumBytes) throw new Error('Federation token exceeds configured limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks), token = body.toString('ascii');
  if (body.some(byte => byte > 127) || !protocol.tokenPattern.test(token)) {
    throw new Error('Invalid federation token encoding');
  }
  signal.throwIfAborted();
  const temporary = settings.tokenFile + '.' + randomUUID() + '.tmp';
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(body); await handle.sync(); } finally { await handle.close(); }
    signal.throwIfAborted();
    await fs.rename(temporary, settings.tokenFile);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
