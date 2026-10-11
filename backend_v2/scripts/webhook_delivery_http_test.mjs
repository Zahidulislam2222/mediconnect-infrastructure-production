// Signed requests through Express, using a strict in-memory regional claim store. No provider calls.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';

for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = /^(TABLE_|DYNAMO_TABLE)/.test(match[1])
    ? `test-${match[1].toLowerCase().replaceAll('_', '-')}` : match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.WEBHOOK_CLAIM_TTL_SECONDS = '30';
process.env.WEBHOOK_EVENT_RETENTION_SECONDS = '2592000';
process.env.WEBHOOK_STRIPE_PARAMETER_PATH = '/test/webhook';
process.env.STRIPE_API_VERSION = '2023-10-16';
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const express = require('express');
const Stripe = require('stripe');
const aws = require('./dist/shared/aws-config.js');
const logger = require('./dist/shared/logger.js');
const EVENTS = process.env.TABLE_WEBHOOK_EVENTS;
const BILLS = process.env.TABLE_TRANSACTIONS;
const secret = 'whsec_test_secret';
const stripe = new Stripe('sk_test_key');
const conditional = () => Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });

async function harness(options = {}) {
  const events = new Map(Object.entries(options.events ?? {}));
  let failClaims = options.failClaims ?? 0, failRelease = options.failRelease ?? 0;
  let failCompletion = options.failCompletion ?? 0, businessReads = 0;
  let releaseBusiness;
  const block = options.block ? new Promise(resolve => { releaseBusiness = resolve; }) : undefined;
  const clients = [], parameters = [];
  mock.method(logger, 'safeLog', () => {});
  mock.method(logger, 'safeError', () => {});
  mock.method(aws, 'getSSMParameter', async (path, region) => {
    parameters.push({ path, region });
    return path.includes('webhook') ? secret : 'sk_test_key';
  });
  mock.method(aws, 'getRegionalClient', region => {
    clients.push(region);
    return { send: async command => {
      const { input } = command, kind = command.constructor.name;
      if (input.TableName === BILLS && kind === 'GetCommand') {
        businessReads++;
        if (options.businessFailure) throw new Error('database unavailable');
        await block;
        return { Item: { billId: 'test-bill', status: 'PAID' } };
      }
      assert.equal(input.TableName, EVENTS, `Unexpected ${kind}`);
      const id = input.Key?.eventId ?? input.Item?.eventId;
      const current = events.get(id);
      if (kind === 'GetCommand') { assert.equal(input.ConsistentRead, true); return { Item: current && structuredClone(current) }; }
      if (kind === 'PutCommand') {
        if (failClaims-- > 0) throw new Error('claim store unavailable');
        assert.equal(input.ConditionExpression, 'attribute_not_exists(eventId)');
        if (current) throw conditional();
        events.set(id, structuredClone(input.Item)); return {};
      }
      if (kind === 'DeleteCommand') {
        if (failRelease-- > 0) throw new Error('release unavailable');
        if (input.ConditionExpression && current?.claimToken !== input.ExpressionAttributeValues[':token']) throw conditional();
        events.delete(id); return {};
      }
      if (kind === 'UpdateCommand') {
        const values = input.ExpressionAttributeValues;
        if (!current || current.claimToken !== values[':token']) throw conditional();
        if (input.UpdateExpression.includes('leaseUntil')) {
          if (current.status !== 'PROCESSING' || !(current.leaseUntil < values[':now'])) throw conditional();
          Object.assign(current, { claimToken: values[':next'], leaseUntil: values[':lease'], expiresAt: values[':ttl'] });
        } else {
          if (failCompletion-- > 0) throw new Error('completion unavailable');
          assert.equal(current.status, 'PROCESSING');
          Object.assign(current, { status: 'COMPLETED', processedAt: values[':now'] });
        }
        return {};
      }
      throw new Error(`Unexpected ${kind}`);
    } };
  });
  const { handleStripeWebhook } = require('./dist/booking-service/src/controllers/webhook.controller.js');
  const app = express();
  app.post('/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
    Promise.resolve(handleStripeWebhook(req, res)).catch(next);
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  async function deliver({ id = 'evt_test_delivery', region = 'EU', valid = true } = {}) {
    const payload = JSON.stringify({ id, object: 'event', type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test', object: 'payment_intent', metadata: { billId: 'test-bill', region } } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: valid ? secret : 'whsec_test_wrong' });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload,
    });
    return { status: response.status, body: await response.text() };
  }
  return { deliver, events, clients, parameters, reads: () => businessReads, unblock: () => releaseBusiness?.(),
    close: async () => { releaseBusiness?.(); await new Promise(resolve => server.close(resolve)); mock.restoreAll(); } };
}

test('a completed event is durably marked and a duplicate is acknowledged without business work', async () => {
  const h = await harness();
  try {
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.events.get('evt_test_delivery').status, 'COMPLETED');
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.reads(), 1);
  } finally { await h.close(); }
});

test('a concurrent delivery is retried until the first delivery completes', async () => {
  const h = await harness({ block: true });
  let first;
  try {
    first = h.deliver();
    while (h.reads() === 0) await new Promise(resolve => setImmediate(resolve));
    assert.equal((await h.deliver()).status, 503);
    h.unblock(); assert.equal((await first).status, 200);
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.reads(), 1);
  } finally { h.unblock(); await first; await h.close(); }
});

test('a claim-store failure refuses processing and asks for retry', async () => {
  const h = await harness({ failClaims: 1 });
  try { assert.equal((await h.deliver()).status, 503); assert.equal(h.reads(), 0); }
  finally { await h.close(); }
});

test('an expired lease can recover a crashed delivery', async () => {
  const h = await harness({ events: { evt_test_delivery: { eventId: 'evt_test_delivery', status: 'PROCESSING', claimToken: 'test-old', leaseUntil: 1 } } });
  try { assert.equal((await h.deliver()).status, 200); assert.equal(h.events.get('evt_test_delivery').status, 'COMPLETED'); }
  finally { await h.close(); }
});

test('a failed completion never acknowledges unfinished durable state', async () => {
  const h = await harness({ failCompletion: 1 });
  try { assert.equal((await h.deliver()).status, 503); assert.notEqual(h.events.get('evt_test_delivery')?.status, 'COMPLETED'); }
  finally { await h.close(); }
});

test('a failed claim release retains a recoverable lease and duplicate is not acknowledged', async () => {
  const h = await harness({ businessFailure: true, failRelease: 1 });
  try {
    assert.equal((await h.deliver()).status, 503);
    assert.equal(h.events.get('evt_test_delivery').status, 'PROCESSING');
    assert.equal((await h.deliver()).status, 503);
  } finally { await h.close(); }
});

test('ambiguous legacy claims remain retryable for reconciliation during rollout', async () => {
  const h = await harness({ events: { evt_test_delivery: { eventId: 'evt_test_delivery', processedAt: 'test-legacy-time' } } });
  try { assert.equal((await h.deliver()).status, 503); assert.equal(h.reads(), 0); }
  finally { await h.close(); }
});

test('invalid signatures and unsupported regional metadata never claim events', async () => {
  const h = await harness();
  try {
    assert.equal((await h.deliver({ valid: false })).status, 400);
    assert.equal((await h.deliver({ region: 'unknown-region' })).status, 400);
    assert.equal(h.events.size, 0);
  } finally { await h.close(); }
});
