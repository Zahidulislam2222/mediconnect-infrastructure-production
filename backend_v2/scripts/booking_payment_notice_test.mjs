// F3 (memory/followups-2-acceptance-20260926.md): payment notices go to the decrypted email on the patient profile,
// never to a field no writer sets; a notice that cannot be addressed is logged and never breaks the webhook.
// Genuinely signed local test events and an in-memory DynamoDB double; no provider requests.
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
const kms = require('./dist/shared/kms-crypto.js');

const WEBHOOK_SECRET = 'whsec_test_secret';
const APPOINTMENTS = process.env.TABLE_APPOINTMENTS, BILLS = process.env.TABLE_TRANSACTIONS, EVENTS = process.env.TABLE_WEBHOOK_EVENTS;
const PATIENTS = process.env.TABLE_PATIENTS;
const PATIENT_EMAIL = 'patient@example.test';

const rowKey = (table, key) => `${table}|${JSON.stringify(Object.entries(key).sort())}`;
function apply(item, expression, names = {}, values = {}) {
  for (const assignment of expression.replace(/^SET\s+/i, '').split(',')) {
    const [target, source] = assignment.split('=').map(s => s.trim());
    if (!/^:\w+$/.test(source)) throw new Error(`Test double cannot apply update: ${assignment}`);
    item[target.startsWith('#') ? names[target] : target] = structuredClone(values[source]);
  }
}

function harness({ profile = { email: `phi:kms:${PATIENT_EMAIL}` }, failDecrypt = false } = {}) {
  const rows = new Map();
  const put = (table, key, item) => rows.set(rowKey(table, key), structuredClone({ ...item, ...key }));
  const get = (table, key) => rows.get(rowKey(table, key));
  if (profile) put(PATIENTS, { patientId: 'test-patient' }, profile);
  put(APPOINTMENTS, { appointmentId: 'test-apt' }, { patientId: 'test-patient', status: 'PENDING_PAYMENT' });
  put(BILLS, { billId: 'test-bill' }, { referenceId: 'test-apt', patientId: 'test-patient', amount: 50, type: 'BOOKING_FEE', status: 'PENDING' });
  const notices = [], decryptRegions = [];
  mock.method(aws, 'getSSMParameter', async name => name.includes('webhook') ? WEBHOOK_SECRET : 'sk_test_key');
  const errors = mock.method(logger, 'safeError', () => {});
  mock.method(logger, 'safeLog', () => {});
  mock.method(audit, 'writeAuditLog', async () => {});
  mock.method(billing, 'pushRevenueToBigQuery', async () => {});
  mock.method(billing, 'pushAppointmentToBigQuery', async () => {});
  mock.method(notifications, 'sendNotification', async notice => { notices.push(notice); });
  mock.method(kms, 'decryptPHI', async (fields, keyRegion) => {
    decryptRegions.push(keyRegion);
    if (failDecrypt) throw new Error('KMS unavailable');
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v).replace(/^phi:kms:/, '')]));
  });
  mock.method(aws, 'getRegionalClient', () => ({ send: async command => {
    await new Promise(done => setImmediate(done));
    const input = command.input, kind = command.constructor.name;
    if (kind === 'GetCommand') {
      const item = get(input.TableName, input.Key);
      if (!item || !input.ProjectionExpression) return { Item: item && structuredClone(item) };
      return { Item: Object.fromEntries(input.ProjectionExpression.split(',').map(f => f.trim()).filter(f => f in item).map(f => [f, item[f]])) };
    }
    if (kind === 'PutCommand') {
      assert.equal(input.TableName, EVENTS, 'only the event claim is put');
      if (get(EVENTS, { eventId: input.Item.eventId })) throw Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
      put(EVENTS, { eventId: input.Item.eventId }, input.Item); return {};
    }
    const updates = kind === 'TransactWriteCommand' ? input.TransactItems.map(entry => entry.Update)
      : kind === 'UpdateCommand' ? [input] : null;
    if (!updates) throw new Error(`Unexpected command ${kind}`);
    for (const spec of updates) {
      assert.ok(spec, 'only Update transaction items are expected');
      const next = structuredClone(get(spec.TableName, spec.Key) ?? {});
      apply(next, spec.UpdateExpression, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues);
      put(spec.TableName, spec.Key, next);
    }
    return {};
  } }));
  const { handleStripeWebhook } = require('./dist/booking-service/src/controllers/webhook.controller.js');
  const stripe = new Stripe('sk_test_key');
  let sequence = 0;
  async function deliver(type, object) {
    const payload = JSON.stringify({ id: `evt_test_${++sequence}`, object: 'event', type, data: { object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const result = { status: 200 };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; }, send(body) { result.body = body; return this; } };
    await handleStripeWebhook({ body: Buffer.from(payload), headers: { 'stripe-signature': signature } }, res);
    for (let i = 0; i < 5; i++) await new Promise(done => setImmediate(done));
    return result;
  }
  const notLogged = () => errors.mock.calls.some(call => /not notified/i.test(String(call.arguments[0])));
  return { deliver, notices, decryptRegions, notLogged };
}

// EU differs from the default AWS_REGION, so the decrypt region comes from the event's own metadata.
const metadata = { billId: 'test-bill', referenceId: 'test-apt', type: 'BOOKING_FEE', patientId: 'test-patient', region: 'EU' };
const EVENTS_UNDER_TEST = [
  ['payment_intent.payment_failed', 'PAYMENT_FAILED', { id: 'pi_test', object: 'payment_intent', amount: 5000, currency: 'usd',
    status: 'requires_payment_method', last_payment_error: { message: 'Your card was declined.' }, metadata }],
  ['payment_intent.succeeded', 'PAYMENT_SUCCESS', { id: 'pi_test', object: 'payment_intent', amount: 5000, currency: 'usd',
    status: 'succeeded', metadata }],
  ['invoice.payment_failed', 'PAYMENT_FAILED', { id: 'in_test', object: 'invoice', subscription: 'sub_test', attempt_count: 1,
    metadata: { patientId: 'test-patient', region: 'EU' } }],
];

for (const [type, noticeType, object] of EVENTS_UNDER_TEST) {
  test(`${type}: the notice goes to the decrypted email on the patient profile`, async () => {
    try {
      const h = harness();
      assert.equal((await h.deliver(type, object)).status, 200);
      assert.deepEqual(h.notices.map(n => [n.type, n.recipientEmail]), [[noticeType, PATIENT_EMAIL]]);
      assert.ok(h.decryptRegions.length > 0 && h.decryptRegions.every(r => r === 'EU'), `decrypted with the event region: ${h.decryptRegions}`);
    } finally { mock.restoreAll(); }
  });

  for (const [label, options] of [['no profile email', { profile: { name: 'phi:kms:Test Patient' } }], ['decrypt failure', { failDecrypt: true }]]) {
    test(`${type}: ${label} sends nothing, is logged, and the event is still acknowledged`, async () => {
      try {
        const h = harness(options);
        assert.equal((await h.deliver(type, object)).status, 200);
        assert.equal(h.notices.length, 0, 'no notice without a real recipient');
        assert.ok(h.notLogged(), 'the unnotified patient is logged');
      } finally { mock.restoreAll(); }
    });
  }
}

test('payment_intent.succeeded: the bill\'s own patient is notified, not the patient named in event metadata', async () => {
  try {
    const h = harness();
    const [, , object] = EVENTS_UNDER_TEST[1];
    assert.equal((await h.deliver('payment_intent.succeeded', { ...object, metadata: { ...metadata, patientId: 'test-other-patient' } })).status, 200);
    assert.deepEqual(h.notices.map(n => n.recipientEmail), [PATIENT_EMAIL]);
  } finally { mock.restoreAll(); }
});
