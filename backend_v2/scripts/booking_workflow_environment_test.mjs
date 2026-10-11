// Both regions must supply the actual typed startup contract before any deployment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const settings = require('./dist/shared/settings.js');
const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const examples = Object.fromEntries(readFileSync(new URL('../.env.example', import.meta.url), 'utf8').split(/\r?\n/).filter(l => /^[A-Z][A-Z0-9_]*=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
for (const region of ['US', 'EU']) {
  test(`${region} workflow preflight binds enough regional settings for the real validator`, () => {
    const blocks = workflow.split(`name: Validate booking ${region} startup configuration`).slice(1).map(b => b.split('run:')[0]);
    assert.equal(blocks.length, 3);
    for (const block of blocks) {
    const runtimeEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:path|systemroot)$/i.test(key)));
    const env = { ...runtimeEnvironment, AWS_EC2_METADATA_DISABLED: 'true' };
    for (const [, key, variable] of block.matchAll(/^\s+([A-Z][A-Z0-9_]*): \$\{\{ vars\.([A-Z][A-Z0-9_]*) \}\}/gm)) {
      const prefix = variable.startsWith('STAGING_') ? 'STAGING_' : '';
      assert.equal(variable, `${prefix}BOOKING_${key}_${region}`);
      env[key] = key.startsWith('TABLE_') ? `test-${key.toLowerCase()}` : examples[key];
    }
    const result = spawnSync(process.execPath, ['scripts/verify_booking_startup_settings.mjs'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(Object.keys(env).filter(k => !Object.hasOwn(runtimeEnvironment, k) && k !== 'AWS_EC2_METADATA_DISABLED').sort(), [...settings.BOOKING_STARTUP_ENV_NAMES].sort());
    }
  });
  test(`${region} deployment binds every central startup key and preserves existing environment`, () => {
    const block = workflow.split(`name: "Deploy to Cloud Run (${region}`)[1]?.split('--platform managed')[0];
    assert.ok(block);
    for (const name of settings.BOOKING_STARTUP_ENV_NAMES ?? []) assert.ok(block.includes(name + ': '), name);
    assert.match(block, /verify_booking_startup_settings\.mjs --env-names/);
    assert.match(block, /\$\{!SETTING_NAME\}/);
    assert.match(block, /--update-env-vars/);
    assert.doesNotMatch(block, /--set-env-vars/);
  });
}

test('preserved Kubernetes booking templates render every startup setting in all four deployment paths', () => {
  const template = readFileSync(new URL('../k8s/booking-service.yaml', import.meta.url), 'utf8');
  const deployments = workflow.split(/name: "Deploy to (?:AKS|EKS) (?:Staging|Production)"/).slice(1).map(b => b.split('kubectl --kubeconfig')[0]);
  assert.equal(deployments.length, 4);
  for (const key of settings.BOOKING_STARTUP_ENV_NAMES) {
    assert.ok(template.includes('name: ' + key), key);
    assert.ok(template.includes('__' + key + '__'), key);
    for (const block of deployments) {
      assert.ok(block.includes(key + ': '), key);
      assert.ok(block.includes('s|__' + key + '__|'), key);
    }
  }
});
test('doctor regional deployment preserves the centralized pharmacy resource references', () => {
  const template = readFileSync(new URL('../k8s/doctor-service.yaml', import.meta.url), 'utf8');
  for (const key of ['TABLE_PRESCRIPTIONS', 'TABLE_TRANSACTIONS', 'TABLE_GRAPH']) {
    assert.ok(template.includes('name: ' + key), key);
    for (const region of ['US', 'EU']) {
      const block = workflow.split(`name: "Deploy to Cloud Run (${region}`)[1]?.split('--platform managed')[0];
      assert.ok(block.includes(key + ': '), key);
      assert.ok(block.includes('${' + key + '}'), key);
    }
  }
});

test('all four Kubernetes doctor paths reject each missing resource before rendering', () => {
  const blocks = workflow.split(/name: "Deploy to (?:AKS|EKS) (?:Staging|Production)"/).slice(1).map(b => b.split('run: |')[1].split('sed -e')[0]);
  assert.equal(blocks.length, 4);
  for (const block of blocks) {
    assert.ok(block.includes('if [ "${{ matrix.service }}" = "doctor-service" ]; then'));
    for (const key of ['TABLE_PRESCRIPTIONS', 'TABLE_TRANSACTIONS', 'TABLE_GRAPH']) {
      assert.ok(block.includes('${' + key + ':?'), key);
    }
  }
});
