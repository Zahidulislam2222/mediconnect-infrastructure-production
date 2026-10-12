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
process.env.NATIVE_MFA_PROOF_ENABLED = 'true';
process.env.SENSITIVE_OPERATION_AUTH_MAX_AGE_SECONDS = '120';
process.env.TABLE_SESSIONS = 'test-sessions';
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const proofModule = require('./dist/shared/native-mfa-proof.js');
const { completeNativeMfa, readNativeMfa, mfaProofKey, NATIVE_MFA_PROOF_KIND } = proofModule;
const now = 1000000;
const original = { id: 'test-patient', username: 'test-native-user', region: 'EU', clientId: 'test-client', sessionTokenHash: 'a'.repeat(64) };
const input = { session: 'test-native-session-123456', code: '123456' };
function fixture() {
  let stored;
  const dependencies = {
    now: () => now, maxAgeSeconds: 120,
    respond: async () => 'test-verified-token',
    verify: async () => ({ sub: original.id, aud: original.clientId, auth_time: now, exp: now + 60 }),
    write: async value => { stored = value; }, read: async () => stored,
  };
  return { dependencies, get: () => stored, set: value => { stored = value; } };
}

test('native completion uses the actual regional session-table key and binds only the original bearer', async () => {
  const f = fixture();
  assert.equal(await completeNativeMfa(original, input, f.dependencies), now + 60);
  assert.equal(f.get().appointmentId, mfaProofKey(original));
  assert.equal(f.get().sessionId, undefined);
  assert.equal(f.get().kind, NATIVE_MFA_PROOF_KIND);
  assert.equal(f.get().ttl, now + 60);
  assert.equal(await readNativeMfa(original, f.dependencies), now);
  for (const user of [{ ...original, sessionTokenHash: 'b'.repeat(64) }, { ...original, id: 'test-other' },
    { ...original, clientId: 'test-other-client' }, { ...original, region: 'US' }]) {
    assert.equal(await readNativeMfa(user, f.dependencies), undefined);
  }
  assert.ok(!JSON.stringify(f.get()).includes(input.session));
  assert.ok(!JSON.stringify(f.get()).includes(input.code));
  assert.ok(!JSON.stringify(f.get()).includes('test-verified-token'));
});

for (const [name, claims] of Object.entries({
  subject: { sub: 'test-other' }, audience: { aud: 'test-other-client' },
  missingTime: { auth_time: undefined }, textTime: { auth_time: String(now) },
  staleTime: { auth_time: now - 121 }, futureTime: { auth_time: now + 1 },
  fractionalTime: { auth_time: now - 0.5 }, expired: { exp: now }, missingExpiry: { exp: undefined },
})) test(`native completion refuses ${name} before any proof is written`, async () => {
  const f = fixture(); const verify = f.dependencies.verify;
  f.dependencies.verify = async () => ({ ...await verify(), ...claims });
  await assert.rejects(completeNativeMfa(original, input, f.dependencies));
  assert.equal(f.get(), undefined);
});

for (const [name, bad] of Object.entries({ shortSession: { ...input, session: 'short' },
  longSession: { ...input, session: 'x'.repeat(2049) }, invalidCode: { ...input, code: '12ab56' },
  extraField: { ...input, verified: true }, missingCode: { session: input.session },
})) test(`native completion refuses malformed ${name} before provider access`, async () => {
  const f = fixture(); f.dependencies.respond = async () => { assert.fail('Provider called for invalid input'); };
  await assert.rejects(completeNativeMfa(original, bad, f.dependencies));
  assert.equal(f.get(), undefined);
});

for (const failure of ['respond', 'verify', 'write']) test(`native ${failure} outage cannot unlock the original session`, async () => {
  const f = fixture(); f.dependencies[failure] = async () => { throw new Error('test provider unavailable'); };
  await assert.rejects(completeNativeMfa(original, input, f.dependencies));
  assert.equal(await readNativeMfa(original, f.dependencies), undefined);
});

test('both regions use issuer verification and keep proof state in the requesting region', async () => {
  for (const region of ['EU', 'US']) {
    const user = { ...original, region }; const f = fixture();
    const verify = f.dependencies.verify; const write = f.dependencies.write;
    f.dependencies.verify = async (token, selected) => { assert.equal(selected, region); return verify(token); };
    f.dependencies.write = async proof => { assert.equal(proof.region, region); return write(proof); };
    assert.equal(await completeNativeMfa(user, input, f.dependencies), now + 60);
    assert.equal(await readNativeMfa(user, f.dependencies), now);
    assert.equal(await readNativeMfa({ ...user, region: region === 'EU' ? 'US' : 'EU' }, f.dependencies), undefined);
  }
});

test('missing, expired, malformed or foreign retained proof never authorizes a sensitive operation', async () => {
  const f = fixture(); assert.equal(await readNativeMfa(original, f.dependencies), undefined);
  await completeNativeMfa(original, input, f.dependencies); const good = f.get();
  for (const changes of [{ appointmentId: 'other' }, { kind: 'test-foreign-record' }, { patientId: 'other' },
    { region: 'US' }, { clientId: 'other' }, { proofAuthTime: now + 1 }, { proofAuthTime: now - 121 },
    { proofAuthTime: String(now) }, { expiresAt: now }, { expiresAt: undefined }]) {
    f.set({ ...good, ...changes }); assert.equal(await readNativeMfa(original, f.dependencies), undefined);
  }
});

test('real HTTP completion refreshes stale issuer MFA for explicit same-bearer retry; failed challenge never authorizes', async () => {
  const aws = require('./dist/shared/aws-config.js');
  const express = require('express');
  const { completeNativeMfaHandler } = require('./dist/patient-service/src/middleware/native-mfa.middleware.js');
  let stored, denied = false; const calls = [];
  mock.method(aws, 'getRegionalCognitoClient', region => ({ send: async command => {
    assert.equal(region, 'EU'); calls.push(command.input);
    assert.deepEqual(command.input, { ClientId: original.clientId, ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: input.session, ChallengeResponses: { USERNAME: original.username, SOFTWARE_TOKEN_MFA_CODE: input.code } });
    if (denied) throw new Error('test incorrect code');
    return { AuthenticationResult: { IdToken: 'test-provider-id-token' } };
  } }));
  mock.method(aws, 'getRegionalClient', region => ({ send: async command => {
    assert.equal(region, 'EU'); assert.equal(command.input.TableName, 'test-sessions');
    if (command.constructor.name === 'PutCommand') {
      assert.equal(command.input.Item.appointmentId, mfaProofKey(original));
      assert.match(command.input.ConditionExpression, /attribute_not_exists\(appointmentId\)/);
      stored = command.input.Item; return {};
    }
    assert.deepEqual(command.input.Key, { appointmentId: mfaProofKey(original) });
    return { Item: stored };
  } }));
  const { requireMFA } = require('./dist/patient-service/src/middleware/auth.middleware.js');
  const realNow = Math.floor(Date.now() / 1000);
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = { ...original, mfaVerified: true, authTime: realNow - 121 }; next(); });
  app.post('/complete', completeNativeMfaHandler(async token => {
    assert.equal(token, 'test-provider-id-token');
    return { sub: original.id, aud: original.clientId, auth_time: realNow, exp: realNow + 60 };
  }));
  app.get('/protected', requireMFA, (_req, res) => res.json({ authorized: true }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/complete`;
  const send = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const protectedUrl = url.replace(/complete$/, 'protected');
    assert.equal((await fetch(protectedUrl)).status, 403);
    const success = await send(input); assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { verified: true, expiresAt: realNow + 60 });
    assert.equal((await fetch(protectedUrl)).status, 200);
    assert.ok(stored); const prior = structuredClone(stored);
    denied = true; assert.equal((await send(input)).status, 403); assert.deepEqual(stored, prior);
    assert.equal((await send({ ...input, code: 'wrong' })).status, 403); assert.equal(calls.length, 2);
    process.env.NATIVE_MFA_PROOF_ENABLED = 'false'; assert.equal((await send(input)).status, 503);
    assert.equal(calls.length, 2);
  } finally {
    process.env.NATIVE_MFA_PROOF_ENABLED = 'true';
    await new Promise(resolve => server.close(resolve)); mock.restoreAll();
  }
});
