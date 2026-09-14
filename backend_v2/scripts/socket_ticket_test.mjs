import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { consumeConnectionTicket } from '../ws-authorizer/ticket.mjs';
import { socketAuthorizerSettings } from '../ws-authorizer/settings.mjs';

test('ticket consumption uses an atomic region/expiry condition and rejects replay, expiry and cross-region attempts', async () => {
  const ticket = randomBytes(32).toString('base64url');
  const key = `ticket#${createHash('sha256').update(ticket).digest('hex')}`;
  let row = { subjectId: 'test-patient', role: 'patient', jurisdiction: 'EU', expiresAt: 2000 };
  const client = { send: async command => {
    assert.equal(command.constructor.name, 'DeleteCommand'); assert.equal(command.input.Key.connectionId, key);
    assert.equal(command.input.ReturnValues, 'ALL_OLD');
    assert.match(command.input.ConditionExpression, /expiresAt > :now AND jurisdiction = :region/);
    const values = command.input.ExpressionAttributeValues;
    if (!row || row.expiresAt <= values[':now'] || row.jurisdiction !== values[':region']) throw Object.assign(new Error('test rejected'), { name: 'ConditionalCheckFailedException' });
    const original = row; row = null; return { Attributes: original };
  } };
  const config = { table: 'test-table', jurisdiction: 'EU', region: 'test-eu' };
  await assert.rejects(consumeConnectionTicket(ticket, client, { ...config, jurisdiction: 'US' }, 1000000));
  assert.ok(row, 'Wrong-region attempt must not consume a valid ticket');
  await assert.rejects(consumeConnectionTicket(ticket, client, config, 2000000));
  assert.ok(row, 'Expired ticket must not authenticate');
  assert.deepEqual(await consumeConnectionTicket(ticket, client, config, 1000000), { sub: 'test-patient', role: 'patient', region: 'test-eu' });
  await assert.rejects(consumeConnectionTicket(ticket, client, config, 1000000));
});
test('JWT-shaped credentials and invalid region configuration are rejected before lookup', async () => {
  await assert.rejects(consumeConnectionTicket('test.header.signature', { send: async () => assert.fail('Invalid ticket reached database') }, {}), /INVALID_CONNECTION_TICKET/);
  assert.throws(() => socketAuthorizerSettings({ AWS_REGION: 'unknown', PRIVACY_US_REGION: 'test-us', PRIVACY_EU_REGION: 'test-eu', TABLE_CHAT_CONNECTIONS: 'test-table' }), /CONFIGURATION_REQUIRED/);
});
