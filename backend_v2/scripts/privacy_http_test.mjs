import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const express = require('express');
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const { GoogleAuth } = require('google-auth-library');
const { deleteProfile, reviewErasure, exportPatientData } = require('./dist/patient-service/src/controllers/patient.controller.js');

async function scenario(run, { approved = false, analyticsAvailable = false, identity = { id: 'test-patient', region: 'EU' } } = {}) {
  process.env.PRIVACY_EXECUTION_ENABLED = approved ? 'true' : 'false';
  const requestId = '00000000-0000-4000-8000-000000000001';
  let row = { patientId: 'test-patient', name: 'Synthetic Person', isIdentityVerified: true,
    ...(approved ? { erasure: { requestId, requestedAt: new Date().toISOString(), completed: [], state: 'REVIEW_REQUIRED' },
      erasureApproval: { requestId, decision: 'APPROVED', policyVersion: process.env.PRIVACY_POLICY_VERSION, retainedCategories: ['medical', 'financial', 'audit', 'consent'] } } : {}) };
  const commands = [];
  mock.method(aws, 'getRegionalClient', region => {
    assert.equal(region, 'EU');
    return { send: async command => {
      commands.push(command);
      if (command.constructor.name === 'GetCommand') return { Item: structuredClone(row) };
      if (command.input.ExpressionAttributeValues?.[':progress']) row.erasure = structuredClone(command.input.ExpressionAttributeValues[':progress']);
      if (command.input.ExpressionAttributeValues?.[':approval']) row.erasureApproval = structuredClone(command.input.ExpressionAttributeValues[':approval']);
      return { Items: [] };
    } };
  });
  mock.method(aws, 'getSSMParameter', async () => undefined);
  mock.method(GoogleAuth.prototype, 'getClient', async () => {
    if (!analyticsAvailable) throw new Error('test analytics unavailable');
    return { getAccessToken: async () => ({ token: 'test-key' }) };
  });
  mock.method(GoogleAuth.prototype, 'getProjectId', async () => 'test-project');
  const realFetch = globalThis.fetch;
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return realFetch(url, options);
    assert.equal(analyticsAvailable, true);
    assert.ok(String(url).startsWith(process.env.PRIVACY_BQ_ENDPOINT));
    return new Response(JSON.stringify({ status: { state: 'DONE' } }));
  });
  mock.method(aws, 'getRegionalS3Client', region => {
    assert.equal(analyticsAvailable, true); assert.equal(region, 'EU');
    return { send: async command => {
      assert.equal(command.constructor.name, 'ListObjectVersionsCommand');
      return { Versions: [], DeleteMarkers: [] };
    } };
  });
  mock.method(audit, 'writeAuditLog', async () => {});
  const forbidden = () => { throw new Error('Final identity/notification provider must not be reached'); };
  const cognito = mock.method(aws, 'getRegionalCognitoClient', analyticsAvailable ? () => ({ send: async () => ({}) }) : forbidden);
  const ses = mock.method(aws, 'getRegionalSESClient', forbidden);
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = identity; next(); });
  app.delete('/me', deleteProfile);
  app.get('/me/export', exportPatientData);
  app.post('/privacy/erasure/:patientId/review', reviewErasure);
  app.use((error, _req, res, _next) => res.status(500).json({ error: 'test controlled error' }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run({ base: `http://127.0.0.1:${server.address().port}`, commands, row: () => row, cognito, ses }); }
  finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
}

test('HTTP erasure records review request with no premature deletion or TTL; repeat keeps request ID', async () => {
  await scenario(async h => {
    const first = await fetch(`${h.base}/me`, { method: 'DELETE' });
    assert.equal(first.status, 202); const result = await first.json();
    assert.equal(result.status, 'REVIEW_REQUIRED');
    assert.equal(h.row().name, 'Synthetic Person');
    const second = await fetch(`${h.base}/me`, { method: 'DELETE' });
    assert.equal((await second.json()).requestId, result.requestId);
    assert.equal(h.cognito.mock.callCount(), 0); assert.equal(h.ses.mock.callCount(), 0);
    assert.ok(h.commands.filter(command => command.constructor.name === 'UpdateCommand').every(command => !command.input.UpdateExpression.includes('SET #s')));
  });
});

test('HTTP approved erasure completes every stage before identity removal; repeat never replays deletion', async () => {
  await scenario(async h => {
    const response = await fetch(`${h.base}/me`, { method: 'DELETE' });
    assert.equal(response.status, 200); assert.equal((await response.json()).status, 'ERASED_WITH_RETENTION');
    assert.equal(h.row().erasure.state, 'COMPLETED');
    assert.equal(h.row().erasure.completed.length, 35);
    assert.deepEqual(h.row().erasure.completed.slice(-3), ['completion-audit', 'identity', 'profile']);
    assert.equal(h.cognito.mock.callCount(), 1); assert.equal(h.ses.mock.callCount(), 0);
    const retry = await fetch(`${h.base}/me`, { method: 'DELETE' }); assert.equal(retry.status, 200);
    assert.equal(h.cognito.mock.callCount(), 1);
  }, { approved: true, analyticsAvailable: true });
});
test('HTTP partial failure persists the failed stage and never claims deletion; retry skips successful stage', async () => {
  await scenario(async h => {
    const first = await fetch(`${h.base}/me`, { method: 'DELETE' });
    assert.equal(first.status, 503); assert.equal((await first.json()).status, 'RETRY_REQUIRED');
    assert.equal(h.row().erasure.failedStage, 'analytics'); assert.deepEqual(h.row().erasure.completed, ['appointments']);
    const previousReads = h.commands.filter(command => command.constructor.name === 'QueryCommand').length;
    const retry = await fetch(`${h.base}/me`, { method: 'DELETE' }); assert.equal(retry.status, 503);
    assert.equal(h.commands.filter(command => command.constructor.name === 'QueryCommand').length, previousReads);
    assert.equal(h.row().name, 'Synthetic Person'); assert.equal(h.cognito.mock.callCount(), 0); assert.equal(h.ses.mock.callCount(), 0);
  }, { approved: true });
});
test('ordinary patient cannot approve another subject erasure', async () => {
  await scenario(async h => {
    const response = await fetch(`${h.base}/privacy/erasure/test-other/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'APPROVED', policyVersion: process.env.PRIVACY_POLICY_VERSION, reasonCode: 'TEST_REVIEW', retainedCategories: [] }) });
    assert.equal(response.status, 403); assert.equal(h.commands.length, 0);
  });
});

test('HTTP export fails explicitly when a required source is unavailable, without a false encryption claim', async () => {
  await scenario(async h => {
    const response = await fetch(`${h.base}/me/export`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'DATA_EXPORT_INCOMPLETE');
    assert.equal(response.headers.get('X-Export-Encryption'), null);
  });
});
