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
process.env.SENSITIVE_OPERATION_AUTH_MAX_AGE_SECONDS = '120';
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const express = require('express');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const now = Math.floor(Date.now() / 1000);

// Cloud verification is stubbed; the real HTTP authentication and MFA guards execute.
// A positive synthetic amr contract is not proof that native Cognito emits that claim.
for (const region of ['US', 'EU']) {
  test(`${region}: sensitive operations require fresh signed session MFA in every environment`, async () => {
    let claims = {};
    mock.method(CognitoJwtVerifier, 'create', configuration => ({ verify: async token => {
      assert.equal(configuration.userPoolId, process.env[`COGNITO_USER_POOL_ID_${region}`]);
      if (token !== 'test-token') throw new Error('Test invalid token');
      return { sub: 'test-admin', 'cognito:groups': ['admin'], ...claims };
    } }));
    const { authMiddleware, requireMFA } = require('./dist/patient-service/src/middleware/auth.middleware.js');
    const app = express(); app.use(express.json());
    let mutations = 0;
    app.post('/sensitive', authMiddleware, requireMFA, (_req, res) => { mutations++; res.json({ accepted: true }); });
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/sensitive`;
    const send = (token = 'test-token') => fetch(url, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'x-user-region': region, ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, body: JSON.stringify({ user: { mfaVerified: true, authTime: now }, 'custom:mfa_verified': 'true', amr: ['mfa'] }) });
    const originalEnvironment = process.env.NODE_ENV;
    try {
      for (const environment of ['development', 'test', 'production']) {
        process.env.NODE_ENV = environment;
        const before = mutations;
        assert.equal((await send('')).status, 401);
        assert.equal((await send('invalid-test-token')).status, 401);
        for (const invalidClaims of [
          {}, { 'custom:mfa_verified': 'true', auth_time: now },
          { amr: 'mfa', auth_time: now }, { amr: ['pwd'], auth_time: now },
          { amr: ['mfa', 1], auth_time: now }, { amr: ['MFA'], auth_time: now },
          { amr: ['mfa'] }, { amr: ['mfa'], auth_time: String(now) },
          { amr: ['mfa'], auth_time: now - 121 }, { amr: ['mfa'], auth_time: now + 600 },
          { amr: ['mfa'], auth_time: now - 0.5 },
        ]) {
          claims = invalidClaims;
          assert.equal((await send()).status, 403, `reject insufficient MFA in ${environment}`);
        }
        assert.equal(mutations, before);
        claims = { amr: ['pwd', 'mfa'], auth_time: now };
        assert.equal((await send()).status, 200);
        assert.equal(mutations, before + 1);
      }
    } finally {
      if (originalEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalEnvironment;
      await new Promise(resolve => server.close(resolve)); mock.restoreAll();
    }
  });
}
