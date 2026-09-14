import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.PRIVACY_BQ_ENDPOINT = 'https://analytics.example.test/v2';
process.env.PRIVACY_BQ_IOT_US = 'test_us'; process.env.PRIVACY_BQ_IOT_EU = 'test_eu';
process.env.IOT_ANALYTICS_TABLE = 'test_vitals';
process.env.HIPAA_SALT = 'test-key';
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const { GoogleAuth } = require('google-auth-library');
const { pushVitalToBigQuery, recordVitalAnalytics } = require('./dist/patient-service/src/modules/iot/vitals.js');
const audit = require('./dist/shared/audit.js');
const timestamp = '2026-01-01T00:00:00Z';

for (const region of ['US', 'EU']) {
  test(`${region}: analytics rejects provider/row errors and preserves configured region and real measurements`, async () => {
    let mode = 'row-error', calls = 0;
    let auditFails = false;
    const auditCall = mock.method(audit, 'writeAuditLog', async (actor, subject, action, details, metadata) => {
      assert.equal(actor, 'SYSTEM'); assert.equal(subject, 'test-patient');
      assert.equal(action, 'IOT_ANALYTICS_UNCONFIRMED'); assert.equal(metadata.region, region);
      assert.equal(metadata.requirePersistence, true); assert.equal(details.includes('test-key'), false);
      if (auditFails) throw new Error('synthetic private audit error');
    });
    const auth = mock.method(GoogleAuth.prototype, 'getClient', async () => ({ getAccessToken: async () => ({ token: 'test-key' }) }));
    mock.method(GoogleAuth.prototype, 'getProjectId', async () => 'test-project');
    mock.method(globalThis, 'fetch', async (url, options) => {
      calls++;
      if (mode === 'row-error') return new Response(JSON.stringify({ insertErrors: [{ index: 0, errors: [{ message: 'synthetic private provider detail' }] }] }));
      assert.equal(String(url), `https://analytics.example.test/v2/projects/test-project/datasets/test_${region.toLowerCase()}/tables/test_vitals/insertAll`);
      assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
      const row = JSON.parse(JSON.parse(options.body).rows[0].json.data);
      assert.equal(row.timestamp, timestamp); assert.equal(row.heartRate, 0); assert.equal(row.temperature, 0);
      assert.equal(row.region, region); assert.match(row.patientId, /^[a-f0-9]{64}$/);
      for (const field of ['accessToken', 'metadata', 'status', 'oxygenSaturation']) assert.equal(field in row, false);
      assert.equal(options.body.includes('test-patient'), false);
      if (mode === 'http-error') return new Response('synthetic private provider detail', { status: 503 });
      if (mode === 'malformed') return new Response('not json');
      if (mode === 'invalid-schema') return new Response('[]');
      if (mode === 'network') throw new Error('synthetic private provider detail');
      return new Response(JSON.stringify({ kind: 'bigquery#tableDataInsertAllResponse' }));
    });
    const data = { timestamp, heartRate: 0, temperature: 0, oxygenSaturation: '98', accessToken: 'test-key', metadata: { secret: 'test-key' } };
    try {
      await assert.rejects(pushVitalToBigQuery('test-patient', data, region), /IOT_ANALYTICS/);
      for (mode of ['http-error', 'malformed', 'invalid-schema', 'network']) {
        await assert.rejects(pushVitalToBigQuery('test-patient', data, region), error => error.message.startsWith('IOT_ANALYTICS') && !error.message.includes('private provider'));
      }
      mode = 'success'; await pushVitalToBigQuery('test-patient', data, region);
      await recordVitalAnalytics('test-patient', data, region); assert.equal(auditCall.mock.callCount(), 0);
      mode = 'row-error'; await assert.rejects(recordVitalAnalytics('test-patient', data, region), /IOT_ANALYTICS/);
      assert.equal(auditCall.mock.callCount(), 1);
      auditFails = true; await assert.rejects(recordVitalAnalytics('test-patient', data, region), /IOT_ANALYTICS/);
      const before = calls, authBefore = auth.mock.callCount();
      await assert.rejects(pushVitalToBigQuery('test-patient', data, 'not-eu'));
      await assert.rejects(pushVitalToBigQuery('test-patient', { heartRate: 80 }, region));
      await assert.rejects(pushVitalToBigQuery('invalid/id', data, region));
      for (const endpoint of ['http://analytics.example.test', 'https://test-key@analytics.example.test', 'https://analytics.example.test?key=test-key']) {
        process.env.PRIVACY_BQ_ENDPOINT = endpoint;
        await assert.rejects(pushVitalToBigQuery('test-patient', data, region));
      }
      assert.equal(calls, before); assert.equal(auth.mock.callCount(), authBefore);
    } finally { process.env.PRIVACY_BQ_ENDPOINT = 'https://analytics.example.test/v2'; mock.restoreAll(); }
  });
}
