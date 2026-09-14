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
const { getCapabilityStatement, getSmartConfiguration } = require('./dist/shared/fhir-metadata.js');
const { smartToken, registerLaunchContext } = require('./dist/shared/smart-auth.js');
const { readFhirPatient } = require('./dist/shared/fhir-patient.js');

test('FHIR advertised read exists; ownership, response allowlist, audit failure and unsupported SMART behavior are enforced', async () => {
  let reads = 0; let auditUnavailable = false;
  mock.method(aws, 'getRegionalClient', region => {
    assert.equal(region, 'EU');
    return { send: async () => { reads++; return { Item: { patientId: 'test-patient', isIdentityVerified: true, name: 'Synthetic Patient', gender: 'unknown', dob: '1990-01-01', refreshToken: 'test-token', erasureApproval: { decision: 'APPROVED' } } }; } };
  });
  mock.method(audit, 'writeAuditLog', async (...args) => {
    assert.equal(args[4].requirePersistence, true);
    if (auditUnavailable) throw new Error('test audit outage');
  });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: 'test-patient', isPatient: true, region: 'EU' }; next(); });
  app.get('/fhir/metadata', getCapabilityStatement); app.get('/fhir/Patient/:id', readFhirPatient);
  app.get('/.well-known/smart-configuration', getSmartConfiguration);
  app.post('/fhir/token', smartToken); app.post('/fhir/launch-context', registerLaunchContext);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const metadata = await (await fetch(`${base}/fhir/metadata`)).json();
    assert.deepEqual(metadata.rest[0].resource, [{ type: 'Patient', interaction: [{ code: 'read' }] }]);
    const denied = await fetch(`${base}/fhir/Patient/test-other`);
    assert.equal(denied.status, 403); assert.equal((await denied.json()).resourceType, 'OperationOutcome'); assert.equal(reads, 0);
    const response = await fetch(`${base}/fhir/Patient/test-patient`);
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /^application\/fhir\+json/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { resourceType: 'Patient', id: 'test-patient', name: [{ text: 'Synthetic Patient' }], birthDate: '1990-01-01', gender: 'unknown' });
    auditUnavailable = true;
    const failed = await fetch(`${base}/fhir/Patient/test-patient`);
    assert.equal(failed.status, 503); assert.equal((await failed.json()).resourceType, 'OperationOutcome');
    for (const [path, method] of [['/.well-known/smart-configuration', 'GET'], ['/fhir/token', 'POST'], ['/fhir/launch-context', 'POST']]) {
      const unsupported = await fetch(base + path, { method });
      assert.equal(unsupported.status, 501); assert.equal((await unsupported.json()).issue[0].code, 'not-supported');
    }
  } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
});
