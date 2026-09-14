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

for (const service of ['patient', 'booking']) {
  test(`${service}: encryption outage prevents database mutations and payment calls in real HTTP flows`, async () => {
    const require = createRequire(new URL(`../${service}-service/package.json`, import.meta.url));
    const express = require('express');
    const aws = require('./dist/shared/aws-config.js');
    const crypto = require('./dist/shared/kms-crypto.js');
    const commands = [];
    mock.method(aws, 'getRegionalClient', region => {
      assert.equal(region, 'EU');
      return { send: async command => {
        commands.push(command);
        assert.equal(command.constructor.name, 'GetCommand', 'Database mutation must never occur after encryption failure');
        return { Item: { patientId: 'test-patient', name: 'Synthetic Name', isIdentityVerified: true, verificationStatus: 'APPROVED' } };
      } };
    });
    mock.method(aws, 'getSSMParameter', async () => assert.fail('Payment provider contacted before PHI was protected'));
    mock.method(crypto, 'encryptPHI', async () => { throw new Error('test encryption outage'); });
    mock.method(crypto, 'decryptPHI', async () => { throw new Error('test decryption outage'); });
    const controller = require(`./dist/${service}-service/src/controllers/${service}.controller.js`);
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { id: 'test-patient', sub: 'test-patient', region: 'EU' }; next(); });
    if (service === 'patient') {
      app.post('/patients', controller.createPatient); app.put('/patients/:id', controller.updateProfile); app.get('/me', controller.getProfile);
    } else app.post('/booking', controller.createBooking);
    app.use((_error, _req, res, _next) => res.status(500).json({ code: 'TEST_UNEXPECTED_ERROR' }));
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const cases = service === 'patient' ? [
      ['POST', '/patients', { name: 'Synthetic Name', email: 'patient@example.invalid', consentDetails: { agreedToTerms: true } }, 'PHI_ENCRYPTION_UNAVAILABLE'],
      ['PUT', '/patients/test-patient', { name: 'Synthetic Updated' }, 'PHI_ENCRYPTION_UNAVAILABLE'],
      ['GET', '/me', undefined, 'PHI_DECRYPTION_UNAVAILABLE'],
    ] : [['POST', '/booking', { doctorId: 'test-doctor', timeSlot: new Date(Date.now() + 86400000).toISOString(), paymentToken: 'test-token' }, 'PHI_ENCRYPTION_UNAVAILABLE']];
    try {
      for (const [method, path, body, code] of cases) {
        const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'x-user-region': 'EU' }, ...(body ? { body: JSON.stringify(body) } : {}) });
        assert.equal(response.status, 503); assert.equal((await response.json()).code, code);
      }
    } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
  });
}
