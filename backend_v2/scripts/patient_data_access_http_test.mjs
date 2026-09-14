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
process.env.TABLE_GRAPH = 'test-graph';
process.env.DYNAMO_TABLE = 'test-patients';
process.env.DYNAMO_TABLE_VITALS = 'test-vitals';
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const express = require('express');
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const { getVitals } = require('./dist/patient-service/src/modules/iot/vitals.js');
const blueButton = require('./dist/patient-service/src/modules/clinical/blue-button.controller.js');

test('Blue Button reads, status and disconnect deny non-owners before any database or token access', async () => {
  const access = mock.method(aws, 'getRegionalClient', () => { throw new Error('Unauthorized database access'); });
  let user = { id: 'test-other-patient', region: 'EU' };
  const app = express(); app.use((req, _res, next) => { req.user = user; next(); });
  const actions = ['getBlueButtonPatient', 'getBlueButtonEOB', 'getBlueButtonCoverage', 'getBlueButtonStatus', 'disconnectBlueButton'];
  for (const action of actions) app.get(`/${action}/:patientId`, blueButton[action]);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    for (user of [{ id: 'test-other-patient', region: 'EU' }, { id: 'test-doctor', region: 'EU', isDoctor: true }, { id: 'test-admin', region: 'EU', isAdmin: true }]) {
      for (const action of actions) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/${action}/test-patient`);
        assert.equal(response.status, 403, action);
      }
    }
    assert.equal(access.mock.callCount(), 0);
  } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
});

test('Vitals enforce patient relationship, record state, real measurements, bounded limits and persisted read audit', async () => {
  let user = { id: 'test-other-patient', region: 'EU' };
  let linked = false, erasureState = undefined, auditFails = false;
  let rows = [{ timestamp: '2026-01-01T00:00:00Z' }];
  let vitalsQueries = 0;
  mock.method(aws, 'getRegionalClient', region => {
    assert.equal(region, 'EU');
    return { send: async command => {
      if (command.input.TableName === process.env.DYNAMO_TABLE_DOCTORS) return { Item: { verificationStatus: 'APPROVED' } };
      if (command.constructor.name === 'QueryCommand') { vitalsQueries++; return { Items: rows }; }
      if (command.input.TableName === process.env.TABLE_GRAPH) {
        assert.deepEqual(command.input.Key, { PK: 'PATIENT#test-patient', SK: `DOCTOR#${user.id}` });
        return { Item: linked ? { relationship: 'isTreatedBy' } : undefined };
      }
      return { Item: { isIdentityVerified: true, erasure: { state: erasureState } } };
    } };
  });
  mock.method(audit, 'writeAuditLog', async (_actor, _subject, _action, _details, metadata) => {
    assert.equal(metadata.requirePersistence, true);
    if (auditFails) throw new Error('test audit failure');
  });
  const app = express(); app.use((req, _res, next) => { req.user = user; next(); });
  app.get('/vitals', getVitals);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const request = (limit = '1') => fetch(`http://127.0.0.1:${server.address().port}/vitals?patientId=test-patient&limit=${limit}`, { headers: { 'x-user-region': 'EU' } });
  try {
    assert.equal((await request()).status, 403); assert.equal(vitalsQueries, 0);
    user = { id: 'test-doctor', region: 'EU', isDoctor: true };
    assert.equal((await request()).status, 403); assert.equal(vitalsQueries, 0);
    linked = true;
    const missing = await request(); assert.equal(missing.status, 200);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    const missingBody = await missing.json(); assert.equal(missingBody.fhirBundle.total, 0); assert.deepEqual(missingBody.fhirBundle.entry, []);
    rows = [{ timestamp: '2026-01-01T00:00:00Z', heartRate: 0, temperature: 36.5 }, { heartRate: 'bad' }];
    const present = await request(); assert.equal(present.status, 200);
    const { fhirBundle } = await present.json();
    assert.equal(fhirBundle.total, 2); assert.equal(fhirBundle.entry[0].resource.valueQuantity.value, 0, 'An actual recorded zero is retained');
    for (const entry of fhirBundle.entry) assert.match(entry.fullUrl, /^urn:uuid:[0-9a-f-]{36}$/);
    user = { id: 'test-patient', region: 'EU' };
    assert.equal((await request()).status, 200);
    for (erasureState of ['IN_PROGRESS', 'RETRY_REQUIRED', 'COMPLETED']) assert.equal((await request()).status, 403);
    erasureState = undefined;
    for (const limit of ['-1', '0', 'NaN', '1.5', '999999']) assert.equal((await request(limit)).status, 400);
    auditFails = true;
    const unavailable = await request(); assert.equal(unavailable.status, 503);
    assert.equal(JSON.stringify(await unavailable.json()).includes('36.5'), false);
  } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
});
