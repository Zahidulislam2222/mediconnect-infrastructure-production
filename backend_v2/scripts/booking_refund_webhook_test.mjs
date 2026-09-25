// S3/S7 (memory/safe-followups-acceptance-20260925.md): the Stripe refund webhooks tell the patient only what is true
// and hand a failed appointment refund to a person. Genuinely signed local test events and an in-memory DynamoDB
// double; no provider requests.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = /^TABLE_/.test(match[1])
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
const { REFUND_NOTICES } = require('./dist/booking-service/src/content/cancellation.js');

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

function harness({ appointment = {}, refundRow = {}, withoutRefundRow = false, failTransactions = 0 } = {}) {
  const rows = new Map();
  const key = (table, item) => `${table}|${KEYS[table].map(k => item[k]).join('|')}`;
  const put = (table, item) => rows.set(key(table, item), structuredClone(item));
  const get = (table, k) => rows.get(key(table, k));
  put(APPOINTMENTS, { appointmentId: 'test-apt', patientId: 'test-patient', patientEmail: 'patient@example.test', status: 'REFUNDED',
    refundId: 're_test_1', refundStatus: 'ISSUED', ...appointment });
  if (!withoutRefundRow) put(BILLS, { billId: 'refund-test-apt', referenceId: 'test-apt', type: 'REFUND', amount: -50, status: 'PROCESSED',
    refundId: 're_test_1', refundStatus: 'ISSUED', ...refundRow });
  let transactionFailures = failTransactions;
  const regions = [], notices = [];
  mock.method(aws, 'getSSMParameter', async name => name.includes('webhook') ? WEBHOOK_SECRET : 'sk_test_key');
  const effects = { audit: mock.method(audit, 'writeAuditLog', async () => {}), errors: mock.method(logger, 'safeError', () => {}) };
  mock.method(billing, 'pushRevenueToBigQuery', async () => {});
  mock.method(billing, 'pushAppointmentToBigQuery', async () => {});
  mock.method(notifications, 'sendNotification', async notice => { notices.push(notice); });
  mock.method(aws, 'getRegionalClient', selected => { regions.push(selected); return { send: async command => {
    await new Promise(done => setImmediate(done));
    const input = command.input, kind = command.constructor.name;
    if (kind === 'GetCommand') { const item = get(input.TableName, input.Key); return { Item: item && structuredClone(item) }; }
    if (kind === 'PutCommand') {
      if (!holds(get(input.TableName, input.Item), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues))
        throw Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
      put(input.TableName, input.Item); return {};
    }
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
  const stripe = new Stripe('sk_test_key');
  let sequence = 0;
  async function deliver(type, object) {
    const payload = JSON.stringify({ id: `evt_test_${++sequence}`, object: 'event', type, data: { object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const result = { status: 200 };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; }, send(body) { result.body = body; return this; } };
    await handleStripeWebhook({ body: Buffer.from(payload), headers: { 'stripe-signature': signature } }, res);
    return result;
  }
  return { deliver, effects, notices, regions, apt: () => get(APPOINTMENTS, { appointmentId: 'test-apt' }), refundRow: () => get(BILLS, { billId: 'refund-test-apt' }) };
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
    assert.equal(h.notices[0].recipientEmail, 'patient@example.test');
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
      assert.equal((await h.deliver('refund.failed', refund)).status, 200, label);
      assert.equal(h.apt().refundStatus, 'ISSUED', label);
      if (!options.withoutRefundRow) assert.equal(h.refundRow().status, 'PROCESSED', label);
      assert.equal(h.notices.length, 0, label);
      assert.ok(h.effects.errors.mock.calls.some(call => /manual/i.test(String(call.arguments[0]))), `${label}: logged for manual follow-up`);
    } finally { mock.restoreAll(); }
  }
});
