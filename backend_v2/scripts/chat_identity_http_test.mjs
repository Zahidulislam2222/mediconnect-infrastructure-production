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
process.env.AWS_WS_GATEWAY_ENDPOINT_EU = 'https://gateway.example.invalid';
const require = createRequire(new URL('../communication-service/package.json', import.meta.url));
const express = require('express');
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const crypto = require('./dist/shared/kms-crypto.js');
const { validate, ChatWsEventBody } = require('./dist/shared/validation.js');
const { handleWsEventHttp } = require('./dist/communication-service/src/controllers/chat.controller.js');

test('HTTP chat ignores forged gateway identity and lifecycle, sends validated content as the authenticated user', async () => {
  let user = { sub: 'test-sender', role: 'patient', region: 'EU' };
  let linked = false; const commands = [];
  mock.method(audit, 'writeAuditLog', async () => {});
  mock.method(crypto, 'encryptPHI', async data => {
    assert.equal(data.text, 'Synthetic message'); return { text: 'test-ciphertext' };
  });
  mock.method(aws, 'getRegionalClient', region => {
    assert.equal(region, 'EU');
    return { send: async command => {
      commands.push(command);
      if (command.constructor.name === 'GetCommand') return { Item: linked ? { linked: true } : undefined };
      return { Items: [] };
    } };
  });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.post('/chat/ws-event', validate({ body: ChatWsEventBody }), handleWsEventHttp);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/chat/ws-event`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-region': 'EU' }, body: JSON.stringify(body) });
  const payload = { type: 'message', recipientId: 'test-doctor', content: 'Synthetic message',
    routeKey: '$disconnect', connectionId: 'test-victim-connection', region: 'US',
    requestContext: { authorizer: { sub: 'test-victim', role: 'doctor' } } };
  try {
    assert.equal((await post(payload)).status, 403);
    assert.equal(JSON.stringify(commands).includes('test-victim'), false);
    linked = true;
    assert.equal((await post(payload)).status, 200);
    const writes = commands.filter(command => command.constructor.name === 'PutCommand');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].input.TableName, process.env.TABLE_CHAT_HISTORY);
    assert.equal(writes[0].input.Item.senderId, user.sub);
    assert.equal(writes[0].input.Item.text, 'test-ciphertext');
    assert.equal(commands.some(command => command.constructor.name === 'DeleteCommand'), false);
    const count = commands.length;
    assert.equal((await post({ ...payload, type: 'typing' })).status, 501);
    user = null;
    assert.equal((await post(payload)).status, 401);
    assert.equal(commands.length, count);
  } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
});
