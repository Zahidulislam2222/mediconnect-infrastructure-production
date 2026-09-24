// Drives the real Stripe webhook handler with genuinely signed test events and an in-memory DynamoDB
// double. No provider requests: signatures are generated locally with Stripe's test-header helper.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = /^(TABLE_|DYNAMO_TABLE)/.test(match[1])
    ? `test-${match[1].toLowerCase().replaceAll('_', '-')}` : match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.DEFAULT_PHARMACY_ID = 'test-pharmacy';
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const Stripe = require('stripe');
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const notifications = require('./dist/shared/notifications.js');
const billing = require('./dist/booking-service/src/controllers/billing.controller.js');
const { TABLE_NAMES } = require('./dist/shared/settings.js');

const WEBHOOK_SECRET = 'whsec_test_secret';
const BILLS = process.env.TABLE_TRANSACTIONS, RX = process.env.TABLE_PRESCRIPTIONS;
const EVENTS = process.env.TABLE_WEBHOOK_EVENTS, INVENTORY = TABLE_NAMES.inventory;
const KEYS = { [BILLS]: ['billId'], [RX]: ['prescriptionId'], [EVENTS]: ['eventId'], [INVENTORY]: ['pharmacyId', 'drugId'] };

// Evaluates only the expression forms the webhook uses; anything else throws so it cannot silently pass.
const resolve = (path, names = {}) => path.startsWith('#') ? names[path] : path;
function holds(item, expression, names = {}, values = {}) {
  if (!expression) return true;
  return expression.split(/\s+AND\s+/).every(clause => {
    let m;
    if ((m = clause.match(/^attribute_not_exists\((\S+)\)$/))) return item?.[resolve(m[1], names)] === undefined;
    if ((m = clause.match(/^(\S+)\s+IN\s+\(([^)]*)\)$/))) return m[2].split(',').map(v => values[v.trim()]).includes(item?.[resolve(m[1], names)]);
    if ((m = clause.match(/^(\S+)\s*(=|<>|>)\s*(:\w+)$/))) {
      const left = item?.[resolve(m[1], names)], right = values[m[3]];
      return m[2] === '=' ? left === right : m[2] === '<>' ? left !== undefined && left !== right : left > right;
    }
    throw new Error(`Test double cannot evaluate condition: ${clause}`);
  });
}
function apply(item, expression, names = {}, values = {}) {
  for (const assignment of expression.replace(/^SET\s+/i, '').split(',')) {
    const [target, source] = assignment.split('=').map(s => s.trim());
    let m;
    if ((m = source.match(/^(\S+)\s*-\s*(:\w+)$/))) {
      if (typeof item[resolve(m[1], names)] !== 'number') throw Object.assign(new Error('attribute does not exist'), { name: 'ValidationException' });
      item[resolve(target, names)] = item[resolve(m[1], names)] - values[m[2]];
    } else if (/^:\w+$/.test(source)) item[resolve(target, names)] = values[source];
    else throw new Error(`Test double cannot apply update: ${assignment}`);
  }
}
const cancelled = codes => Object.assign(new Error('Transaction cancelled'), {
  name: 'TransactionCanceledException', CancellationReasons: codes.map(Code => ({ Code })) });

function harness({ rx = {}, bill = {}, failTransactions = 0, failBillReads = 0, withoutRx = false, withoutBill = false } = {}) {
  const rows = new Map();
  const key = (table, item) => `${table}|${KEYS[table].map(k => item[k]).join('|')}`;
  const put = (table, item) => rows.set(key(table, item), structuredClone(item));
  const get = (table, k) => rows.get(key(table, k));
  if (!withoutBill) put(BILLS, { billId: 'test-bill', referenceId: 'test-rx', patientId: 'test-patient', amount: 12, status: 'PENDING', type: 'PHARMACY', ...bill });
  if (!withoutRx) put(RX, { prescriptionId: 'test-rx', patientId: 'test-patient', medication: 'test-med', status: 'ISSUED', paymentStatus: 'UNPAID', ...rx });
  put(INVENTORY, { pharmacyId: 'test-pharmacy', drugId: 'test-med', stock: 5 });
  let transactionFailures = failTransactions, billReadFailures = failBillReads;
  mock.method(aws, 'getSSMParameter', async name => name.includes('webhook') ? WEBHOOK_SECRET : 'sk_test_key');
  mock.method(audit, 'writeAuditLog', async () => {});
  mock.method(notifications, 'sendNotification', async () => {});
  mock.method(billing, 'pushRevenueToBigQuery', async () => {});
  mock.method(billing, 'pushAppointmentToBigQuery', async () => {});
  mock.method(aws, 'getRegionalClient', () => ({ send: async command => {
    await new Promise(done => setImmediate(done));
    const input = command.input, kind = command.constructor.name;
    if (kind === 'GetCommand' && input.TableName === BILLS && billReadFailures > 0) {
      billReadFailures--; throw Object.assign(new Error('throttled'), { name: 'ProvisionedThroughputExceededException' });
    }
    if (kind === 'GetCommand') { const item = get(input.TableName, input.Key); return { Item: item && structuredClone(item) }; }
    if (kind === 'PutCommand') {
      if (!holds(get(input.TableName, input.Item), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues))
        throw Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
      put(input.TableName, input.Item); return {};
    }
    if (kind === 'DeleteCommand') { rows.delete(key(input.TableName, input.Key)); return {}; }
    if (kind === 'UpdateCommand') {
      const item = get(input.TableName, input.Key);
      if (!item || !holds(item, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues))
        throw Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
      apply(item, input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues); return {};
    }
    if (kind === 'TransactWriteCommand') {
      if (transactionFailures > 0) { transactionFailures--; throw cancelled(input.TransactItems.map(() => 'ThrottlingError')); }
      const staged = input.TransactItems.map(entry => {
        const [op, spec] = Object.entries(entry)[0];
        assert.equal(op, 'Update', `Unexpected transaction operation ${op}`);
        const item = get(spec.TableName, spec.Key);
        return { spec, item, ok: !!item && holds(item, spec.ConditionExpression, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues) };
      });
      if (staged.some(s => !s.ok)) throw cancelled(staged.map(s => s.ok ? 'None' : 'ConditionalCheckFailed'));
      // Validate every update before applying any, like DynamoDB does.
      const copies = staged.map(s => { const copy = structuredClone(s.item); apply(copy, s.spec.UpdateExpression, s.spec.ExpressionAttributeNames, s.spec.ExpressionAttributeValues); return copy; });
      staged.forEach((s, i) => put(s.spec.TableName, copies[i]));
      return {};
    }
    throw new Error(`Unexpected command ${kind}`);
  } }));
  const { handleStripeWebhook } = require('./dist/booking-service/src/controllers/webhook.controller.js');
  const stripe = new Stripe('sk_test_key');
  let sequence = 0;
  async function deliver(metadata = { billId: 'test-bill', patientId: 'test-patient', type: 'PHARMACY', region: 'us-east-1' }, eventId = `evt_test_${++sequence}`) {
    const payload = JSON.stringify({ id: eventId, object: 'event', type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test', object: 'payment_intent', amount: 1200, currency: 'usd', status: 'succeeded', metadata } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const result = { status: 200 };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; }, send(body) { result.body = body; return this; } };
    await handleStripeWebhook({ body: Buffer.from(payload), headers: { 'stripe-signature': signature } }, res);
    return result;
  }
  return { deliver, bill: () => get(BILLS, { billId: 'test-bill' }), rx: () => get(RX, { prescriptionId: 'test-rx' }),
    stock: () => get(INVENTORY, { pharmacyId: 'test-pharmacy', drugId: 'test-med' }).stock, events: () => [...rows.keys()].filter(k => k.startsWith(`${EVENTS}|`)) };
}

test('a bill paid through /billing/pay makes its prescription ready for pickup', async () => {
  try {
    const h = harness();
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.bill().status, 'PAID');
    assert.equal(h.rx().paymentStatus, 'PAID');
    assert.equal(h.rx().status, 'READY_FOR_PICKUP');
    assert.equal(h.stock(), 4, 'inventory is decremented once for the paid fill');
  } finally { mock.restoreAll(); }
});

test('a paid refill bill makes the PENDING refill ready for pickup', async () => {
  try {
    const h = harness({ rx: { status: 'PENDING' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.rx().status, 'READY_FOR_PICKUP');
    assert.equal(h.rx().paymentStatus, 'PAID');
  } finally { mock.restoreAll(); }
});

test('paying the refill bill of a legacy refill that still carries the previous PAID flag makes it collectable', async () => {
  try {
    const h = harness({ rx: { status: 'PENDING', paymentStatus: 'PAID' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.rx().status, 'READY_FOR_PICKUP');
    assert.equal(h.bill().reviewReason, undefined);
  } finally { mock.restoreAll(); }
});

test('a second event for an already-paid bill changes nothing', async () => {
  try {
    const h = harness();
    await h.deliver();
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.stock(), 4, 'no second inventory decrement');
    assert.equal(h.rx().status, 'READY_FOR_PICKUP');
  } finally { mock.restoreAll(); }
});

test('payment for a cancelled prescription is recorded for review and never reopens it', async () => {
  try {
    const h = harness({ rx: { status: 'CANCELLED' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.rx().status, 'CANCELLED');
    assert.equal(h.rx().paymentStatus, 'UNPAID');
    assert.equal(h.bill().status, 'PAID', 'captured money is still recorded');
    assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE');
    assert.equal(h.stock(), 5);
  } finally { mock.restoreAll(); }
});

test('a dispensed prescription is not reopened by a late payment', async () => {
  try {
    const h = harness({ rx: { status: 'DISPENSED', paymentStatus: 'PAID' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.rx().status, 'DISPENSED');
    assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE');
  } finally { mock.restoreAll(); }
});

test('a transient database failure is retried by Stripe instead of being marked processed', async () => {
  try {
    const h = harness({ failTransactions: 1 });
    assert.equal((await h.deliver(undefined, 'evt_test_retry')).status, 500);
    assert.equal(h.rx().status, 'ISSUED');
    assert.equal(h.events().length, 0, 'the event claim is released so the retry is processed');
    assert.equal((await h.deliver(undefined, 'evt_test_retry')).status, 200);
    assert.equal(h.rx().status, 'READY_FOR_PICKUP');
  } finally { mock.restoreAll(); }
});

test('a missing inventory row never blocks recording the payment', async () => {
  try {
    const h = harness({ rx: { medication: 'test-unstocked' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.rx().status, 'READY_FOR_PICKUP');
    assert.equal(h.bill().status, 'PAID');
  } finally { mock.restoreAll(); }
});

// /billing/pay sends type: bill.type || 'PHARMACY' and no referenceId; refills created before the pharmacy fix have no type.
const BILLING_PAY_METADATA = { billId: 'test-bill', patientId: 'test-patient', type: 'PHARMACY', region: 'us-east-1' };

test('paying a legacy untyped refill bill makes the refill collectable', async () => {
  try {
    const h = harness({ rx: { status: 'PENDING', paymentStatus: 'PAID' }, bill: { type: undefined } });
    assert.equal((await h.deliver(BILLING_PAY_METADATA)).status, 200);
    assert.equal(h.bill().status, 'PAID');
    assert.equal(h.rx().status, 'READY_FOR_PICKUP', 'the ledger referenceId identifies the prescription');
    assert.equal(h.stock(), 4);
  } finally { mock.restoreAll(); }
});

test('an unreadable ledger row is retried by Stripe instead of skipping the prescription', async () => {
  try {
    const h = harness({ failBillReads: 1 });
    assert.equal((await h.deliver(BILLING_PAY_METADATA, 'evt_test_read')).status, 500);
    assert.equal(h.bill().status, 'PENDING'); assert.equal(h.rx().status, 'ISSUED');
    assert.equal(h.events().length, 0);
    assert.equal((await h.deliver(BILLING_PAY_METADATA, 'evt_test_read')).status, 200);
    assert.equal(h.rx().status, 'READY_FOR_PICKUP');
  } finally { mock.restoreAll(); }
});

test('a late success event never re-opens a refunded bill', async () => {
  try {
    const h = harness({ bill: { status: 'REFUNDED' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.bill().status, 'REFUNDED');
    assert.equal(h.rx().status, 'ISSUED'); assert.equal(h.rx().paymentStatus, 'UNPAID');
    assert.equal(h.stock(), 5);
  } finally { mock.restoreAll(); }
});

test('payment captured while the prescription was being cancelled is recorded for review', async () => {
  try {
    const h = harness({ rx: { status: 'CANCELLED' }, bill: { status: 'CANCELLED' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.bill().status, 'PAID', 'captured money is still recorded');
    assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE');
    assert.equal(h.rx().status, 'CANCELLED');
  } finally { mock.restoreAll(); }
});

test('a ledger reference to a missing prescription is flagged, never created', async () => {
  try {
    const h = harness({ withoutRx: true });
    assert.equal((await h.deliver(BILLING_PAY_METADATA)).status, 200);
    assert.equal(h.bill().status, 'PAID');
    assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE');
    assert.equal(h.rx(), undefined);
  } finally { mock.restoreAll(); }
});

test('a payment whose bill row is gone is recorded for reconciliation instead of failing forever', async () => {
  try {
    const h = harness({ withoutBill: true });
    assert.equal((await h.deliver(BILLING_PAY_METADATA)).status, 200);
    assert.equal(h.bill().status, 'PAID');
    assert.equal(h.bill().reviewReason, 'LEDGER_ROW_MISSING');
    assert.equal(h.bill().paymentIntentId, 'pi_test');
    assert.equal(h.bill().amountMinor, 1200);
    assert.equal(h.rx().status, 'ISSUED', 'nothing is released without a bill');
    assert.equal((await h.deliver(BILLING_PAY_METADATA)).status, 200, 'a later event for the same bill is a no-op');
    assert.equal(h.rx().status, 'ISSUED');
  } finally { mock.restoreAll(); }
});
