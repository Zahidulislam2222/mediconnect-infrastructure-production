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
process.env.COGNITO_USER_POOL_ID_US = 'us-east-1_test';
process.env.COGNITO_USER_POOL_ID_EU = 'eu-central-1_test';

for (const service of ['patient', 'doctor', 'booking', 'communication', 'staff']) {
  test(`${service}: forged authorizer, ambiguous region and invalid tokens fail; verified region propagates`, async () => {
    const require = createRequire(new URL(`../${service}-service/package.json`, import.meta.url));
    const { CognitoJwtVerifier } = require('aws-jwt-verify');
    const express = require('express');
    let verificationCalls = 0;
    let expectedJurisdiction = 'EU';
    const factory = mock.method(CognitoJwtVerifier, 'create', configuration => ({ verify: async token => {
      verificationCalls++;
      if (token !== 'test-token') throw new Error('test invalid token');
      assert.equal(configuration.userPoolId, process.env[`COGNITO_USER_POOL_ID_${expectedJurisdiction}`]);
      return { sub: 'test-doctor', 'cognito:groups': ['doctor'] };
    } }));
    const { authMiddleware } = require(`./dist/${service}-service/src/middleware/auth.middleware.js`);
    const { requestJurisdiction } = require('./dist/shared/region-context.js');
    const app = express(); app.use(express.json());
    app.post('/protected', authMiddleware, (req, res) => res.json({ region: requestJurisdiction(req), header: req.headers['x-user-region'] }));
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/protected`;
    try {
      const forged = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-region': 'EU' }, body: JSON.stringify({ requestContext: { authorizer: { sub: 'test-victim', role: 'doctor' } } }) });
      assert.equal(forged.status, 401); assert.equal(factory.mock.callCount(), 0);
      for (const region of ['not-eu', 'EU, US', 'ap-south-1', '']) {
        const response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test-token', 'x-user-region': region } });
        assert.equal(response.status, 401); assert.equal(verificationCalls, 0);
      }
      const valid = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test-token', 'x-user-region': process.env.PRIVACY_EU_REGION } });
      assert.equal(valid.status, 200); assert.deepEqual(await valid.json(), { region: 'EU', header: 'EU' });
      expectedJurisdiction = 'US';
      const usa = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer test-token', 'x-user-region': process.env.PRIVACY_US_REGION } });
      assert.equal(usa.status, 200); assert.deepEqual(await usa.json(), { region: 'US', header: 'US' });
      assert.throws(() => requestJurisdiction({ headers: { 'x-user-region': 'EU' } }), /INVALID_AUTH_REGION/);
      assert.throws(() => requestJurisdiction({ user: { region: 'EU' }, headers: { 'x-user-region': 'US' } }), /REGIONAL_CONTEXT_MISMATCH/);
      assert.throws(() => requestJurisdiction({ user: { region: 'EU' }, headers: { 'x-user-region': ['EU', 'US'] } }), /INVALID_AUTH_REGION/);
      const invalid = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer invalid-test-token', 'x-user-region': 'EU' } });
      assert.equal(invalid.status, 401);
    } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
  });
}
