// S3/S7 (memory/safe-followups-acceptance-20260925.md): the Stripe refund webhooks tell the patient only what is true
// and hand a failed appointment refund to a person. Genuinely signed local test events and an in-memory DynamoDB
// double; no provider requests.
import { test, mock, afterEach } from 'node:test';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = /^(TABLE_|DYNAMO_TABLE)/.test(match[1])
    ? `test-${match[1].toLowerCase().replaceAll('_', '-')}` : match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
// DYNAMO_TABLE names a different table in each service; the booking webhook must not depend on it (R5).
delete process.env.DYNAMO_TABLE;
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const Stripe = require('stripe');
const express = require('express');
const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const notifications = require('./dist/shared/notifications.js');
const billing = require('./dist/booking-service/src/controllers/billing.controller.js');
const logger = require('./dist/shared/logger.js');
const kms = require('./dist/shared/kms-crypto.js');
const { REFUND_NOTICES } = require('./dist/booking-service/src/content/cancellation.js');

const WEBHOOK_SECRET = 'whsec_test_secret';
const APPOINTMENTS = process.env.TABLE_APPOINTMENTS, BILLS = process.env.TABLE_TRANSACTIONS, EVENTS = process.env.TABLE_WEBHOOK_EVENTS;
// The patient's contact email lives only on the patient profile (TABLE_PATIENTS), KMS-encrypted by the patient service.
const PATIENTS = process.env.TABLE_PATIENTS;
const KEYS = { [APPOINTMENTS]: ['appointmentId'], [BILLS]: ['billId'], [EVENTS]: ['eventId'], [PATIENTS]: ['patientId'] };
const STORED_EMAIL = 'phi:kms:patient@example.test', PATIENT_EMAIL = 'patient@example.test';

// Evaluates only the expression forms these handlers use; anything else throws so it cannot silently pass.
const resolve = (path, names = {}) => path.startsWith('#') ? names[path] : path;
function holds(item, expression, names = {}, values = {}) {
  if (!expression) return true;
  return expression.split(/\s+AND\s+/).every(clause => {
    let m;
    if ((m = clause.match(/^attribute_not_exists\((\S+)\)$/))) return item?.[resolve(m[1], names)] === undefined;
    if ((m = clause.match(/^(\S+)\s*=\s*(:\w+)$/))) return item !== undefined && item[resolve(m[1], names)] === values[m[2]];
    throw new Error(`Test double cannot evaluate condition: ${clause}`);
  });
}
/** Real DynamoDB rejects expression placeholders that the expressions do not use. */
function assertPlaceholdersUsed(spec) {
  const text = [spec.UpdateExpression, spec.ConditionExpression].filter(Boolean).join(' ');
  for (const name of Object.keys(spec.ExpressionAttributeNames ?? {})) assert.ok(text.includes(name), `unused name ${name}`);
  for (const value of Object.keys(spec.ExpressionAttributeValues ?? {})) assert.ok(new RegExp(`${value}(?!\\w)`).test(text), `unused value ${value}`);
}
function apply(item, expression, names = {}, values = {}) {
  for (const assignment of expression.replace(/^SET\s+/i, '').split(',')) {
    const [target, source] = assignment.split('=').map(s => s.trim());
    if (!/^:\w+$/.test(source)) throw new Error(`Test double cannot apply update: ${assignment}`);
    item[resolve(target, names)] = structuredClone(values[source]);
  }
}
const cancelled = codes => Object.assign(new Error('Transaction cancelled'), {
  name: 'TransactionCanceledException', CancellationReasons: codes.map(Code => ({ Code })) });

function harness({ appointment = {}, refundRow = {}, withoutRefundRow = false, failTransactions = 0, withoutPatientEmail = false, failDecrypt = false, chargeBill = {} } = {}) {
  const rows = new Map();
  const key = (table, item) => `${table}|${KEYS[table].map(k => item[k]).join('|')}`;
  const put = (table, item) => rows.set(key(table, item), structuredClone(item));
  const get = (table, k) => rows.get(key(table, k));
  if (!withoutPatientEmail) put(PATIENTS, { patientId: 'test-patient', name: 'phi:kms:Test Patient', email: STORED_EMAIL });
  put(APPOINTMENTS, { appointmentId: 'test-apt', patientId: 'test-patient', status: 'REFUNDED',
    refundId: 're_test_1', refundStatus: 'ISSUED', ...appointment });
  if (!withoutRefundRow) put(BILLS, { billId: 'refund-test-apt', referenceId: 'test-apt', type: 'REFUND', amount: -50, status: 'PROCESSED',
    refundId: 're_test_1', refundStatus: 'ISSUED', ...refundRow });
  put(BILLS, { billId: 'test-bill', type: 'BOOKING_FEE', referenceId: 'test-apt', status: 'PAID', ...chargeBill });
  let transactionFailures = failTransactions;
  const regions = [], notices = [];
  mock.method(aws, 'getSSMParameter', async name => name.includes('webhook') ? WEBHOOK_SECRET : 'sk_test_key');
  const effects = { audit: mock.method(audit, 'writeAuditLog', async () => {}), errors: mock.method(logger, 'safeError', () => {}) };
  mock.method(billing, 'pushRevenueToBigQuery', async () => {});
  mock.method(billing, 'pushAppointmentToBigQuery', async () => {});
  mock.method(notifications, 'sendNotification', async notice => { notices.push(notice); });
  const decrypts = mock.method(kms, 'decryptPHI', async (fields, region) => {
    if (failDecrypt) throw new Error('KMS unavailable');
    assert.equal(region, 'EU', 'decrypted with the refund region key');
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v).replace(/^phi:kms:/, '')]));
  });
  mock.method(aws, 'getRegionalClient', selected => { regions.push(selected); return { send: async command => {
    await new Promise(done => setImmediate(done));
    const input = command.input, kind = command.constructor.name;
    if (kind === 'GetCommand') { const item = get(input.TableName, input.Key); return { Item: item && structuredClone(item) }; }
    if (kind === 'PutCommand') {
      if (!holds(get(input.TableName, input.Item), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues))
        throw Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
      put(input.TableName, input.Item); return {};
    }
    if (kind === 'UpdateCommand' && input.TableName === EVENTS) {
      const item = get(EVENTS, input.Key);
      if (!item || !holds(item, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues))
        throw Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
      apply(item, input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues); return {};
    }
    if (kind === 'DeleteCommand') { rows.delete(key(input.TableName, input.Key)); return {}; }
    if (kind === 'TransactWriteCommand') {
      if (transactionFailures > 0) { transactionFailures--; throw cancelled(input.TransactItems.map(() => 'ThrottlingError')); }
      const staged = input.TransactItems.map(entry => {
        const [op, spec] = Object.entries(entry)[0];
        assert.equal(op, 'Update', `Unexpected transaction operation ${op}`);
        assertPlaceholdersUsed(spec);
        const item = get(spec.TableName, spec.Key);
        // A conditional update of a missing item fails; an unconditional one creates it, like DynamoDB.
        return { spec, item, ok: spec.ConditionExpression ? !!item && holds(item, spec.ConditionExpression, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues) : true };
      });
      if (staged.some(s => !s.ok)) throw cancelled(staged.map(s => s.ok ? 'None' : 'ConditionalCheckFailed'));
      for (const s of staged) {
        const next = s.item ? structuredClone(s.item) : { ...s.spec.Key };
        apply(next, s.spec.UpdateExpression, s.spec.ExpressionAttributeNames, s.spec.ExpressionAttributeValues);
        put(s.spec.TableName, next);
      }
      return {};
    }
    throw new Error(`Unexpected command ${kind}`);
  } }; });
  const { handleStripeWebhook } = require('./dist/booking-service/src/controllers/webhook.controller.js');
  const app = express();
  app.post('/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
    Promise.resolve(handleStripeWebhook(req, res)).catch(next);
  });
  const server = app.listen(0, '127.0.0.1');
  const listening = once(server, 'listening');
  servers.push(server);

  const stripe = new Stripe('sk_test_key');
  let sequence = 0;
  async function deliver(type, object, eventId = `evt_test_${++sequence}`) {
    const payload = JSON.stringify({ id: eventId, object: 'event', type, data: { object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    await listening;
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload,
    });
    return { status: response.status, body: await response.text() };
  }
  return { chargeBill: () => get(BILLS, { billId: 'test-bill' }), deliver, effects, notices, regions, decrypts, apt: () => get(APPOINTMENTS, { appointmentId: 'test-apt' }), refundRow: () => get(BILLS, { billId: 'refund-test-apt' }) };
}

// EU differs from the default AWS_REGION, so routing by the refund's own metadata is what these tests observe.
const failedRefund = (overrides = {}) => ({ id: 're_test_1', object: 'refund', status: 'failed', failure_reason: 'expired_or_canceled_card',
  payment_intent: 'pi_test', amount: 5000, currency: 'usd', metadata: { appointmentRefund: 'test-apt', region: 'EU' }, ...overrides });

// S3: charge.refunded can arrive while the card refund is still pending, so the patient is never told it was processed.
test('a charge.refunded notice says a refund was requested, never that it was processed', async () => {
  try {
    const h = harness();
    const charge = { id: 'ch_test', object: 'charge', amount_refunded: 5000,
      metadata: { appointmentId: 'test-apt', patientId: 'test-patient', billId: 'test-bill', region: 'EU' } };
    assert.equal((await h.deliver('charge.refunded', charge)).status, 200);
    assert.equal(h.notices.length, 1);
    assert.equal(h.notices[0].recipientEmail, PATIENT_EMAIL, 'sent to the decrypted email on the patient profile');
    const text = `${h.notices[0].subject} ${h.notices[0].message}`;
    assert.doesNotMatch(text, /processed|succeeded|completed|successful/i, text);
    assert.match(h.notices[0].message, /requested/i);
    assert.match(h.notices[0].message, /\$50\.00/);
  } finally { mock.restoreAll(); }
});

// S7b: a failed refund returns the money to the merchant balance, so the records and the patient must say a person
// will refund it.
test('refund.failed hands our appointment refund to a person and tells the patient', async () => {
  try {
    const h = harness();
    assert.equal((await h.deliver('refund.failed', failedRefund())).status, 200);
    assert.equal(h.apt().refundStatus, 'REQUIRES_MANUAL_REFUND');
    assert.equal(h.apt().status, 'REFUNDED', 'the appointment status itself is left alone');
    assert.equal(h.refundRow().status, 'FAILED_REQUIRES_MANUAL_REFUND');
    assert.equal(h.refundRow().refundStatus, 'REQUIRES_MANUAL_REFUND');
    assert.equal(h.notices.length, 1);
    assert.equal(h.notices[0].message, REFUND_NOTICES.REQUIRES_MANUAL_REFUND);
    assert.equal(h.notices[0].recipientEmail, PATIENT_EMAIL, 'sent to the decrypted email on the patient profile');
    assert.deepEqual([...new Set(h.regions)], ['EU']);
  } finally { mock.restoreAll(); }
});

test('refund.failed that does not match the recorded appointment refund changes nothing and is logged', async () => {
  for (const [label, options, refund] of [
    ['another refund id', {}, failedRefund({ id: 're_test_other' })],
    ['refund row records another refund', { refundRow: { refundId: 're_test_other' } }, failedRefund()],
    ['no refund row', { withoutRefundRow: true }, failedRefund()],
    ['not an appointment refund', {}, failedRefund({ metadata: { region: 'EU' } })],
    ['database unavailable', { failTransactions: 1 }, failedRefund()],
  ]) {
    try {
      const h = harness(options);
      assert.equal((await h.deliver('refund.failed', refund)).status, options.failTransactions || options.withoutRefundRow ? 503 : 200, label);
      assert.equal(h.apt().refundStatus, 'ISSUED', label);
      if (!options.withoutRefundRow) assert.equal(h.refundRow().status, 'PROCESSED', label);
      assert.equal(h.notices.length, 0, label);
      assert.ok(h.effects.errors.mock.calls.some(call => /manual/i.test(String(call.arguments[0]))), `${label}: logged for manual follow-up`);
    } finally { mock.restoreAll(); }
  }
});

test('refund.failed without a patient email still records the manual refund and logs the missed notice', async () => {
  try {
    const h = harness({ withoutPatientEmail: true });
    assert.equal((await h.deliver('refund.failed', failedRefund())).status, 200);
    assert.equal(h.apt().refundStatus, 'REQUIRES_MANUAL_REFUND');
    assert.equal(h.notices.length, 0);
    assert.ok(h.effects.errors.mock.calls.some(call => /test-apt.*not notified/i.test(String(call.arguments[0]))), 'missed notice logged');
  } finally { mock.restoreAll(); }
});

test('a throttled refund.failed write logs its cause and redelivery records the refund', async () => {
  try {
    const h = harness({ failTransactions: 1 });
    assert.equal((await h.deliver('refund.failed', failedRefund(), 'evt_test_retry')).status, 503);
    assert.equal(h.apt().refundStatus, 'ISSUED');
    assert.equal((await h.deliver('refund.failed', failedRefund(), 'evt_test_retry')).status, 200);
    assert.equal(h.apt().refundStatus, 'REQUIRES_MANUAL_REFUND');
    assert.ok(h.effects.errors.mock.calls.some(call => /ThrottlingError/.test(String(call.arguments[0]))), 'reason codes logged');
  } finally { mock.restoreAll(); }
});

// R5: the profile email is KMS ciphertext; a notice must never go to it, and a decrypt failure must not throw.
test('a refund notice is never sent to the stored ciphertext, and a decrypt failure is logged', async () => {
  const charge = { id: 'ch_test', object: 'charge', amount_refunded: 5000,
    metadata: { appointmentId: 'test-apt', patientId: 'test-patient', billId: 'test-bill', region: 'EU' } };
  for (const [label, type, object] of [['charge.refunded', 'charge.refunded', charge], ['refund.failed', 'refund.failed', failedRefund()]]) {
    try {
      const h = harness({ failDecrypt: true });
      assert.equal((await h.deliver(type, object)).status, 200, label);
      assert.ok(h.decrypts.mock.callCount() >= 1, `${label}: the stored email was decrypted`);
      assert.equal(h.notices.length, 0, `${label}: no notice to an undecrypted address`);
      assert.ok(h.effects.errors.mock.calls.some(call => /not notified|notice.*failed|follow-up.*failed/i.test(String(call.arguments[0]))), `${label}: logged`);
      if (type === 'refund.failed') assert.equal(h.apt().refundStatus, 'REQUIRES_MANUAL_REFUND', 'the manual refund is still recorded');
    } finally { mock.restoreAll(); }
  }
});

test('charge.refunded database failure is retried without sending an unrecorded refund notice', async () => {
  try {
    const h = harness({ failTransactions: 1 });
    const charge = { id: 'ch_test', amount_refunded: 5000, metadata: { appointmentId: 'test-apt', patientId: 'test-patient', region: 'EU' } };
    assert.equal((await h.deliver('charge.refunded', charge, 'evt_test_charge_retry')).status, 503);
    assert.equal(h.notices.length, 0);
    assert.equal((await h.deliver('charge.refunded', charge, 'evt_test_charge_retry')).status, 200);
    assert.equal(h.notices.length, 1);
  } finally { mock.restoreAll(); }
});

test('a late full refund preserves the cancellation reason and lifecycle', async () => {
  for (const status of ['CANCELLED', 'CANCELLED_NO_SHOW', 'CANCELLED_DOCTOR_FAULT']) {
    try {
      const h = harness({ appointment: { status } });
      assert.equal((await h.deliver('charge.refunded', { id: 'ch_test', amount: 5000, amount_refunded: 5000, refunded: true,
        metadata: { appointmentId: 'test-apt', patientId: 'test-patient', region: 'EU' } })).status, 200);
      assert.equal(h.apt().status, status);
      assert.equal(h.apt().paymentStatus, 'refunded');
    } finally { mock.restoreAll(); }
  }
});

test('refund.updated records provider completion without reopening a cancelled appointment', async () => {
  for (const type of ['refund.updated', 'charge.refund.updated']) {
    try {
      const h = harness({ appointment: { status: 'CANCELLED', refundStatus: 'PENDING' }, refundRow: { refundStatus: 'PENDING' } });
      const refund = { ...failedRefund(), status: 'succeeded' };
      assert.equal((await h.deliver(type, refund)).status, 200);
      assert.equal(h.apt().status, 'CANCELLED');
      assert.equal(h.apt().refundStatus, 'ISSUED');
      assert.equal(h.refundRow().refundStatus, 'ISSUED');
      assert.equal((await h.deliver(type, { ...refund, status: 'pending' })).status, 200);
      assert.equal(h.apt().refundStatus, 'ISSUED');
    } finally { mock.restoreAll(); }
  }
});

test('refund.updated transient failure is retried instead of losing completion', async () => {
  try {
    const h = harness({ appointment: { refundStatus: 'PENDING' }, refundRow: { refundStatus: 'PENDING' }, failTransactions: 1 });
    const refund = { ...failedRefund(), status: 'succeeded' };
    assert.equal((await h.deliver('refund.updated', refund, 'evt_test_updated')).status, 503);
    assert.equal(h.apt().refundStatus, 'PENDING');
    assert.equal((await h.deliver('refund.updated', refund, 'evt_test_updated')).status, 200);
    assert.equal(h.apt().refundStatus, 'ISSUED');
  } finally { mock.restoreAll(); }
});

test('a partial refund does not claim the whole payment was refunded', async () => {
  try {
    const h = harness({ appointment: { status: 'CONFIRMED' } });
    assert.equal((await h.deliver('charge.refunded', { id: 'ch_test_partial', amount: 5000, amount_refunded: 1000, refunded: false,
      metadata: { appointmentId: 'test-apt', region: 'EU' } })).status, 200);
    assert.equal(h.apt().status, 'CONFIRMED');
    assert.equal(h.apt().paymentStatus, 'partially_refunded');
  } finally { mock.restoreAll(); }
});

test('a late partial-refund snapshot never regresses a full refund', async () => {
  try {
    const h = harness({ appointment: { status: 'CANCELLED' } });
    const charge = { id: 'ch_test_same', amount: 5000, amount_refunded: 5000, refunded: true,
      metadata: { appointmentId: 'test-apt', patientId: 'test-patient', region: 'EU' } };
    assert.equal((await h.deliver('charge.refunded', charge)).status, 200);
    assert.equal((await h.deliver('charge.refunded', { ...charge, amount_refunded: 1000, refunded: false })).status, 200);
    assert.equal(h.apt().paymentStatus, 'refunded');
  } finally { mock.restoreAll(); }
});

test('a bill-only full refund never regresses when an older partial snapshot arrives', async () => {
  try {
    const h = harness({ chargeBill: { type: 'PHARMACY', referenceId: 'test-rx' } });
    const charge = { id: 'ch_test_ledger', amount: 5000, refunded: true, amount_refunded: 5000, metadata: { billId: 'test-bill', region: 'EU' } };
    assert.equal((await h.deliver('charge.refunded', charge)).status, 200);
    assert.equal((await h.deliver('charge.refunded', { ...charge, amount_refunded: 1000, refunded: false })).status, 200);
    assert.equal(h.chargeBill().status, 'REFUNDED');
    assert.equal(h.chargeBill().refundedAmountMinor, 5000);
  } finally { mock.restoreAll(); }
});

test('pharmacy refund metadata cannot mutate an unrelated appointment', async () => {
  try {
    const h = harness({ appointment: { status: 'CONFIRMED', paymentStatus: 'paid' }, chargeBill: { type: 'PHARMACY', referenceId: 'test-apt' } });
    assert.equal((await h.deliver('charge.refunded', { id: 'ch_test_pharmacy', amount: 5000, amount_refunded: 5000, refunded: true,
      metadata: { billId: 'test-bill', referenceId: 'test-apt', region: 'EU' } })).status, 200);
    assert.equal(h.apt().paymentStatus, 'paid');
    assert.equal(h.chargeBill().status, 'REFUNDED');
  } finally { mock.restoreAll(); }
});

for (const state of ['succeeded', 'failed']) test(`refund ${state} arriving before cancellation finalization is retried`, async () => {
  try {
    const h = harness({ appointment: { refundId: undefined, refundStatus: undefined }, refundRow: { refundId: undefined, refundStatus: undefined } });
    const refund = { id: 're_test_early', status: state, metadata: { appointmentRefund: 'test-apt', region: 'EU' } };
    const type = state === 'failed' ? 'refund.failed' : 'refund.updated';
    assert.equal((await h.deliver(type, refund, 'evt_test_early')).status, 503);
    Object.assign(h.apt(), { refundId: refund.id, refundStatus: 'PENDING' });
    Object.assign(h.refundRow(), { refundId: refund.id, refundStatus: 'PENDING' });
    assert.equal((await h.deliver(type, refund, 'evt_test_early')).status, 200);
    assert.equal(h.apt().refundStatus, state === 'failed' ? 'REQUIRES_MANUAL_REFUND' : 'ISSUED');
  } finally { mock.restoreAll(); }
});
