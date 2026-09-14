import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const { QueryCommand, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { completePrivacyClient, eraseS3Versions, eraseSubjectDlqVersions, ErasureWorkflow } = require('./dist/shared/privacy-operations.js');
const { completeErasureQuery, completeAnalyticsExport } = require('./dist/shared/privacy-analytics.js');
const { obtainErasureRefund } = require('./dist/shared/privacy-refund.js');
const { createPortabilityBundle } = require('./dist/shared/fhir-portability.js');
const limits = { maxPages: 5, batchAttempts: 3, retryDelayMs: 1 };
const query = { endpoint: 'https://provider.example.invalid', projectId: 'test-project', location: 'EU', jobId: 'test-job', token: 'test-key', query: 'test-query', hashedId: 'test-subject', maxPolls: 2, pollDelayMs: 1, timeoutMs: 100 };

test('analytics export retains every page and never returns partial data after a later-page failure', async () => {
  let calls = 0;
  const request = async () => new Response(JSON.stringify(++calls === 1 ? { status: { state: 'DONE' } }
    : { jobComplete: true, schema: { fields: [{ name: 'test-field' }] }, rows: [{ f: [{ v: `test-${calls}` }] }], ...(calls === 2 ? { pageToken: 'test-next' } : {}) }));
  assert.deepEqual(await completeAnalyticsExport({ ...query, maxPages: 3 }, request), [{ 'test-field': 'test-2' }, { 'test-field': 'test-3' }]);
  calls = 0;
  await assert.rejects(completeAnalyticsExport({ ...query, maxPages: 3 }, async (...args) => calls === 2 ? new Response('', { status: 503 }) : request(...args)), /UNAVAILABLE/);
});

test('portability preserves records in valid Binary resources and excludes authentication material', () => {
  const bundle = createPortabilityBundle({ patient: { name: 'Synthetic person', refreshToken: 'test-token', clinical: { note: 'Synthetic note', password: 'test-password' } } });
  assert.equal(bundle.type, 'collection');
  const resource = bundle.entry[0].resource;
  assert.equal(resource.resourceType, 'Binary'); assert.equal(resource.contentType, 'application/json');
  const content = JSON.parse(Buffer.from(resource.data, 'base64').toString('utf8'));
  assert.deepEqual(content.records, { name: 'Synthetic person', clinical: { note: 'Synthetic note' } });
});

test('refund retry reconciles paginated provider history without creating another refund', async () => {
  let pages = 0;
  const refund = { id: 'test-refund', status: 'succeeded', metadata: { erasureRequestId: 'test-request', appointmentId: 'test-appointment' } };
  const stripe = { refunds: { list: async () => ++pages === 1 ? { data: [{ id: 'test-old' }], has_more: true } : { data: [refund], has_more: false }, create: async () => assert.fail('Replayed refund') } };
  assert.equal(await obtainErasureRefund(stripe, 'test-payment', 'test-appointment', 'test-request', 5), refund);
  assert.equal(pages, 2);
});
test('pending refunds never complete an erasure stage', async () => {
  const stripe = { refunds: { list: async () => ({ data: [], has_more: false }), create: async () => ({ status: 'pending' }) } };
  await assert.rejects(obtainErasureRefund(stripe, 'test-payment', 'test-appointment', 'test-request', 5), /RECONCILIATION/);
});

test('analytics submission is polled to completion and pending jobs never count as erased', async () => {
  let calls = 0;
  await completeErasureQuery(query, async () => new Response(JSON.stringify({ status: { state: ++calls === 1 ? 'RUNNING' : 'DONE' } })));
  assert.equal(calls, 2);
  await assert.rejects(completeErasureQuery(query, async () => new Response(JSON.stringify({ status: { state: 'RUNNING' } }))), /PENDING/);
});
test('analytics retry retrieves an existing job; failed job is never completion', async () => {
  let calls = 0;
  await completeErasureQuery(query, async () => ++calls === 1 ? new Response('', { status: 409 }) : new Response(JSON.stringify({ status: { state: 'DONE' } })));
  assert.equal(calls, 2);
  await assert.rejects(completeErasureQuery(query, async () => new Response(JSON.stringify({ status: { state: 'DONE', errorResult: { reason: 'test failure' } } }))), /FAILED/);
});

for (const Command of [QueryCommand, ScanCommand]) {
  test(`${Command.name} traverses empty filtered pages and stops only at the end`, async () => {
    const keys = [];
    const client = completePrivacyClient({ send: async command => {
      keys.push(command.input.ExclusiveStartKey);
      return keys.length === 1 ? { Items: [], LastEvaluatedKey: { id: 'test-page' } } : { Items: [{ id: 'test-result' }] };
    } }, limits);
    assert.deepEqual((await client.send(new Command({ TableName: 'test-table' }))).Items, [{ id: 'test-result' }]);
    assert.deepEqual(keys, [undefined, { id: 'test-page' }]);
  });
}
test('unprocessed writes are retried; exhausted requests throw', async () => {
  const batch = { 'test-table': [{ DeleteRequest: { Key: { id: 'test-row' } } }] };
  let count = 0;
  const client = completePrivacyClient({ send: async () => ++count < 3 ? { UnprocessedItems: batch } : {} }, limits);
  await client.send(new BatchWriteCommand({ RequestItems: batch }));
  assert.equal(count, 3);
  const unavailable = completePrivacyClient({ send: async () => ({ UnprocessedItems: batch }) }, limits);
  await assert.rejects(unavailable.send(new BatchWriteCommand({ RequestItems: batch })), /UNPROCESSED/);
});
test('S3 erasure follows version pages and removes delete-only objects', async () => {
  const removed = [];
  let pages = 0;
  await eraseS3Versions({ send: async command => {
    if (command.constructor.name === 'ListObjectVersionsCommand') return ++pages === 1
      ? { DeleteMarkers: [{ Key: 'test/a', VersionId: 'test-marker' }], IsTruncated: true, NextKeyMarker: 'test/a', NextVersionIdMarker: 'test-marker' }
      : { Versions: [{ Key: 'test/b', VersionId: 'test-version' }] };
    removed.push(...command.input.Delete.Objects); return {};
  } }, 'test-bucket', 'test/', limits);
  assert.equal(pages, 2); assert.equal(removed.length, 2);
});
test('DLQ erasure inspects historical versions and leaves other subjects untouched', async () => {
  const deleted = [];
  let pages = 0;
  const client = { send: async command => {
    if (command.constructor.name === 'ListObjectVersionsCommand') return ++pages === 1
      ? { Versions: [{ Key: 'failed/test.json', VersionId: 'test-old' }], IsTruncated: true, NextKeyMarker: 'failed/test.json', NextVersionIdMarker: 'test-old' }
      : { Versions: [{ Key: 'failed/test.json', VersionId: 'test-current' }] };
    if (command.constructor.name === 'GetObjectCommand') return { Body: { transformToString: async () => JSON.stringify({ rows: [{ patient_id: command.input.VersionId === 'test-old' ? 'test-subject' : 'test-other' }] }) } };
    assert.equal(pages, 2, 'All pages must be inspected before deleting');
    deleted.push(...command.input.Delete.Objects); return {};
  } };
  await eraseSubjectDlqVersions(client, 'test-bucket', 'failed/', ['test-subject'], limits);
  assert.deepEqual(deleted, [{ Key: 'failed/test.json', VersionId: 'test-old' }]);
});
test('mixed-subject DLQ batches require reconciliation and are never deleted wholesale', async () => {
  const client = { send: async command => {
    if (command.constructor.name === 'ListObjectVersionsCommand') return { Versions: [{ Key: 'failed/test.json', VersionId: 'test-old' }] };
    if (command.constructor.name === 'GetObjectCommand') return { Body: { transformToString: async () => JSON.stringify({ rows: [{ patient_id: 'test-subject' }, { patient_id: 'test-other' }] }) } };
    assert.fail('Mixed subject batch was deleted');
  } };
  await assert.rejects(eraseSubjectDlqVersions(client, 'test-bucket', 'failed/', ['test-subject'], limits), /MIXED_SUBJECT/);
});
test('S3 per-object error cannot be reported as erased', async () => {
  await assert.rejects(eraseS3Versions({ send: async command => command.constructor.name === 'ListObjectVersionsCommand'
    ? { Versions: [{ Key: 'test/a', VersionId: 'test-version' }] } : { Errors: [{ Code: 'AccessDenied' }] }
  }, 'test-bucket', 'test/', limits), /INCOMPLETE/);
});
test('failed stage remains retryable; a resumed workflow skips only persisted successes', async () => {
  let stored = { requestId: 'test-request', state: 'IN_PROGRESS', completed: [], requestedAt: '2026-09-09T00:00:00Z' };
  const persist = async value => { stored = JSON.parse(JSON.stringify(value)); };
  const first = new ErasureWorkflow(stored, persist);
  await first.stage('first', async () => {});
  await assert.rejects(first.stage('second', async () => { throw new Error('test outage'); }));
  assert.equal(stored.state, 'RETRY_REQUIRED'); assert.deepEqual(stored.completed, ['first']);
  const resumed = new ErasureWorkflow(stored, persist);
  await resumed.stage('first', async () => assert.fail('Successful stage replayed'));
  await resumed.stage('second', async () => {});
  assert.deepEqual(stored.completed, ['first', 'second']);
});
