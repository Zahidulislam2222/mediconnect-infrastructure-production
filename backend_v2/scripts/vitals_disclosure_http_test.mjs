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
const { getVitals } = require('./dist/patient-service/src/modules/iot/vitals.js');

for (const region of ['US', 'EU']) {
  test(`${region}: vitals disclose only clinical fields and never cache success or errors`, async () => {
    const timestamp = '2026-01-01T00:00:00Z';
    let user = { id: 'test-patient', region }, auditFails = false;
    let rows = [{ patientId: 'test-patient', timestamp, heartRate: 0, temperature: 0,
      oxygenSaturation: '98', respiratoryRate: NaN, status: 'arbitrary private text',
      accessToken: 'test-key', privateNotes: 'synthetic private note', metadata: { refreshToken: 'test-key' }, PK: 'internal-key' }];
    mock.method(aws, 'getRegionalClient', selected => {
      assert.equal(selected, region);
      return { send: async command => command.constructor.name === 'QueryCommand' ? { Items: rows } : { Item: { isIdentityVerified: true } } };
    });
    mock.method(audit, 'writeAuditLog', async () => { if (auditFails) throw new Error('test unavailable'); });
    const app = express(); app.use((req, _res, next) => { req.user = user; next(); }); app.get('/vitals', getVitals);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const request = async (expected, query = 'patientId=test-patient') => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/vitals?${query}`, { headers: { 'x-user-region': region } });
      assert.equal(response.status, expected); assert.equal(response.headers.get('cache-control'), 'no-store'); return response.json();
    };
    try {
      const body = await request(200);
      assert.deepEqual(body.vitals, { patientId: 'test-patient', timestamp, heartRate: 0, temperature: 0 });
      assert.deepEqual(body.history, [body.vitals]);
      assert.equal(JSON.stringify(body).includes('test-key'), false);
      assert.equal(body.fhirBundle.total, 2);
      rows = [{ patientId: 'test-other', timestamp, heartRate: 80 }]; await request(503);
      rows = []; await request(404);
      await request(400, 'patientId=invalid/subject');
      user = undefined; await request(401);
      user = { id: 'test-other', region }; await request(403);
      user = { id: 'test-patient', region }; rows = [{ timestamp, heartRate: 60 }]; auditFails = true; await request(503);
    } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
  });
}
