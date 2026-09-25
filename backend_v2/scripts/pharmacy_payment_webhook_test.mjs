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
const logger = require('./dist/shared/logger.js');
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

function harness({ rx = {}, bill = {}, failTransactions = 0, failBillReads = 0, withoutRx = false, withoutBill = false, failBillPuts = 0, beforeBillPut,
  beforeConditionCheck, otherBills = [], billPageSize = Infinity, beforeFlag } = {}) {
  const rows = new Map();
  const key = (table, item) => `${table}|${KEYS[table].map(k => item[k]).join('|')}`;
  const put = (table, item) => rows.set(key(table, item), structuredClone(item));
  const get = (table, k) => rows.get(key(table, k));
  if (!withoutBill) put(BILLS, { billId: 'test-bill', referenceId: 'test-rx', patientId: 'test-patient', amount: 12, status: 'PENDING', type: 'PHARMACY', ...bill });
  if (!withoutRx) put(RX, { prescriptionId: 'test-rx', patientId: 'test-patient', medication: 'test-med', status: 'ISSUED', paymentStatus: 'UNPAID', ...rx });
  for (const other of otherBills) put(BILLS, { referenceId: 'test-rx', patientId: 'test-patient', amount: 12, type: 'PHARMACY', ...other });
  put(INVENTORY, { pharmacyId: 'test-pharmacy', drugId: 'test-med', stock: 5 });
  let transactionFailures = failTransactions, billReadFailures = failBillReads, billPutFailures = failBillPuts;
  mock.method(aws, 'getSSMParameter', async name => name.includes('webhook') ? WEBHOOK_SECRET : 'sk_test_key');
  const effects = { audit: mock.method(audit, 'writeAuditLog', async () => {}), notify: mock.method(notifications, 'sendNotification', async () => {}),
    revenue: mock.method(billing, 'pushRevenueToBigQuery', async () => {}), errors: mock.method(logger, 'safeError', () => {}) };
  mock.method(billing, 'pushAppointmentToBigQuery', async () => {});
  mock.method(aws, 'getRegionalClient', () => ({ send: async command => {
    await new Promise(done => setImmediate(done));
    const input = command.input, kind = command.constructor.name;
    if (kind === 'GetCommand' && input.TableName === BILLS && billReadFailures > 0) {
      billReadFailures--; throw Object.assign(new Error('throttled'), { name: 'ProvisionedThroughputExceededException' });
    }
    if (kind === 'GetCommand') { const item = get(input.TableName, input.Key); return { Item: item && structuredClone(item) }; }
    // The only query the webhook may run: a patient's bills for one prescription, read page by page.
    if (kind === 'QueryCommand') {
      assert.equal(input.TableName, BILLS); assert.equal(input.IndexName, 'PatientIndex');
      assert.equal(input.KeyConditionExpression, 'patientId = :pid'); assert.equal(input.FilterExpression, 'referenceId = :rid');
      // DynamoDB rejects a key condition without a value, so a query for a missing patient id would fail the delivery.
      if (typeof input.ExpressionAttributeValues[':pid'] !== 'string') throw Object.assign(new Error('invalid key'), { name: 'ValidationException' });
      // The index is eventually consistent: indexedPatientId is where it still lists a bill, hiddenFromIndex one it has not seen.
      const matches = [...rows.entries()].filter(([k, item]) => k.startsWith(`${BILLS}|`) && !item.hiddenFromIndex
        && (item.indexedPatientId ?? item.patientId) === input.ExpressionAttributeValues[':pid'])
        .sort(([a], [b]) => a.localeCompare(b));
      const start = input.ExclusiveStartKey?.offset ?? 0, end = Math.min(start + billPageSize, matches.length);
      return { Items: matches.slice(start, end).map(([, item]) => item).filter(item => item.referenceId === input.ExpressionAttributeValues[':rid'])
        .map(item => structuredClone(item)), LastEvaluatedKey: end < matches.length ? { offset: end } : undefined };
    }
    if (kind === 'PutCommand') {
      if (input.TableName === BILLS && billPutFailures > 0) {
        billPutFailures--; throw Object.assign(new Error('throttled'), { name: 'ProvisionedThroughputExceededException' });
      }
      if (input.TableName === BILLS && beforeBillPut) { const competing = beforeBillPut; beforeBillPut = undefined; competing(put); }
      if (!holds(get(input.TableName, input.Item), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues))
        throw Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
      put(input.TableName, input.Item); return {};
    }
    if (kind === 'DeleteCommand') { rows.delete(key(input.TableName, input.Key)); return {}; }
    if (kind === 'UpdateCommand') {
      if (beforeFlag && input.TableName === BILLS && input.ExpressionAttributeValues?.[':reason']) {
        const competing = beforeFlag; beforeFlag = undefined; competing(get(BILLS, { billId: 'test-bill' }));
      }
      const item = get(input.TableName, input.Key);
      if (!item || !holds(item, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues))
        throw Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
      apply(item, input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues); return {};
    }
    if (kind === 'TransactWriteCommand') {
      if (transactionFailures > 0) { transactionFailures--; throw cancelled(input.TransactItems.map(() => 'ThrottlingError')); }
      // Runs once, before a transaction that checks a row without writing it, to model a competing writer.
      if (beforeConditionCheck && input.TransactItems.some(entry => entry.ConditionCheck)) {
        const competing = beforeConditionCheck; beforeConditionCheck = undefined;
        competing(get(RX, { prescriptionId: 'test-rx' }), get(BILLS, { billId: 'test-bill' }));
      }
      const staged = input.TransactItems.map(entry => {
        const [op, spec] = Object.entries(entry)[0];
        assert.ok(op === 'Update' || op === 'ConditionCheck', `Unexpected transaction operation ${op}`);
        const item = get(spec.TableName, spec.Key);
        return { op, spec, item, ok: !!item && holds(item, spec.ConditionExpression, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues) };
      });
      if (staged.some(s => !s.ok)) throw cancelled(staged.map(s => s.ok ? 'None' : 'ConditionalCheckFailed'));
      // Validate every update before applying any, like DynamoDB does. A ConditionCheck writes nothing.
      const writes = staged.filter(s => s.op === 'Update');
      const copies = writes.map(s => { const copy = structuredClone(s.item); apply(copy, s.spec.UpdateExpression, s.spec.ExpressionAttributeNames, s.spec.ExpressionAttributeValues); return copy; });
      writes.forEach((s, i) => put(s.spec.TableName, copies[i]));
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
  return { deliver, effects, bill: () => get(BILLS, { billId: 'test-bill' }), other: billId => get(BILLS, { billId }), rx: () => get(RX, { prescriptionId: 'test-rx' }),
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

test('concurrent deliveries for a missing bill row record it once and both succeed, without re-storing the patient', async () => {
  try {
    const h = harness({ withoutBill: true });
    const results = await Promise.all([h.deliver(BILLING_PAY_METADATA), h.deliver(BILLING_PAY_METADATA)]);
    assert.deepEqual(results.map(r => r.status), [200, 200], 'R4-3: the losing reconciliation write is not a failure');
    assert.equal(h.bill().reviewReason, 'LEDGER_ROW_MISSING');
    // Erasure anonymises ledger rows; a reconciliation row must not re-attach an identifier from payment metadata.
    assert.equal(h.bill().patientId, undefined, 'R4-4: reconciliation row carries the payment reference only');
    assert.equal(h.rx().status, 'ISSUED');
  } finally { mock.restoreAll(); }
});

test('a reconciliation write is only treated as done when the row that exists records this payment', async () => {
  try {
    const throttled = harness({ withoutBill: true, failBillPuts: 1 });
    assert.equal((await throttled.deliver(BILLING_PAY_METADATA)).status, 500, 'V5: a failed write is retried by Stripe, not acknowledged');
    assert.equal(throttled.bill(), undefined);
    mock.restoreAll();
    const other = harness({ withoutBill: true, beforeBillPut: put => put(BILLS, { billId: 'test-bill', status: 'PAID', paymentIntentId: 'pi_other' }) });
    assert.equal((await other.deliver(BILLING_PAY_METADATA)).status, 500, 'V5: a row recording a different payment is not this payment');
    assert.equal(other.bill().paymentIntentId, 'pi_other');
  } finally { mock.restoreAll(); }
});

// A25: the retired pharmacy service issued pickup codes without checking payment, so a collected fill can still carry
// its unpaid first bill. Paying that debt settles it; it is not money for a fill that can no longer be collected.
test('paying the unpaid bill of an already-collected fill settles it without reopening the fill', async () => {
  for (const [label, rx] of [
    ['legacy pickup', { status: 'PICKED_UP', fulfilledAt: '2026-01-05T00:00:00Z' }],
    ['dispensed', { status: 'DISPENSED', dispensedAt: '2026-01-05T00:00:00Z' }],
    ['latest of two hand-overs', { status: 'DISPENSED', dispensedAt: '2026-01-02T00:00:00Z', fulfilledAt: '2026-01-05T00:00:00Z' }],
  ]) {
    try {
      const h = harness({ rx, bill: { createdAt: '2026-01-03T00:00:00Z' } });
      const before = structuredClone(h.rx());
      assert.equal((await h.deliver()).status, 200, label);
      assert.equal(h.bill().status, 'PAID', label);
      assert.equal(h.bill().paymentIntentId, 'pi_test', label);
      assert.equal(h.bill().reviewReason, undefined, `${label}: a settled debt is not a refund case`);
      assert.deepEqual(h.rx(), before, `${label}: the collected fill is unchanged`);
      assert.equal(h.stock(), 5, `${label}: nothing is dispensed twice`);
    } finally { mock.restoreAll(); }
  }
});

test('payment that is not a debt for a collected fill is still flagged for refund review', async () => {
  const collected = { status: 'DISPENSED', dispensedAt: '2026-01-05T00:00:00Z' };
  for (const [label, options] of [
    ['bill created after the hand-over', { rx: collected, bill: { createdAt: '2026-01-06T00:00:00Z' } }],
    ['undated bill', { rx: collected }],
    ['no hand-over recorded', { rx: { status: 'DISPENSED' }, bill: { createdAt: '2026-01-03T00:00:00Z' } }],
    ['refill requested on the collected fill', { rx: { ...collected, status: 'REFILL_REQUESTED' }, bill: { createdAt: '2026-01-03T00:00:00Z' } }],
    ['cancelled prescription', { rx: { ...collected, cancelledAt: '2026-01-06T00:00:00Z' }, bill: { createdAt: '2026-01-03T00:00:00Z' } }],
    ['prescription changed before the write', { rx: collected, bill: { createdAt: '2026-01-03T00:00:00Z' },
      beforeConditionCheck: rx => { rx.status = 'REFILL_REQUESTED'; } }],
    ['hand-over re-dated before the write', { rx: collected, bill: { createdAt: '2026-01-03T00:00:00Z' },
      beforeConditionCheck: rx => { rx.dispensedAt = '2026-01-07T00:00:00Z'; } }],
  ]) {
    try {
      const h = harness(options);
      assert.equal((await h.deliver()).status, 200, label);
      assert.equal(h.bill().status, 'PAID', `${label}: captured money is still recorded`);
      assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE', label);
      assert.equal(h.stock(), 5, label);
    } finally { mock.restoreAll(); }
  }
});

test('a debt refunded or paid before the settlement is written is never paid over', async () => {
  for (const status of ['REFUNDED', 'PAID']) {
    try {
      const h = harness({ rx: { status: 'DISPENSED', dispensedAt: '2026-01-05T00:00:00Z' }, bill: { createdAt: '2026-01-03T00:00:00Z' },
        beforeConditionCheck: (_rx, bill) => { bill.status = status; bill.paymentIntentId = 'pi_other'; } });
      assert.equal((await h.deliver()).status, 200, status);
      assert.equal(h.bill().status, status, `${status}: left as the competing writer set it`);
      assert.equal(h.bill().paymentIntentId, 'pi_other', `${status}: not overwritten by this payment`);
      assert.equal(h.bill().reviewReason, undefined, status);
    } finally { mock.restoreAll(); }
  }
});

// A31: a pre-hand-over bill is the fill's debt only when it is the prescription's ONLY payable bill from before the
// hand-over; anything else cannot be told apart from a double bill, so the payment goes to refund review.
test('a debt is settled only when it is the single payable bill from before the hand-over', async () => {
  const collected = { status: 'DISPENSED', dispensedAt: '2026-01-05T00:00:00Z' };
  const debt = { createdAt: '2026-01-03T00:00:00Z' };
  for (const [label, options] of [
    ['a second unpaid bill before the hand-over', { otherBills: [{ billId: 'test-bill-2', status: 'PENDING', createdAt: '2026-01-02T00:00:00Z' }] }],
    ['the second bill on a later page', { billPageSize: 1, otherBills: [{ billId: 'test-bill-9', status: 'UNPAID', createdAt: '2026-01-04T00:00:00Z' }] }],
    ['an undated payable bill', { otherBills: [{ billId: 'test-bill-2', status: 'PENDING' }] }],
    ['a bill belonging to another patient', { bill: { ...debt, patientId: 'test-other-patient' } }],
    ['a prescription without a patient', { rx: { ...collected, patientId: undefined } }],
  ]) {
    try {
      const h = harness({ rx: collected, bill: debt, ...options });
      assert.equal((await h.deliver()).status, 200, label);
      assert.equal(h.bill().status, 'PAID', `${label}: captured money is still recorded`);
      assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE', label);
      assert.equal(h.stock(), 5, label);
    } finally { mock.restoreAll(); }
  }
  for (const [label, otherBills] of [
    ['an earlier PAID bill', [{ billId: 'test-bill-0', status: 'PAID', createdAt: '2026-01-01T00:00:00Z' }]],
    ['an unpaid bill after the hand-over', [{ billId: 'test-bill-2', status: 'PENDING', createdAt: '2026-01-06T00:00:00Z' }]],
    ['a bill of another prescription', [{ billId: 'test-bill-x', referenceId: 'test-rx-other', status: 'PENDING', createdAt: '2026-01-02T00:00:00Z' }]],
  ]) {
    try {
      const h = harness({ rx: collected, bill: debt, otherBills, billPageSize: 1 });
      assert.equal((await h.deliver()).status, 200, label);
      assert.equal(h.bill().status, 'PAID', label);
      assert.equal(h.bill().reviewReason, undefined, `${label}: still a settled debt`);
    } finally { mock.restoreAll(); }
  }
});

// A34: settling a debt is a real payment, so it is audited, counted as revenue and confirmed to the patient.
test('a settled debt gets the same audit, revenue and notification as any payment, and no stock movement', async () => {
  try {
    const h = harness({ rx: { status: 'PICKED_UP', fulfilledAt: '2026-01-05T00:00:00Z' }, bill: { createdAt: '2026-01-03T00:00:00Z' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.bill().reviewReason, undefined);
    assert.equal(h.effects.revenue.mock.callCount(), 1, 'revenue recorded');
    assert.ok(h.effects.audit.mock.calls.some(call => call.arguments[2] === 'PAYMENT_SUCCESS'), 'payment audited');
    assert.equal(h.effects.notify.mock.callCount(), 1, 'patient notified');
    assert.equal(h.stock(), 5, 'nothing dispensed');
  } finally { mock.restoreAll(); }
});

// A38: a payment whose bill another writer settled first is not a refund case, and the log must not say it is.
test('a flag write that finds the bill already settled is skipped without a refund-review alarm', async () => {
  try {
    const h = harness({ rx: { status: 'DISPENSED', cancelledAt: '2026-01-06T00:00:00Z' }, bill: { createdAt: '2026-01-03T00:00:00Z' },
      beforeFlag: bill => { bill.status = 'PAID'; bill.paymentIntentId = 'pi_other'; } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.bill().paymentIntentId, 'pi_other');
    assert.equal(h.bill().reviewReason, undefined);
    assert.ok(!h.effects.errors.mock.calls.some(call => /refund review required/.test(String(call.arguments[0]))), 'no false alarm');
  } finally { mock.restoreAll(); }
});

// Ninth review. A31: a bill already flagged for review is still a bill from before the hand-over, so paying another one
// is not the fill's single debt. A40: the guards that tell the paid bill from another debt are exercised.
test('a flagged, cancelled or unindexed bill from before the hand-over still blocks settlement', async () => {
  const collected = { status: 'DISPENSED', dispensedAt: '2026-01-05T00:00:00Z' };
  const debt = { createdAt: '2026-01-03T00:00:00Z' };
  for (const [label, options] of [
    ['a bill already flagged for refund review', { otherBills: [{ billId: 'test-bill-2', status: 'PAID', reviewReason: 'PRESCRIPTION_NOT_PAYABLE', createdAt: '2026-01-02T00:00:00Z' }] }],
    ['a cancelled bill', { otherBills: [{ billId: 'test-bill-2', status: 'CANCELLED', createdAt: '2026-01-02T00:00:00Z' }] }],
    ['the paid bill missing from the index while another debt is listed', { bill: { ...debt, hiddenFromIndex: true },
      otherBills: [{ billId: 'test-bill-2', status: 'UNPAID', createdAt: '2026-01-02T00:00:00Z' }] }],
  ]) {
    try {
      const h = harness({ rx: collected, bill: debt, ...options });
      assert.equal((await h.deliver()).status, 200, label);
      assert.equal(h.bill().status, 'PAID', `${label}: captured money is still recorded`);
      assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE', label);
    } finally { mock.restoreAll(); }
  }
});

// A39: the patient match is read from the bill itself, never inferred from an index that may still list an erased bill.
test('a bill whose own record names another patient is flagged even while the index still lists it', async () => {
  try {
    const h = harness({ rx: { status: 'DISPENSED', dispensedAt: '2026-01-05T00:00:00Z' },
      bill: { createdAt: '2026-01-03T00:00:00Z', patientId: 'test-erased-patient', indexedPatientId: 'test-patient' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE');
  } finally { mock.restoreAll(); }
});

// A41 (tenth review F2): a bill already under refund review is never settled as a collected-fill debt, even when a
// later payment_failed event has made it look payable again.
test('a paid bill already under refund review is flagged again, never settled as a debt', async () => {
  try {
    const h = harness({ rx: { status: 'DISPENSED', dispensedAt: '2026-01-05T00:00:00Z' },
      bill: { status: 'FAILED', reviewReason: 'PRESCRIPTION_NOT_PAYABLE', createdAt: '2026-01-03T00:00:00Z' } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE');
    assert.equal(h.effects.revenue.mock.callCount(), 0, 'not recorded as a settled debt');
    assert.equal(h.effects.notify.mock.callCount(), 0, 'patient not told the debt is settled');
  } finally { mock.restoreAll(); }
});

test('a bill flagged for refund review after it was read is never settled as a debt', async () => {
  try {
    const h = harness({ rx: { status: 'DISPENSED', dispensedAt: '2026-01-05T00:00:00Z' }, bill: { createdAt: '2026-01-03T00:00:00Z' },
      beforeConditionCheck: (_rx, bill) => { bill.reviewReason = 'PRESCRIPTION_NOT_PAYABLE'; } });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.bill().reviewReason, 'PRESCRIPTION_NOT_PAYABLE');
    assert.equal(h.effects.revenue.mock.callCount(), 0, 'not recorded as a settled debt');
  } finally { mock.restoreAll(); }
});
