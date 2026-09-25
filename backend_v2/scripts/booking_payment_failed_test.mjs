// S6 (memory/safe-followups-acceptance-20260925.md): payment_intent.payment_failed changes only a bill that is still
// payable. Genuinely signed local test events and an in-memory DynamoDB double; no provider requests.
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
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const Stripe = require('stripe');
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const notifications = require('./dist/shared/notifications.js');
const billing = require('./dist/booking-service/src/controllers/billing.controller.js');
const logger = require('./dist/shared/logger.js');
const { PAYABLE_BILL_STATUSES } = require('./dist/shared/billing-status.js');

const WEBHOOK_SECRET = 'whsec_test_secret';
const APPOINTMENTS = process.env.TABLE_APPOINTMENTS, BILLS = process.env.TABLE_TRANSACTIONS, EVENTS = process.env.TABLE_WEBHOOK_EVENTS;
const KEYS = { [APPOINTMENTS]: ['appointmentId'], [BILLS]: ['billId'], [EVENTS]: ['eventId'] };

// Evaluates only the expression forms these handlers use; anything else throws so it cannot silently pass.
const resolve = (path, names = {}) => path.startsWith('#') ? names[path] : path;
function holds(item, expression, names = {}, values = {}) {
  if (!expression) return true;
  return expression.split(/\s+AND\s+/).every(clause => {
    let m;
    if ((m = clause.match(/^attribute_not_exists\((\S+)\)$/))) return item?.[resolve(m[1], names)] === undefined;
    if ((m = clause.match(/^(\S+)\s+IN\s+\(([^)]*)\)$/))) return item !== undefined && m[2].split(',').map(v => values[v.trim()]).includes(item[resolve(m[1], names)]);
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

function harness({ bill = {}, withoutBill = false, failTransactions = 0, failCodes = ['ThrottlingError'] } = {}) {
  const rows = new Map();
  const key = (table, item) => `${table}|${KEYS[table].map(k => item[k]).join('|')}`;
  const put = (table, item) => rows.set(key(table, item), structuredClone(item));
  const get = (table, k) => rows.get(key(table, k));
  put(APPOINTMENTS, { appointmentId: 'test-apt', patientId: 'test-patient', patientEmail: 'patient@example.test', status: 'CONFIRMED', paymentStatus: 'paid' });
  if (!withoutBill) put(BILLS, { billId: 'test-bill', referenceId: 'test-apt', patientId: 'test-patient', amount: 50, type: 'BOOKING_FEE',
    status: 'PENDING', ...bill });
  let transactionFailures = failTransactions;
  mock.method(aws, 'getSSMParameter', async name => name.includes('webhook') ? WEBHOOK_SECRET : 'sk_test_key');
  const effects = { audit: mock.method(audit, 'writeAuditLog', async () => {}), notify: mock.method(notifications, 'sendNotification', async () => {}),
    revenue: mock.method(billing, 'pushRevenueToBigQuery', async () => {}), appointments: mock.method(billing, 'pushAppointmentToBigQuery', async () => {}),
    logs: mock.method(logger, 'safeLog', () => {}), errors: mock.method(logger, 'safeError', () => {}) };
  mock.method(aws, 'getRegionalClient', () => ({ send: async command => {
    await new Promise(done => setImmediate(done));
    const input = command.input, kind = command.constructor.name;
    if (kind === 'GetCommand') { const item = get(input.TableName, input.Key); return { Item: item && structuredClone(item) }; }
    if (kind === 'PutCommand') {
      if (!holds(get(input.TableName, input.Item), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues))
        throw Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
      put(input.TableName, input.Item); return {};
    }
    if (kind === 'DeleteCommand') { rows.delete(key(input.TableName, input.Key)); return {}; }
    if (kind === 'TransactWriteCommand') {
      if (transactionFailures > 0) { transactionFailures--; throw cancelled(input.TransactItems.map((_, i) => failCodes[i] ?? 'None')); }
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
  } }));
  const { handleStripeWebhook } = require('./dist/booking-service/src/controllers/webhook.controller.js');
  const stripe = new Stripe('sk_test_key');
  let sequence = 0;
  async function deliver(eventId = `evt_test_${++sequence}`) {
    const payload = JSON.stringify({ id: eventId, object: 'event', type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_test_failed', object: 'payment_intent', amount: 5000, currency: 'usd', status: 'requires_payment_method',
        last_payment_error: { message: 'Your card was declined.' },
        metadata: { billId: 'test-bill', referenceId: 'test-apt', type: 'BOOKING_FEE', patientId: 'test-patient', region: 'us-east-1' } } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const result = { status: 200 };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; }, send(body) { result.body = body; return this; } };
    await handleStripeWebhook({ body: Buffer.from(payload), headers: { 'stripe-signature': signature } }, res);
    return result;
  }
  const logged = pattern => [...effects.logs.mock.calls, ...effects.errors.mock.calls].some(call => pattern.test(String(call.arguments[0])));
  return { deliver, effects, logged, bill: () => get(BILLS, { billId: 'test-bill' }), apt: () => get(APPOINTMENTS, { appointmentId: 'test-apt' }),
    claimed: eventId => get(EVENTS, { eventId }) !== undefined };
}

test('a failed payment of a still-payable bill marks the bill and its appointment failed', async () => {
  assert.deepEqual([...PAYABLE_BILL_STATUSES].sort(), ['DUE', 'FAILED', 'PENDING', 'UNPAID']);
  for (const status of PAYABLE_BILL_STATUSES) {
    try {
      const h = harness({ bill: { status } });
      assert.equal((await h.deliver()).status, 200, status);
      assert.equal(h.bill().status, 'FAILED', status);
      assert.equal(h.bill().paymentIntentId, 'pi_test_failed', status);
      assert.equal(h.bill().failureReason, 'Your card was declined.', status);
      assert.equal(h.apt().status, 'PAYMENT_FAILED', status);
      assert.equal(h.effects.notify.mock.callCount(), 1, `${status}: patient told the payment failed`);
    } finally { mock.restoreAll(); }
  }
});

test('a failed payment never changes a bill that is no longer payable', async () => {
  for (const [label, bill] of [
    ['PAID', { status: 'PAID' }],
    ['REFUNDED', { status: 'REFUNDED' }],
    ['DISPUTED', { status: 'DISPUTED' }],
    ['payable status but under refund review', { status: 'FAILED', reviewReason: 'PRESCRIPTION_NOT_PAYABLE' }],
  ]) {
    try {
      const h = harness({ bill: { paymentIntentId: 'pi_test_original', ...bill } });
      assert.equal((await h.deliver()).status, 200, `${label}: event acknowledged`);
      assert.equal(h.bill().status, bill.status, `${label}: status kept`);
      assert.equal(h.bill().paymentIntentId, 'pi_test_original', `${label}: paymentIntentId kept`);
      assert.equal(h.bill().failureReason, undefined, label);
      assert.equal(h.apt().status, 'CONFIRMED', `${label}: appointment kept`);
      assert.equal(h.effects.notify.mock.callCount(), 0, `${label}: patient not told a settled bill failed`);
      assert.equal(h.effects.revenue.mock.callCount(), 0, `${label}: no FAILED revenue row`);
      assert.ok(h.logged(/test-bill.*no longer payable/i), `${label}: skip logged`);
      const audits = h.effects.audit.mock.calls.map(call => call.arguments);
      assert.equal(audits.length, 1, `${label}: the ignored failure is audited`);
      assert.match(String(audits[0][3]), /ignored/i, label);
      assert.equal(audits[0][4].appointmentId, 'test-apt', `${label}: the audit names the appointment`);
    } finally { mock.restoreAll(); }
  }
});

test('a failed payment for an unknown bill creates no ledger row', async () => {
  try {
    const h = harness({ withoutBill: true });
    assert.equal((await h.deliver()).status, 200);
    assert.equal(h.bill(), undefined);
    assert.equal(h.apt().status, 'CONFIRMED');
    assert.ok(h.logged(/test-bill.*no longer payable/i));
  } finally { mock.restoreAll(); }
});

// S6c: a write that did not happen for another reason (throttling, or a conflict on the appointment item) must not
// tell the patient or record FAILED revenue; the claim is released so Stripe's redelivery does the work.
test('a payment failure whose ledger write is lost is retried by Stripe, not half-processed', async () => {
  for (const [label, failCodes] of [['throttled', ['ThrottlingError', 'ThrottlingError']], ['appointment conflict', ['None', 'TransactionConflict']]]) {
    try {
      const h = harness({ failTransactions: 1, failCodes });
      assert.equal((await h.deliver('evt_test_retry')).status, 500, `${label}: Stripe is asked to retry`);
      assert.equal(h.claimed('evt_test_retry'), false, `${label}: the claim is released`);
      assert.equal(h.bill().status, 'PENDING', label);
      assert.equal(h.effects.notify.mock.callCount(), 0, `${label}: no notice for an unrecorded failure`);
      assert.equal(h.effects.revenue.mock.callCount(), 0, `${label}: no FAILED revenue row`);
      assert.equal((await h.deliver('evt_test_retry')).status, 200, `${label}: the redelivery is processed`);
      assert.equal(h.bill().status, 'FAILED', label);
      assert.equal(h.apt().status, 'PAYMENT_FAILED', label);
      assert.equal(h.effects.notify.mock.callCount(), 1, `${label}: one notice`);
    } finally { mock.restoreAll(); }
  }
});
