import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = /^(TABLE_|DYNAMO_TABLE)/.test(match[1])
    ? `test-${match[1].toLowerCase().replaceAll('_', '-')}` : match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.COGNITO_USER_POOL_ID_US = 'us-east-1_test';
process.env.COGNITO_USER_POOL_ID_EU = 'eu-central-1_test';
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const express = require('express');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const routes = [
  ['GET', '/patients/test-patient/allergies'], ['POST', '/patients/test-patient/allergies'],
  ['PUT', '/patients/test-patient/allergies/test-allergy'], ['DELETE', '/patients/test-patient/allergies/test-allergy'],
  ['GET', '/patients/test-patient/cda'], ['POST', '/immunizations'],
  ['GET', '/immunizations/test-patient'], ['PUT', '/immunizations/test-patient/test-immunization'],
  ['POST', '/sdoh/assessments'], ['GET', '/sdoh/assessments/test-patient'],
  ['GET', '/sdoh/observations/test-patient'], ['GET', '/mpi/links/test-patient'],
  ['GET', '/fhir/launch/test-patient'], ['POST', '/fhir/launch-context'], ['POST', '/public-health/ecr'],
];

for (const region of ['US', 'EU']) {
  test(`${region}: actual clinical router protects all 15 selected patient routes`, async () => {
    let identity = { sub: 'test-doctor', 'cognito:groups': ['doctor'] }, linked = false, approved = true, erasureState, auditFails = false;
    let clinicalCalls = 0, accessCalls = 0, writes = 0, auditCalls = 0;
    let profileMissing = false, identityVerified = true, accessFails = false;
    mock.method(CognitoJwtVerifier, 'create', config => ({ verify: async token => {
      assert.equal(config.userPoolId, process.env[`COGNITO_USER_POOL_ID_${region}`]);
      if (token !== `test-${region}-token`) throw new Error('Test wrong regional token');
      return identity;
    } }));
    mock.method(aws, 'getRegionalClient', selected => {
      assert.equal(selected, region);
      return { send: async command => {
        const input = command.input;
        if ([process.env.DYNAMO_TABLE_DOCTORS, process.env.TABLE_GRAPH, process.env.DYNAMO_TABLE].includes(input.TableName)) {
          accessCalls++;
          if (accessFails) throw new Error('Test access store unavailable');
        }
        if (input.TableName === process.env.DYNAMO_TABLE_DOCTORS) return { Item: { verificationStatus: approved ? 'APPROVED' : 'REVOKED' } };
        if (input.TableName === process.env.TABLE_GRAPH) return { Item: linked ? { relationship: 'isTreatedBy' } : undefined };
        if (input.TableName === process.env.DYNAMO_TABLE) return { Item: profileMissing ? undefined : { patientId: 'test-patient', name: 'Test Patient', isIdentityVerified: identityVerified, erasure: { state: erasureState } } };
        clinicalCalls++;
        if (input.TableName === process.env.TABLE_ALLERGIES && command.constructor.name === 'GetCommand') {
          assert.deepEqual(input.Key, { patientId: 'test-patient', allergyId: 'test-allergy' });
          return { Item: { ...input.Key, substance: 'Synthetic test allergen' } };
        }
        if (input.TableName === process.env.TABLE_ALLERGIES && command.constructor.name === 'DeleteCommand') {
          assert.deepEqual(input.Key, { patientId: 'test-patient', allergyId: 'test-allergy' });
          writes++; return {};
        }
        assert.ok([process.env.TABLE_ALLERGIES, process.env.TABLE_IMMUNIZATIONS, process.env.TABLE_SDOH,
          process.env.TABLE_MPI, process.env.TABLE_EHR, process.env.TABLE_PRESCRIPTIONS, process.env.DYNAMO_TABLE_VITALS].includes(input.TableName), 'No unexpected clinical/provider work');
        assert.equal(command.constructor.name, input.TableName === process.env.TABLE_MPI ? 'ScanCommand' : 'QueryCommand');
        assert.equal(input.ExpressionAttributeValues[':pid'], 'test-patient');
        return { Items: [] };
      } };
    });
    mock.method(audit, 'writeAuditLog', async (_actor, _subject, action, _details, metadata) => {
      if (action === 'CLINICAL_ACCESS_AUTHORIZED') {
        auditCalls++;
        assert.equal(_subject, 'test-patient');
        assert.equal(metadata.requirePersistence, true); if (auditFails) throw new Error('Test audit unavailable');
      }
    });
    const realFetch = globalThis.fetch;
    mock.method(globalThis, 'fetch', (url, options) => {
      assert.ok(String(url).startsWith('http://127.0.0.1:'), 'Provider fetch forbidden'); return realFetch(url, options);
    });
    const router = require('./dist/patient-service/src/routes/patient.routes.js').default;
    const app = express(); app.use(express.json()); app.use(router);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const request = (method, path, token = `test-${region}-token`, body = { patientId: 'test-patient' }) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-user-region': region, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(['POST', 'PUT'].includes(method) ? { body: JSON.stringify(body) } : {}),
    });
    try {
      for (const actor of [identity, { sub: 'test-other', 'cognito:groups': ['patient'] }, { sub: 'test-admin', 'cognito:groups': ['admin'] }]) {
        identity = actor;
        for (const [method, path] of routes) {
          const response = await request(method, path); assert.equal(response.status, 403, `${method} ${path}`);
          assert.equal(response.headers.get('cache-control'), 'no-store');
        }
      }
      assert.equal(clinicalCalls, 0);
      identity = { sub: 'test-doctor', 'cognito:groups': ['doctor'] }; linked = true; approved = false;
      for (const [method, path] of routes) assert.equal((await request(method, path)).status, 403);
      approved = true;
      for (const actor of [identity, { sub: 'test-patient', 'cognito:groups': ['patient'] }]) {
        identity = actor;
        for (const path of [routes[0][1], '/immunizations/test-patient', '/sdoh/assessments/test-patient',
          '/sdoh/observations/test-patient', '/mpi/links/test-patient', '/patients/test-patient/cda']) {
          const response = await request('GET', path);
          assert.equal(response.status, 200, `${actor.sub} ${path}`);
          assert.equal(response.headers.get('cache-control'), 'no-store');
        }
        assert.equal((await request('GET', '/fhir/launch/test-patient')).status, 501);
        assert.equal((await request('POST', '/fhir/launch-context')).status, 501);
      }
      // Patient access does not grant clinician-only mutation privileges.
      const before = clinicalCalls;
      for (const [method, path, body] of [
        ['DELETE', '/patients/test-patient/allergies/test-allergy'],
        ['POST', '/immunizations', { patientId: 'test-patient', cvxCode: 'test-code' }],
        ['PUT', '/immunizations/test-patient/test-immunization', { status: 'completed' }],
        ['POST', '/public-health/ecr', { patientId: 'test-patient', conditionCode: 'test-code' }],
      ]) assert.equal((await request(method, path, undefined, body)).status, 403, `${method} ${path}`);
      assert.equal(clinicalCalls, before);
      for (const state of ['IN_PROGRESS', 'RETRY_REQUIRED', 'COMPLETED']) {
        erasureState = state;
        for (const [method, path] of routes) assert.equal((await request(method, path)).status, 403);
      }
      erasureState = undefined; auditFails = true;
      for (const [method, path] of routes) assert.equal((await request(method, path)).status, 503);
      auditFails = false; accessFails = true;
      for (const [method, path] of routes) assert.equal((await request(method, path)).status, 503);
      accessFails = false; profileMissing = true;
      assert.equal((await request('GET', routes[0][1])).status, 403);
      profileMissing = false; identityVerified = false;
      assert.equal((await request('GET', routes[0][1])).status, 403); identityVerified = true;
      assert.equal(clinicalCalls, before);
      const accessBefore = accessCalls;
      assert.equal((await request('GET', '/patients/test%3Fpatient/allergies')).status, 400);
      for (const body of [null, {}, { patientId: [] }, { patientId: 'test?patient' }])
        assert.equal((await request('POST', '/immunizations', undefined, body)).status, 400);
      assert.equal(accessCalls, accessBefore, 'Invalid subjects must not reach storage');
      const unauthenticated = await request('GET', routes[0][1], '');
      assert.equal(unauthenticated.status, 401);
      assert.equal(unauthenticated.headers.get('cache-control'), 'no-store');
      assert.equal((await request('GET', routes[0][1], `test-${region === 'US' ? 'EU' : 'US'}-token`)).status, 401);
      const auditBefore = auditCalls;
      assert.equal((await request('GET', '/fhir/metadata', '')).status, 200);
      assert.equal((await request('GET', '/allergies/common')).status, 200);
      assert.equal((await request('POST', '/privacy/erasure/test-patient/review')).status, 403);
      assert.equal(auditCalls, auditBefore, 'Public lookup and privacy-review policy stay separate');
      identity = { sub: 'test-doctor', 'cognito:groups': ['doctor'] };
      assert.equal((await request('DELETE', '/patients/test-patient/allergies/test-allergy')).status, 200);
      assert.equal(writes, 1);
    } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
  });
}
