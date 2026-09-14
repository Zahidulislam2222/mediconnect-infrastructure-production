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
for (const name of ['TABLE_CAREPLANS', 'TABLE_GRAPH', 'DYNAMO_TABLE', 'DYNAMO_TABLE_DOCTORS']) {
  process.env[name] = `test-${name.toLowerCase().replaceAll('_', '-')}`;
}
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const express = require('express');
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const actions = require('./dist/patient-service/src/modules/clinical/care-plan.controller.js');

for (const region of ['US', 'EU']) {
  test(`${region}: care-plan CRUD enforces subject, current clinician approval, care link and audit`, async () => {
    let user = { id: 'test-other', region }, linked = false, approved = true, erasureState, auditFails = false;
    const plan = { carePlanId: 'test-plan', patientId: 'test-patient', title: 'Synthetic plan', status: 'active',
      intent: 'plan', category: { code: 'assess-plan', display: 'Assessment and plan' }, startDate: '2026-01-01',
      createdAt: '2026-01-01T00:00:00Z' };
    let writes = 0, clinicalQueries = 0, wrongIndexSubject = false;
    mock.method(aws, 'getRegionalClient', selected => {
      assert.equal(selected, region);
      return { send: async command => {
        const input = command.input;
        if (input.TableName === process.env.DYNAMO_TABLE_DOCTORS) return { Item: { verificationStatus: approved ? 'APPROVED' : 'REVOKED' } };
        if (input.TableName === process.env.TABLE_GRAPH) return { Item: linked ? { relationship: 'isTreatedBy' } : undefined };
        if (input.TableName === process.env.DYNAMO_TABLE) return { Item: { isIdentityVerified: true, erasure: { state: erasureState } } };
        assert.equal(input.TableName, process.env.TABLE_CAREPLANS);
        if (command.constructor.name === 'QueryCommand') { clinicalQueries++; return { Items: [{ ...plan, patientId: wrongIndexSubject ? 'test-other' : plan.patientId }] }; }
        if (command.constructor.name === 'PutCommand') { writes++; return {}; }
        if (command.constructor.name === 'UpdateCommand') {
          writes++; assert.ok(input.ConditionExpression.includes('patientId'));
          assert.ok(Object.values(input.ExpressionAttributeValues).includes('test-patient')); return {};
        }
        return { Item: plan };
      } };
    });
    mock.method(audit, 'writeAuditLog', async (_actor, _subject, action, _detail, metadata) => {
      if (action === 'CLINICAL_ACCESS_AUTHORIZED') {
        assert.equal(metadata.requirePersistence, true); assert.equal(metadata.region, region);
        if (auditFails) throw new Error('synthetic private audit detail');
      }
    });
    const app = express(); app.use(express.json());
    app.use((req, res, next) => { req.user = user; if (!user) return res.status(401).json({ error: 'Test authentication required' }); next(); });
    app.get('/plans/:patientId', actions.getPatientCarePlans);
    app.get('/detail/:carePlanId', actions.getCarePlan);
    app.post('/plans', actions.createCarePlan);
    app.put('/detail/:carePlanId', actions.updateCarePlan);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const request = (path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-user-region': region }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const all = () => Promise.all([
      request('/plans/test-patient'), request('/detail/test-plan'),
      request('/plans', 'POST', { patientId: 'test-patient', title: 'Synthetic plan' }),
      request('/detail/test-plan', 'PUT', { patientId: user.id, status: 'completed' }),
    ]);
    try {
      for (const identity of [{ id: 'test-other', region }, { id: 'test-doctor', region, isDoctor: true }]) {
        user = identity;
        for (const response of await all()) { assert.equal(response.status, 403); assert.equal(response.headers.get('cache-control'), 'no-store'); }
        assert.equal(writes, 0); assert.equal(clinicalQueries, 0);
      }
      linked = true; approved = false;
      for (const response of await all()) assert.equal(response.status, 403);
      approved = true;
      for (const identity of [{ id: 'test-patient', region }, { id: 'test-doctor', region, isDoctor: true }]) {
        user = identity;
        for (const response of await all()) { assert.ok([200, 201].includes(response.status)); assert.equal(response.headers.get('cache-control'), 'no-store'); }
      }
      const before = writes;
      wrongIndexSubject = true; assert.equal((await request('/plans/test-patient')).status, 503); wrongIndexSubject = false;
      erasureState = 'IN_PROGRESS'; for (const response of await all()) assert.equal(response.status, 403);
      erasureState = undefined; auditFails = true;
      for (const response of await all()) { assert.equal(response.status, 503); assert.equal((await response.text()).includes('private audit'), false); }
      assert.equal(writes, before);
    } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
  });
}
