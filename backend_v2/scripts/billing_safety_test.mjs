// Exercise the actual controller with isolated database/Stripe boundaries. No provider requests.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const Stripe = require('stripe');
const { payBill } = require('./dist/booking-service/src/controllers/billing.controller.js');

function harness(options = {}) {
  let bill = { billId: 'test-bill', patientId: 'test-patient', amount: 10, currency: 'usd', status: 'DUE', ...options.bill };
  const calls = { create: 0, confirm: 0, retrieve: 0, reserve: 0 };
  const intent = { id: 'pi_test', status: 'requires_confirmation', amount: 1000, currency: 'usd', metadata: { billId: 'test-bill' } };
  mock.method(aws, 'getSSMParameter', async () => 'test-key');
  mock.method(audit, 'writeAuditLog', async () => {});
  mock.method(aws, 'getRegionalClient', () => ({ send: async command => {
    const data = command.input;
    if (command.constructor.name === 'GetCommand') return { Item: { ...bill } };
    if (data.UpdateExpression.includes('paymentAttemptId')) {
      calls.reserve++;
      if (bill.paymentAttemptId) throw Object.assign(new Error('test conflict'), { name: 'ConditionalCheckFailedException' });
      bill.paymentAttemptId = data.ExpressionAttributeValues[':attempt'];
    } else {
      if (options.persistFails) throw new Error('test persistence failure');
      bill.paymentIntentId = data.ExpressionAttributeValues[':intent'];
    }
    return {};
  } }));
  mock.method(Stripe.prototype, '_prepResources', function () {
    this.paymentIntents = {
      create: async params => {
        calls.create++;
        if (options.createFails) throw new Error('test ambiguous provider response');
        // A reservation must be durable before provider creation; creation cannot charge yet.
        assert.ok(bill.paymentAttemptId);
        assert.notEqual(params.confirm, true);
        return { ...intent };
      },
      retrieve: async () => { calls.retrieve++; return { ...intent }; },
      confirm: async () => {
        calls.confirm++;
        assert.equal(bill.paymentIntentId, intent.id);
        intent.status = 'succeeded';
        return { ...intent };
      },
    };
  });
  async function request(user = { sub: 'test-patient', region: 'us-east-1' }) {
    const result = { status: 200, body: undefined };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; return this; } };
    await payBill({ body: { billId: 'test-bill', patientId: 'test-patient', paymentMethodId: 'pm_test' }, user, headers: {} }, res);
    return result;
  }
  return { request, calls };
}

test('missing authentication cannot submit a payment', async () => {
  try { const h = harness(); assert.equal((await h.request(null)).status, 401); assert.equal(h.calls.create, 0); }
  finally { mock.restoreAll(); }
});
test('an already-paid bill cannot create another intent', async () => {
  try { const h = harness({ bill: { status: 'PAID' } }); assert.equal((await h.request()).status, 409); assert.equal(h.calls.create, 0); }
  finally { mock.restoreAll(); }
});
test('sequential retries reuse the stored intent and do not reconfirm success', async () => {
  try {
    const h = harness();
    assert.equal((await h.request()).body.status, 'succeeded');
    assert.equal((await h.request()).body.status, 'succeeded');
    assert.equal(h.calls.create, 1); assert.equal(h.calls.confirm, 1);
  } finally { mock.restoreAll(); }
});
test('concurrent requests reserve only one provider intent', async () => {
  try { const h = harness(); await Promise.all([h.request(), h.request()]); assert.equal(h.calls.create, 1); }
  finally { mock.restoreAll(); }
});
for (const failure of ['createFails', 'persistFails']) {
  test(`${failure}: uncertain attempt is never replaced or charged before persistence`, async () => {
    try {
      const h = harness({ [failure]: true });
      assert.equal((await h.request()).status, 503);
      assert.equal((await h.request()).status, 409);
      assert.equal(h.calls.create, 1); assert.equal(h.calls.confirm, 0);
    } finally { mock.restoreAll(); }
  });
}
