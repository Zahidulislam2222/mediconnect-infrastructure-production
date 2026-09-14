import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
const require = createRequire(new URL('../communication-service/package.json', import.meta.url));
const express = require('express');
const aws = require('./dist/shared/aws-config.js');
const { issueSocketTicket } = require('./dist/shared/socket-ticket.js');
const { requireIdentityVerification } = require('./dist/communication-service/src/middleware/verification.middleware.js');

test('HTTP ticket issuance stores a hash with expiry; missing identity, verification and active erasure prevent issuance', async () => {
  let user = { id: 'test-patient', region: 'EU', isDoctor: false };
  let patient = { isIdentityVerified: true }; const writes = [];
  mock.method(aws, 'getRegionalClient', region => {
    assert.equal(region, 'EU');
    return { send: async command => {
      if (command.constructor.name === 'GetCommand') return { Item: patient };
      writes.push(command.input.Item); return {};
    } };
  });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.post('/chat/socket-ticket', requireIdentityVerification, issueSocketTicket);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/chat/socket-ticket`;
  try {
    const response = await fetch(url, { method: 'POST' });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json(); assert.match(result.ticket, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(result.region, 'EU');
    assert.equal(writes[0].connectionId, `ticket#${createHash('sha256').update(result.ticket).digest('hex')}`);
    assert.equal(writes[0].userId, undefined, 'Tickets must not populate the live-connection index');
    assert.equal(writes[0].ticketExpiresAt, result.expiresAt);
    assert.equal(JSON.stringify(writes[0]).includes(result.ticket), false);
    patient = { isIdentityVerified: false }; assert.equal((await fetch(url, { method: 'POST' })).status, 403);
    patient = { isIdentityVerified: true, erasure: { state: 'IN_PROGRESS' } }; assert.equal((await fetch(url, { method: 'POST' })).status, 403);
    user = null; assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    assert.equal(writes.length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
});
