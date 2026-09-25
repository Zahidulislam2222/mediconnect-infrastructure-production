// S2 (memory/safe-followups-acceptance-20260925.md): booking-service refuses to start without its cancellation settings,
// instead of failing every check-in (claim TTL) or silently queueing every refund for manual review (page bound).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const { validateStartupSettings } = require('./dist/booking-service/src/index.js');

const withSetting = (name, value, run) => {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  try { run(); } finally { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }
};

test('startup settings validate with the documented example values', () => {
  assert.equal(typeof validateStartupSettings, 'function');
  validateStartupSettings();
});

for (const name of ['CANCELLATION_CLAIM_TTL_SECONDS', 'CANCELLATION_REFUND_MAX_PAGES']) {
  for (const [label, value] of [['missing', undefined], ['not a positive integer', '0'], ['not a number', 'many']]) {
    test(`startup is refused when ${name} is ${label}`, () => {
      assert.equal(typeof validateStartupSettings, 'function');
      withSetting(name, value, () => assert.throws(() => validateStartupSettings(), error => !(error instanceof TypeError)));
    });
  }
}
