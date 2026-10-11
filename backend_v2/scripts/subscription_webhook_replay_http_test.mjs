// Signed Express HTTP subscription deliveries; strict synthetic DynamoDB/provider boundaries only.
import { test, mock } from 'node:test';
import { holds } from './fixtures/dynamodb-conditions.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = /^(TABLE_|DYNAMO_TABLE)/.test(m[1]) ? `test-${m[1].toLowerCase()}` : m[2] || `test-${m[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const express = require('express'), Stripe = require('stripe');
const aws = require('./dist/shared/aws-config.js'), audit = require('./dist/shared/audit.js'), logger = require('./dist/shared/logger.js');
const EVENTS = process.env.TABLE_WEBHOOK_EVENTS, SUBS = process.env.TABLE_SUBSCRIPTIONS;
const secret = 'whsec_test_secret', stripe = new Stripe('sk_test_key');
const conditional = () => Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });

function update(row, spec) {
  for (const assignment of spec.UpdateExpression.replace(/^SET /, '').split(',')) {
    const m = assignment.trim().match(/^(\S+)\s*=\s*(:\w+)$/);
    assert.ok(m, `Unsupported update: ${assignment}`);
    row[spec.ExpressionAttributeNames?.[m[1]] ?? m[1]] = structuredClone(spec.ExpressionAttributeValues[m[2]]);
  }
}

async function harness(options = {}) {
  const events = new Map();
  let subscription = options.empty ? undefined : { patientId: 'test-patient', stripeSubscriptionId: 'sub_test', planId: 'premium', status: 'active', freeGpVisitsRemaining: 0, familyMembers: ['test-family'], cycleStart: '2026-01-01T00:00:00.000Z', ...options.subscription };
  let auditFailures = options.auditFailures ?? 0, completionFailures = options.completionFailures ?? 0, lostReplies = options.lostReplies ?? 0;
  let writes = 0, businessCalls = 0, resume;
  const blocked = options.blockFirst ? new Promise(resolve => { resume = resolve; }) : undefined;
  mock.method(logger, 'safeLog', () => {}); mock.method(logger, 'safeError', () => {});
  mock.method(aws, 'getSSMParameter', async path => path.includes('webhook') ? secret : 'sk_test_key');
  mock.method(audit, 'writeAuditLog', async () => { if (auditFailures-- > 0) throw new Error('test audit unavailable'); });
  const get = spec => spec.TableName === EVENTS ? events.get((spec.Key ?? spec.Item).eventId) : subscription;
  const apply = (kind, spec) => {
    if (kind === 'Put') {
      if (spec.TableName === SUBS) subscription = structuredClone(spec.Item);
      else events.set(spec.Item.eventId, structuredClone(spec.Item));
    } else if (kind === 'Update') {
      let row = get(spec);
      if (!row && spec.TableName === SUBS) subscription = row = { ...spec.Key };
      assert.ok(row); update(row, spec);
    }
    if (spec.TableName === SUBS && kind !== 'ConditionCheck') writes++;
  };
  mock.method(aws, 'getRegionalClient', region => {
    assert.equal(region, 'EU');
    return { send: async command => {
      const input = command.input, kind = command.constructor.name;
      if (kind === 'GetCommand') { assert.equal(input.ConsistentRead, true); return { Item: get(input) && structuredClone(get(input)) }; }
      if (kind === 'DeleteCommand') {
        if (!holds(get(input), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) throw conditional();
        events.delete(input.Key.eventId); return {};
      }
      if (kind === 'TransactWriteCommand') {
        if (input.TransactItems.some(item => (item.Update ?? item.Put)?.TableName === SUBS) && ++businessCalls === 1) await blocked;
        const codes = input.TransactItems.map(item => { const spec = Object.values(item)[0]; return holds(get(spec), spec.ConditionExpression, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues) ? 'None' : 'ConditionalCheckFailed'; });
        if (codes.some(code => code !== 'None')) throw Object.assign(new Error('test cancelled'), { name: 'TransactionCanceledException', CancellationReasons: codes.map(Code => ({ Code })) });
        for (const item of input.TransactItems) apply(Object.keys(item)[0], Object.values(item)[0]);
        if (lostReplies-- > 0) throw new Error('test committed reply lost');
        return {};
      }
      if (input.TableName === SUBS && ++businessCalls === 1) await blocked;
      if (!holds(get(input), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) throw conditional();
      if (input.TableName === EVENTS && kind === 'UpdateCommand' && input.ExpressionAttributeValues?.[':completed'] && completionFailures-- > 0) throw new Error('test receipt unavailable');
      apply(kind.replace('Command', ''), input);
      if (input.TableName === SUBS && lostReplies-- > 0) throw new Error('test committed reply lost');
      return {};
    } };
  });
  const { handleStripeWebhook } = require('./dist/booking-service/src/controllers/webhook.controller.js');
  const app = express(); app.post('/webhook', express.raw({ type: 'application/json' }), (req, res, next) => { Promise.resolve(handleStripeWebhook(req, res)).catch(next); });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const invoice = { id: 'in_test', subscription: 'sub_test', billing_reason: 'subscription_cycle', period_start: 1769904000, period_end: 1772323200, amount_paid: 3900, metadata: { patientId: 'test-patient', planId: 'premium', region: 'EU' } };
  async function deliver({ id = 'evt_test_invoice', type = 'invoice.paid', object = invoice, created = 1772323200 } = {}) {
    const payload = JSON.stringify({ id, created, object: 'event', type, data: { object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
    return response.status;
  }
  return { deliver, invoice, events, sub: () => subscription, writes: () => writes, calls: () => businessCalls, resume: () => resume?.(), close: async () => { resume?.(); await new Promise(resolve => server.close(resolve)); mock.restoreAll(); } };
}

for (const fault of ['auditFailures', 'completionFailures', 'lostReplies']) test(`invoice retry after ${fault} never replenishes a consumed allowance`, async () => {
  const h = await harness({ [fault]: 1 });
  try {
    // A lost reply can be resolved immediately by the handler's strongly consistent marker read.
    assert.equal(await h.deliver(), fault === 'lostReplies' ? 200 : 503); assert.equal(h.sub().freeGpVisitsRemaining, 1);
    h.sub().freeGpVisitsRemaining = 0;
    assert.equal(await h.deliver(), 200); assert.equal(h.sub().freeGpVisitsRemaining, 0);
    assert.equal(h.writes(), 1);
  } finally { await h.close(); }
});
for (const offset of [-2678400, 0]) test(`markerless legacy cycle cannot be replenished by an invoice offset ${offset}`, async () => {
  const h = await harness({ subscription: { cycleStart: '2026-02-01T00:00:00.000Z', cycleEnd: '2026-03-01T00:00:00.000Z' } });
  try {
    const before = structuredClone(h.sub());
    assert.equal(await h.deliver({ object: { ...h.invoice, period_start: h.invoice.period_start + offset } }), 200);
    assert.deepEqual(h.sub(), before); assert.equal(h.writes(), 0);
  } finally { await h.close(); }
});
const lifecycleObject = { id: 'sub_test', status: 'active', current_period_start: 1769904000, current_period_end: 1772323200, cancel_at_period_end: false, metadata: { patientId: 'test-patient', region: 'EU' } };
for (const type of ['customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed']) {
  test(`obsolete subscription ${type} never modifies its replacement`, async () => {
    const h = await harness({ subscription: { stripeSubscriptionId: 'sub_replacement' } });
    try {
      const before = structuredClone(h.sub());
      assert.equal(await h.deliver({ type, object: type.startsWith('invoice') ? h.invoice : lifecycleObject }), 200);
      assert.deepEqual(h.sub(), before); assert.equal(h.writes(), 0);
    } finally { await h.close(); }
  });
  test(`cancelled subscription remains terminal after ${type}`, async () => {
    const h = await harness({ subscription: { status: 'cancelled' } });
    try {
      assert.equal(await h.deliver({ type, object: type.startsWith('invoice') ? h.invoice : lifecycleObject }), 200);
      assert.equal(await h.deliver({ id: 'evt_paid_after_terminal' }), 200);
      assert.equal(h.sub().status, 'cancelled'); assert.equal(h.sub().freeGpVisitsRemaining, 0); assert.equal(h.writes(), 0);
    } finally { await h.close(); }
  });
}
test('failed payment for an already paid invoice cannot regress paid state', async () => {
  const h = await harness();
  try {
    assert.equal(await h.deliver(), 200); h.sub().freeGpVisitsRemaining = 0;
    const before = structuredClone(h.sub());
    assert.equal(await h.deliver({ id: 'evt_old_failure', type: 'invoice.payment_failed' }), 200);
    assert.deepEqual(h.sub(), before);
  } finally { await h.close(); }
});
test('lifecycle updates delivered before creation retry without creating a row', async () => {
  const h = await harness({ empty: true });
  try {
    assert.equal(await h.deliver({ type: 'customer.subscription.updated', object: lifecycleObject }), 503);
    assert.equal(h.sub(), undefined);
  } finally { await h.close(); }
});
test('a superseded lifecycle worker cannot cancel a subscription', async () => {
  const h = await harness({ blockFirst: true }); let first;
  try {
    first = h.deliver({ type: 'customer.subscription.deleted', object: lifecycleObject });
    while (!h.calls()) await new Promise(resolve => setImmediate(resolve));
    h.events.get('evt_test_invoice').claimToken = 'test-replacement-worker'; h.resume();
    assert.equal(await first, 503); assert.equal(h.sub().status, 'active'); assert.equal(h.writes(), 0);
  } finally { h.resume(); await first; await h.close(); }
});
test('an older lifecycle event cannot overwrite a newer lifecycle snapshot', async () => {
  const h = await harness();
  try {
    assert.equal(await h.deliver({ id: 'evt_new_lifecycle', type: 'customer.subscription.updated', object: { ...lifecycleObject, status: 'past_due' }, created: 1772323202 }), 200);
    const before = structuredClone(h.sub());
    assert.equal(await h.deliver({ id: 'evt_older_lifecycle', type: 'customer.subscription.updated', object: lifecycleObject, created: 1772323201 }), 200);
    assert.deepEqual(h.sub(), before);
  } finally { await h.close(); }
});
test('terminal provider deletion still cancels after a newer nonterminal snapshot', async () => {
  const h = await harness();
  try {
    assert.equal(await h.deliver({ id: 'evt_recent_status', type: 'customer.subscription.updated', object: { ...lifecycleObject, status: 'past_due' }, created: 1772323202 }), 200);
    assert.equal(await h.deliver({ id: 'evt_terminal_delete', type: 'customer.subscription.deleted', object: lifecycleObject, created: 1772323201 }), 200);
    assert.equal(h.sub().status, 'cancelled'); assert.equal(h.sub().freeGpVisitsRemaining, 0);
  } finally { await h.close(); }
});
test('a lifecycle failure snapshot older than paid confirmation cannot regress active state', async () => {
  const h = await harness();
  try {
    assert.equal(await h.deliver({ created: 1772323202 }), 200);
    const before = structuredClone(h.sub());
    assert.equal(await h.deliver({ id: 'evt_status_before_paid', type: 'customer.subscription.updated', object: { ...lifecycleObject, status: 'past_due' }, created: 1772323201 }), 200);
    assert.deepEqual(h.sub(), before);
  } finally { await h.close(); }
});
test('a same-second conflicting lifecycle snapshot fails closed after paid confirmation', async () => {
  const h = await harness();
  try {
    assert.equal(await h.deliver({ created: 1772323202 }), 200);
    const before = structuredClone(h.sub());
    assert.equal(await h.deliver({ id: 'evt_status_equal_paid', type: 'customer.subscription.updated', object: { ...lifecycleObject, status: 'past_due' }, created: 1772323202 }), 503);
    assert.deepEqual(h.sub(), before);
  } finally { await h.close(); }
});
test('an earlier paid event cannot overwrite a newer lifecycle status', async () => {
  const h = await harness();
  try {
    assert.equal(await h.deliver({ id: 'evt_status_newer_paid', type: 'customer.subscription.updated', object: { ...lifecycleObject, status: 'past_due' }, created: 1772323202 }), 200);
    const before = structuredClone(h.sub());
    assert.equal(await h.deliver({ created: 1772323201 }), 503);
    assert.deepEqual(h.sub(), before);
  } finally { await h.close(); }
});
test('invoice commit cannot overwrite a lifecycle snapshot committed after its read', async () => {
  const h = await harness({ blockFirst: true }); let first;
  try {
    first = h.deliver({ created: 1772323201 });
    while (!h.calls()) await new Promise(resolve => setImmediate(resolve));
    const newer = { ...lifecycleObject, current_period_start: 1772323200, current_period_end: 1775001600 };
    assert.equal(await h.deliver({ id: 'evt_concurrent_new_cycle', type: 'customer.subscription.updated', object: newer, created: 1772323202 }), 200);
    const before = structuredClone(h.sub()); h.resume();
    assert.equal(await first, 503); assert.deepEqual(h.sub(), before); assert.equal(h.writes(), 1);
  } finally { h.resume(); await first; await h.close(); }
});
test('terminal cancelled status is not dropped because its provider period is older', async () => {
  const h = await harness({ subscription: { cycleStart: '2026-02-01T00:00:00.000Z', cycleEnd: '2026-03-01T00:00:00.000Z' } });
  try {
    assert.equal(await h.deliver({ type: 'customer.subscription.updated', object: { ...lifecycleObject, status: 'canceled', current_period_start: 1767225600, current_period_end: 1769904000 } }), 200);
    assert.equal(h.sub().status, 'cancelled');
  } finally { await h.close(); }
});
test('different event IDs for one invoice and an older invoice never reset benefits', async () => {
  const h = await harness();
  try {
    assert.equal(await h.deliver(), 200); h.sub().freeGpVisitsRemaining = 0;
    assert.equal(await h.deliver({ id: 'evt_test_duplicate' }), 200);
    assert.equal(await h.deliver({ id: 'evt_test_same_cycle', object: { ...h.invoice, id: 'in_test_same_cycle' } }), 200);
    assert.equal(await h.deliver({ id: 'evt_test_old', object: { ...h.invoice, id: 'in_test_old', period_start: h.invoice.period_start - 86400 } }), 200);
    assert.equal(h.sub().freeGpVisitsRemaining, 0); assert.equal(h.writes(), 1);
  } finally { await h.close(); }
});
test('a genuinely newer cycle grants once and ignores a proration invoice', async () => {
  const h = await harness();
  try {
    assert.equal(await h.deliver(), 200); h.sub().freeGpVisitsRemaining = 0;
    assert.equal(await h.deliver({ id: 'evt_test_proration', object: { ...h.invoice, id: 'in_test_adjustment', billing_reason: 'subscription_update', period_start: h.invoice.period_start + 1 } }), 200);
    assert.equal(h.sub().freeGpVisitsRemaining, 0);
    const next = { ...h.invoice, id: 'in_test_next', period_start: h.invoice.period_end, period_end: h.invoice.period_end + 2678400 };
    assert.equal(await h.deliver({ id: 'evt_test_next', object: next }), 200);
    assert.equal(h.sub().freeGpVisitsRemaining, 1); assert.equal(h.writes(), 2);
    h.sub().freeGpVisitsRemaining = 0;
    assert.equal(await h.deliver({ id: 'evt_test_next_duplicate', object: next }), 200);
    assert.equal(h.sub().freeGpVisitsRemaining, 0);
  } finally { await h.close(); }
});
test('a superseded worker cannot apply subscription benefits after lease takeover', async () => {
  const h = await harness({ blockFirst: true }); let first;
  try {
    first = h.deliver(); while (!h.calls()) await new Promise(resolve => setImmediate(resolve));
    h.events.get('evt_test_invoice').leaseUntil = 1;
    assert.equal(await h.deliver(), 200); h.sub().freeGpVisitsRemaining = 0;
    h.resume(); assert.equal(await first, 503);
    assert.equal(h.sub().freeGpVisitsRemaining, 0); assert.equal(h.writes(), 1);
  } finally { h.resume(); await first; await h.close(); }
});
test('a paid invoice before subscription creation retries without manufacturing a subscription', async () => {
  const h = await harness({ empty: true });
  try { assert.equal(await h.deliver(), 503); assert.equal(h.sub(), undefined); }
  finally { await h.close(); }
});
test('a late invoice cannot reactivate a cancelled subscription', async () => {
  const h = await harness({ subscription: { status: 'cancelled' } });
  try { assert.equal(await h.deliver(), 200); assert.equal(h.sub().status, 'cancelled'); assert.equal(h.writes(), 0); }
  finally { await h.close(); }
});
test('subscription creation and its replay do not grant benefits or erase family state', async () => {
  const h = await harness({ empty: true });
  const object = { id: 'sub_test', status: 'incomplete', customer: 'cus_test', current_period_start: 1769904000, current_period_end: 1772323200, metadata: { patientId: 'test-patient', planId: 'premium', region: 'EU' }, items: { data: [] } };
  try {
    assert.equal(await h.deliver({ id: 'evt_test_created', type: 'customer.subscription.created', object }), 200);
    assert.equal(h.sub().status, 'incomplete'); assert.equal(h.sub().freeGpVisitsRemaining, 0);
    assert.equal(await h.deliver(), 200); h.sub().freeGpVisitsRemaining = 0; h.sub().familyMembers = ['test-family'];
    assert.equal(await h.deliver({ id: 'evt_test_created_again', type: 'customer.subscription.created', object }), 200);
    assert.equal(h.sub().status, 'active'); assert.equal(h.sub().freeGpVisitsRemaining, 0); assert.deepEqual(h.sub().familyMembers, ['test-family']);
  } finally { await h.close(); }
});
