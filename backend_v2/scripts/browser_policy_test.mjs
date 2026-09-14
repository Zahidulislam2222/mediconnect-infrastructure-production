import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const { getApiBrowserSettings } = require('./dist/shared/settings.js');

test('browser settings reject wildcard, credential, path and insecure remote origins; local clients require explicit configuration', () => {
  const original = process.env.ALLOWED_ORIGINS;
  try {
    for (const origin of ['*', 'null', 'https://*.example.invalid', 'http://app.example.invalid',
      'https://test-user:test-key@app.example.invalid', 'https://app.example.invalid/path',
      'https://app.example.invalid?test=value', 'https://app.example.invalid#fragment']) {
      process.env.ALLOWED_ORIGINS = origin;
      assert.throws(getApiBrowserSettings, undefined, origin);
    }
    process.env.ALLOWED_ORIGINS = original;
    assert.deepEqual(getApiBrowserSettings().origins, [original]);
    process.env.CORS_ADDITIONAL_ORIGINS_JSON = JSON.stringify(['capacitor://localhost', 'http://localhost:5173']);
    assert.deepEqual(getApiBrowserSettings().origins, [original, 'capacitor://localhost', 'http://localhost:5173']);
    process.env.CORS_CREDENTIALS = 'false';
    assert.equal(getApiBrowserSettings().credentials, false);
    process.env.HTTP_CSP_CONNECT_ORIGINS_JSON = JSON.stringify(['https://*.example.invalid']);
    assert.throws(getApiBrowserSettings);
  } finally {
    process.env.ALLOWED_ORIGINS = original;
    process.env.CORS_ADDITIONAL_ORIGINS_JSON = '[]';
    process.env.CORS_CREDENTIALS = 'true';
    process.env.HTTP_CSP_CONNECT_ORIGINS_JSON = '[]';
  }
});
