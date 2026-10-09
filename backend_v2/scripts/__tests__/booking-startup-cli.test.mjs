import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../verify_booking_startup_settings.mjs', import.meta.url));
const valid = {
  TABLE_PATIENTS: 'test-patients',
  TABLE_TRANSACTIONS: 'test-transactions',
  CANCELLATION_CLAIM_TTL_SECONDS: '137',
  CANCELLATION_REFUND_MAX_PAGES: '7',
};
const run = overrides => spawnSync(process.execPath, [cli], {
  env: { ...process.env, ...valid, ...overrides }, encoding: 'utf8',
});

test('preflight accepts configured resources without printing their values', () => {
  const result = run({});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verified/i);
  for (const value of ['test-patients', 'test-transactions']) assert.ok(!result.stdout.includes(value));
});

test('preflight fails closed when a required resource is absent', () => {
  const result = run({ TABLE_PATIENTS: '' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid booking startup configuration/i);
  assert.ok(!result.stderr.includes('test-transactions'));
});

test('preflight refuses malformed resources and policy bounds without reflecting values', () => {
  for (const overrides of [{ TABLE_TRANSACTIONS: 'test/table' }, { CANCELLATION_REFUND_MAX_PAGES: '0' }]) {
    const result = run(overrides);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid booking startup configuration/i);
    assert.ok(!result.stderr.includes('test/table'));
  }
});

test('preflight rejects whitespace, reserved markers and invalid table lengths before rendering', () => {
  for (const name of Object.keys(valid)) {
    for (const value of [` ${valid[name]}`, `${valid[name]}\n`, '__TABLE_TRANSACTIONS__']) {
      const result = run({ [name]: value });
      assert.equal(result.status, 1, `${name}: unsafe rendering value passed`);
    }
  }
  for (const value of ['a', 'a'.repeat(256)]) {
    assert.equal(run({ TABLE_PATIENTS: value }).status, 1);
  }
});

test('preflight accepts DynamoDB table-name length boundaries', () => {
  for (const value of ['abc', 'a'.repeat(255)]) {
    assert.equal(run({ TABLE_PATIENTS: value }).status, 0);
  }
});
