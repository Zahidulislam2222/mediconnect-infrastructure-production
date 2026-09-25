// E1-E3 (memory/erasure-receipts-acceptance-20260925.md): approved erasure must remove every receipt PDF that
// booking-service writes for the subject, including cancellation/on-demand receipts keyed by paymentId or appointmentId.
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
const { deleteProfile } = require('./dist/patient-service/src/controllers/patient.controller.js');

const PAST = '2020-01-01T10:00:00.000Z';
const APPOINTMENTS = [
  { appointmentId: 'test-apt-paid', patientId: 'test-patient', paymentId: 'pi_test_paid', status: 'CANCELLED', timeSlot: PAST, resource: {} },
  { appointmentId: 'test-apt-unpaid', patientId: 'test-patient', status: 'CANCELLED', timeSlot: PAST, resource: {} },
  { appointmentId: 'test-apt-legacy', patientId: 'test-patient', paymentId: 'TEST_MODE', status: 'COMPLETED', timeSlot: PAST, resource: {} },
];
const TRANSACTIONS = [{ billId: 'test-bill-1', patientId: 'test-patient' }];

async function approvedErasure({ failS3Key } = {}) {
  process.env.PRIVACY_EXECUTION_ENABLED = 'true';
  const requestId = '00000000-0000-4000-8000-000000000002';
  const row = { patientId: 'test-patient', name: 'Synthetic Person', isIdentityVerified: true,
    erasure: { requestId, requestedAt: new Date().toISOString(), completed: [], state: 'REVIEW_REQUIRED' },
    erasureApproval: { requestId, decision: 'APPROVED', policyVersion: process.env.PRIVACY_POLICY_VERSION, retainedCategories: ['medical', 'financial', 'audit', 'consent'] } };
  const deleted = []; const listedBuckets = new Set();
  mock.method(aws, 'getRegionalClient', () => ({ send: async command => {
    if (command.constructor.name === 'GetCommand') return { Item: structuredClone(row) };
    if (command.input.ExpressionAttributeValues?.[':progress']) row.erasure = structuredClone(command.input.ExpressionAttributeValues[':progress']);
    const table = command.input.TableName;
    if (command.constructor.name === 'QueryCommand' && table === process.env.TABLE_APPOINTMENTS) return { Items: structuredClone(APPOINTMENTS) };
    if (command.constructor.name === 'ScanCommand' && table === process.env.TABLE_TRANSACTIONS) return { Items: structuredClone(TRANSACTIONS) };
    return { Items: [] };
  } }));
  mock.method(aws, 'getSSMParameter', async () => undefined);
  mock.method(GoogleAuth.prototype, 'getClient', async () => ({ getAccessToken: async () => ({ token: 'test-key' }) }));
  mock.method(GoogleAuth.prototype, 'getProjectId', async () => 'test-project');
  const realFetch = globalThis.fetch;
  mock.method(globalThis, 'fetch', async (url, options) => String(url).startsWith('http://127.0.0.1:')
    ? realFetch(url, options) : new Response(JSON.stringify({ status: { state: 'DONE' } })));
  mock.method(aws, 'getRegionalS3Client', () => ({ send: async command => {
    const { Bucket, Prefix } = command.input;
    if (command.constructor.name === 'ListObjectVersionsCommand') {
      listedBuckets.add(`${Bucket}|${Prefix}`);
      if (Prefix === failS3Key) throw new Error('test storage unavailable');
      // Every exact receipt key has one version and one delete marker; a neighbouring key must never be removed.
      return Prefix.startsWith('receipts/')
        ? { Versions: [{ Key: Prefix, VersionId: 'v1' }, { Key: `${Prefix}.neighbour`, VersionId: 'v9' }], DeleteMarkers: [{ Key: Prefix, VersionId: 'm1' }] }
        : { Versions: [], DeleteMarkers: [] };
    }
    if (command.constructor.name === 'DeleteObjectsCommand') { for (const item of command.input.Delete.Objects) deleted.push(`${Bucket}|${item.Key}|${item.VersionId}`); return { Deleted: command.input.Delete.Objects }; }
    return {};
  } }));
  mock.method(audit, 'writeAuditLog', async () => {});
  mock.method(aws, 'getRegionalCognitoClient', () => ({ send: async () => ({}) }));
  mock.method(aws, 'getRegionalSESClient', () => { throw new Error('notification provider must not be reached'); });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'test-patient', region: 'EU' }; next(); });
  app.delete('/me', deleteProfile);
  app.use((_error, _req, res, _next) => res.status(500).json({ error: 'test controlled error' }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/me`, { method: 'DELETE' });
    return { status: response.status, body: await response.json(), deleted, listedBuckets, row };
  } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
}

const bucket = () => process.env.S3_BUCKET_UPLOADS_EU;
const allVersions = key => [`${bucket()}|${key}|v1`, `${bucket()}|${key}|m1`];

test('approved erasure deletes every version of ledger, payment and appointment receipts in the EU receipt bucket', async () => {
  const result = await approvedErasure();
  assert.equal(result.status, 200);
  assert.equal(result.row.erasure.completed.length, 35);
  for (const key of ['receipts/test-bill-1.pdf', 'receipts/pi_test_paid.pdf', 'receipts/test-apt-paid.pdf',
    'receipts/test-apt-unpaid.pdf', 'receipts/test-apt-legacy.pdf']) {
    for (const version of allVersions(key)) assert.ok(result.deleted.includes(version), `missing deletion ${version}`);
  }
  assert.ok(result.deleted.every(item => !item.includes('.neighbour')), 'a neighbouring object was deleted');
});

test('a shared legacy TEST_MODE receipt key is never deleted as if the subject owned it', async () => {
  const result = await approvedErasure();
  assert.ok(result.deleted.every(item => !item.includes('receipts/TEST_MODE.pdf')));
});

test('a receipt storage failure fails the transactions stage closed and never reaches identity removal', async () => {
  const result = await approvedErasure({ failS3Key: 'receipts/pi_test_paid.pdf' });
  assert.equal(result.status, 503);
  assert.equal(result.row.erasure.failedStage, 'transactions');
  assert.ok(!result.row.erasure.completed.includes('identity'));
});
