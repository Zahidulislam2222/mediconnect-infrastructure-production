// Drives the real booking controllers (patient cancel, doctor cancel, no-show cleanup, booking compensation) with an
// in-memory DynamoDB that evaluates conditions and a Stripe double that models idempotency keys. No provider requests.
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
const kms = require('./dist/shared/kms-crypto.js');
const notifications = require('./dist/shared/notifications.js');
const eventBus = require('./dist/shared/event-bus.js');
const billing = require('./dist/booking-service/src/controllers/billing.controller.js');
const pdf = require('./dist/booking-service/src/utils/pdf-generator.js');

const APPOINTMENTS = process.env.TABLE_APPOINTMENTS, BILLS = process.env.TABLE_TRANSACTIONS, LOCKS = process.env.TABLE_LOCKS;
const PATIENT_EMAILS = process.env.DYNAMO_TABLE, PATIENTS = process.env.TABLE_PATIENTS, DOCTORS = process.env.TABLE_DOCTORS;
const KEYS = { [APPOINTMENTS]: ['appointmentId'], [BILLS]: ['billId'], [LOCKS]: ['lockId'], [PATIENT_EMAILS]: ['patientId'],
  [PATIENTS]: ['patientId'], [DOCTORS]: ['doctorId'], [process.env.TABLE_GRAPH]: ['PK', 'SK'], [process.env.TABLE_SUBSCRIPTIONS]: ['patientId'] };
const CLEANUP_SECRET = 'test-cleanup-secret';

// Evaluates only the expression forms the controller uses; anything else throws so it cannot silently pass.
const resolve = (path, names = {}) => path.startsWith('#') ? names[path] : path;
/** Reads a possibly nested document path such as `#res.#fs`; a missing step reads as undefined, like DynamoDB. */
const read = (item, path, names = {}) => path.split('.').reduce((node, step) => node?.[resolve(step, names)], item);
/** Splits on a keyword outside parentheses, so `a AND (b OR c)` keeps its group. */
function splitTop(expression, word) {
  const parts = []; let depth = 0, last = 0;
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === '(') depth++;
    else if (expression[i] === ')') depth--;
    else if (depth === 0 && expression.startsWith(` ${word} `, i)) { parts.push(expression.slice(last, i)); last = i + word.length + 2; i = last - 1; }
  }
  parts.push(expression.slice(last));
  return parts.map(part => part.trim());
}
const wrapped = e => {
  if (!e.startsWith('(') || !e.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < e.length; i++) { depth += e[i] === '(' ? 1 : e[i] === ')' ? -1 : 0; if (depth === 0 && i < e.length - 1) return false; }
  return true;
};
function holds(item, expression, names = {}, values = {}) {
  if (!expression) return true;
  const e = expression.trim();
  const ors = splitTop(e, 'OR');
  if (ors.length > 1) return ors.some(part => holds(item, part, names, values));
  const ands = splitTop(e, 'AND');
  if (ands.length > 1) return ands.every(part => holds(item, part, names, values));
  if (wrapped(e)) return holds(item, e.slice(1, -1), names, values);
  if (e.startsWith('NOT ')) return !holds(item, e.slice(4), names, values);
  return [e].every(clause => {
    let m;
    if ((m = clause.match(/^attribute_not_exists\((\S+)\)$/))) return read(item, m[1], names) === undefined;
    if ((m = clause.match(/^attribute_exists\((\S+)\)$/))) return read(item, m[1], names) !== undefined;
    if ((m = clause.match(/^(\S+)\s+IN\s+\(([^)]*)\)$/))) return m[2].split(',').map(v => values[v.trim()]).includes(read(item, m[1], names));
    if ((m = clause.match(/^(\S+)\s*(=|<>|>|<)\s*(:\w+)$/))) {
      const left = read(item, m[1], names), right = values[m[3]];
      if (m[2] === '=') return left === right;
      if (m[2] === '<>') return left !== undefined && left !== right;
      return left !== undefined && (m[2] === '>' ? left > right : left < right);
    }
    throw new Error(`Test double cannot evaluate condition: ${clause}`);
  });
}
function apply(item, expression, names = {}, values = {}) {
  const [setPart, removePart] = expression.replace(/^SET\s+/i, '').split(/\s+REMOVE\s+/i);
  if (/^REMOVE\s+/i.test(expression)) {
    for (const path of expression.replace(/^REMOVE\s+/i, '').split(',')) delete item[resolve(path.trim(), names)];
    return;
  }
  for (const assignment of setPart.split(',')) {
    const [target, source] = assignment.split('=').map(s => s.trim());
    let m;
    if ((m = source.match(/^(\S+)\s*-\s*(:\w+)$/))) item[resolve(target, names)] = item[resolve(m[1], names)] - values[m[2]];
    else if (/^:\w+$/.test(source)) item[resolve(target, names)] = structuredClone(values[source]);
    else throw new Error(`Test double cannot apply update: ${assignment}`);
  }
  for (const path of (removePart ?? '').split(',').filter(Boolean)) delete item[resolve(path.trim(), names)];
}
const conditional = () => Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });
const cancelled = codes => Object.assign(new Error('Transaction cancelled'), {
  name: 'TransactionCanceledException', CancellationReasons: codes.map(Code => ({ Code })) });

/** Assigning undefined to process.env stores the string "undefined", so an absent value is deleted instead. */
const restoreSetting = (name, value) => { if (value === undefined) delete process.env[name]; else process.env[name] = value; };
const HOUR = 3600_000;
const slot = offsetMs => new Date(Date.now() + offsetMs).toISOString().split('.')[0] + 'Z';
const appointment = (overrides = {}) => ({
  appointmentId: 'test-apt', patientId: 'test-patient', doctorId: 'test-doctor', timeSlot: slot(72 * HOUR),
  status: 'CONFIRMED', paymentStatus: 'paid', paymentId: 'pi_test', amountPaid: 50,
  patientName: 'phi:kms:patient', doctorName: 'phi:kms:doctor',
  resource: { resourceType: 'Appointment', status: 'booked', participant: [
    { actor: { reference: 'Patient/test-patient', display: 'phi:kms:patient' }, status: 'accepted' },
    { actor: { reference: 'Practitioner/test-doctor', display: 'phi:kms:doctor' }, status: 'accepted' }] },
  ...overrides,
});

function harness({ region = 'US', appointments = [appointment()], refund = 'succeeded', stripeKey = true, failFinalize = 0,
  bills = [], beforeFinalize = null, providerRefunds = [], commitThenFail = 0, afterStatusQuery = null } = {}) {
  const rows = new Map();
  const key = (table, item) => `${table}|${KEYS[table].map(k => item[k]).join('|')}`;
  const put = (table, item) => rows.set(key(table, item), structuredClone(item));
  const get = (table, k) => rows.get(key(table, k));
  const table = name => [...rows.entries()].filter(([k]) => k.startsWith(`${name}|`)).map(([, v]) => v);
  for (const apt of appointments) {
    put(APPOINTMENTS, apt);
    put(LOCKS, { lockId: `${apt.doctorId}#${apt.timeSlot}`, status: 'BOOKED', appointmentId: apt.appointmentId });
  }
  for (const row of bills) put(BILLS, row);
  put(PATIENT_EMAILS, { patientId: 'test-patient', email: 'patient@example.test' });
  put(PATIENTS, { patientId: 'test-patient', name: 'Test Patient', isIdentityVerified: true, email: 'patient@example.test' });
  put(DOCTORS, { doctorId: 'test-doctor', name: 'Test Doctor', verificationStatus: 'APPROVED', consultationFee: 50 });

  // refunds: idempotency-key cache (Stripe may prune it after 24h); created: every refund the provider holds.
  const stripe = { refundCalls: [], refunds: new Map(), created: structuredClone(providerRefunds), captured: [], listCalls: 0 };
  stripe.expireKeys = () => stripe.refunds.clear();
  let finalizeFailures = failFinalize, committedFailures = commitThenFail;
  mock.method(aws, 'getSSMParameter', async name => /cleanup/.test(name) ? CLEANUP_SECRET : (stripeKey ? 'sk_test_key' : undefined));
  mock.method(audit, 'writeAuditLog', async () => {});
  mock.method(kms, 'decryptPHI', async fields => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v).replace(/^phi:kms:/, 'plain-')])));
  mock.method(kms, 'encryptPHI', async fields => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, `phi:kms:${v}`])));
  const notices = [], receipts = [];
  mock.method(notifications, 'sendNotification', async notice => { notices.push(notice); });
  mock.method(eventBus, 'publishEvent', async () => {});
  mock.method(billing, 'pushRevenueToBigQuery', async () => {});
  mock.method(billing, 'pushAppointmentToBigQuery', async () => {});
  mock.method(pdf.BookingPDFGenerator.prototype, 'generateReceipt', async data => { receipts.push(data); return 'test-receipt'; });
  mock.method(Stripe.prototype, '_prepResources', function () {
    this.refunds = { create: async (params, options = {}) => {
      stripe.refundCalls.push({ params, idempotencyKey: options.idempotencyKey });
      await new Promise(done => setImmediate(done));
      // Stripe replays the first result saved for an idempotency key.
      if (options.idempotencyKey && stripe.refunds.has(options.idempotencyKey)) return structuredClone(stripe.refunds.get(options.idempotencyKey));
      if (refund === 'throw') throw Object.assign(new Error('test provider failure'), { type: 'StripeAPIError' });
      if (refund === 'already_refunded') throw Object.assign(new Error('test charge already refunded'), { type: 'StripeInvalidRequestError', code: 'charge_already_refunded' });
      const result = { id: `re_test_${stripe.created.length + 1}`, object: 'refund', status: refund, payment_intent: params.payment_intent,
        metadata: params.metadata ?? {} };
      stripe.created.push(result);
      if (options.idempotencyKey) stripe.refunds.set(options.idempotencyKey, result);
      return structuredClone(result);
    },
    // One refund per page, newest first like Stripe, so a reader that ignores has_more misses refunds.
    list: async ({ payment_intent, starting_after } = {}) => {
      stripe.listCalls++;
      await new Promise(done => setImmediate(done));
      const all = stripe.created.filter(r => r.payment_intent === payment_intent).reverse();
      const start = starting_after ? all.findIndex(r => r.id === starting_after) + 1 : 0;
      return { object: 'list', data: all.slice(start, start + 1).map(r => structuredClone(r)), has_more: start + 1 < all.length };
    } };
    this.paymentIntents = {
      create: async () => ({ id: 'pi_new', status: 'requires_capture' }),
      capture: async id => { stripe.captured.push(id); return { id, status: 'succeeded' }; },
      cancel: async id => ({ id, status: 'canceled' }),
    };
  });
  const regions = new Set();
  mock.method(aws, 'getRegionalClient', selected => { regions.add(selected); return { send: async command => {
    await new Promise(done => setImmediate(done)); // let concurrent requests interleave like a network hop
    const input = command.input, kind = command.constructor.name;
    if (kind === 'GetCommand') { const item = get(input.TableName, input.Key); return { Item: item && structuredClone(item) }; }
    if (kind === 'QueryCommand') {
      if (input.IndexName === 'StatusIndex') {
        const items = table(APPOINTMENTS).filter(a => a.status === input.ExpressionAttributeValues[':confirmed']).map(a => structuredClone(a));
        // Runs once, after the (eventually consistent) index read, to model a write the index has not seen yet.
        if (afterStatusQuery) { const hook = afterStatusQuery; afterStatusQuery = null; hook({ apt: id => get(APPOINTMENTS, { appointmentId: id }) }); }
        return { Items: items };
      }
      if (input.IndexName === 'PatientIndex') return { Items: [] };
      throw new Error(`Unexpected query ${input.TableName}/${input.IndexName}`);
    }
    if (kind === 'PutCommand') {
      if (!holds(get(input.TableName, input.Item), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) throw conditional();
      put(input.TableName, input.Item); return {};
    }
    if (kind === 'DeleteCommand') { rows.delete(key(input.TableName, input.Key)); return {}; }
    if (kind === 'UpdateCommand') {
      const item = get(input.TableName, input.Key);
      if (!holds(item, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) throw conditional();
      const next = item ?? { ...input.Key };
      apply(next, input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues);
      put(input.TableName, next); return {};
    }
    if (kind === 'TransactWriteCommand') {
      const writesAppointment = input.TransactItems.some(entry => Object.values(entry)[0].TableName === APPOINTMENTS);
      if (writesAppointment && finalizeFailures > 0) { finalizeFailures--; throw new Error('test database failure'); }
      // Runs once, between the claim and the final save, to model a competing writer.
      if (writesAppointment && beforeFinalize) { const hook = beforeFinalize; beforeFinalize = null; hook({ apt: id => get(APPOINTMENTS, { appointmentId: id }) }); }
      const staged = input.TransactItems.map(entry => {
        const [op, spec] = Object.entries(entry)[0];
        const k = op === 'Put' ? spec.Item : spec.Key;
        const current = get(spec.TableName, k);
        // A conditioned update of a missing item fails, like DynamoDB; a Put condition sees the missing item as empty.
        const ok = holds(current, spec.ConditionExpression, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues)
          && (op !== 'Update' || !spec.ConditionExpression || current !== undefined);
        return { op, spec, k, current, ok };
      });
      if (staged.some(s => !s.ok)) throw cancelled(staged.map(s => s.ok ? 'None' : 'ConditionalCheckFailed'));
      for (const s of staged) {
        if (s.op === 'Put') put(s.spec.TableName, s.spec.Item);
        else if (s.op === 'Delete') rows.delete(key(s.spec.TableName, s.k));
        else { const next = s.current ? structuredClone(s.current) : { ...s.k }; apply(next, s.spec.UpdateExpression, s.spec.ExpressionAttributeNames, s.spec.ExpressionAttributeValues); put(s.spec.TableName, next); }
      }
      // The write committed but the reply was lost, as a network timeout after commit looks to the SDK.
      if (writesAppointment && committedFailures > 0) { committedFailures--; throw Object.assign(new Error('test socket hang up'), { name: 'TimeoutError' }); }
      return {};
    }
    throw new Error(`Unexpected command ${kind}`);
  } }; });

  const controller = require('./dist/booking-service/src/controllers/booking.controller.js');
  // catchAsync does not return the handler promise, so a call settles on the response or on next(error).
  const invoke = (handler, req) => new Promise(done => {
    const result = { status: 200 };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; done(result); return this; },
      send(body) { result.body = body; done(result); return this; } };
    handler({ headers: {}, ip: '127.0.0.1', params: {}, ...req }, res, error => { result.status = 500; result.error = error; done(result); });
  });
  const user = (sub, extra = {}) => ({ sub, region, email: `${sub}@example.test`, ...extra });
  return {
    stripe, notices, receipts, regions,
    put: (tableName, item) => put(tableName, item),
    apt: (id = 'test-apt') => get(APPOINTMENTS, { appointmentId: id }),
    refundRows: () => table(BILLS).filter(b => b.type === 'REFUND'),
    lock: (apt = appointment()) => get(LOCKS, { lockId: `${apt.doctorId}#${apt.timeSlot}` }),
    patientCancel: (appointmentId = 'test-apt') => invoke(controller.cancelBookingUser, { body: { appointmentId }, user: user('test-patient') }),
    doctorCancel: (status = 'CANCELLED', appointmentId = 'test-apt') => invoke(controller.updateAppointment,
      { body: { appointmentId, status }, user: user('test-doctor', { isDoctor: true }) }),
    cleanup: () => invoke(controller.cleanupAppointments, { headers: { 'x-internal-secret': CLEANUP_SECRET }, user: user('SYSTEM') }),
    receipt: (appointmentId = 'test-apt') => invoke(controller.getReceipt, { params: { appointmentId }, user: user('test-patient') }),
    doctorUpdate: body => invoke(controller.updateAppointment, { body: { appointmentId: 'test-apt', ...body }, user: user('test-doctor', { isDoctor: true }) }),
    patientCheckIn: () => invoke(controller.updateAppointment, { body: { appointmentId: 'test-apt', patientArrived: true }, user: user('test-patient') }),
    book: () => invoke(controller.createBooking, { body: { doctorId: 'test-doctor', timeSlot: slot(96 * HOUR), paymentToken: 'pm_test' }, user: user('test-patient') }),
  };
}
const claimsRefund = text => /\brefunded\b|refund has been (issued|initiated)/i.test(text ?? '');

for (const region of ['US', 'EU']) {
  test(`${region}: a patient cancellation refunds once with a deterministic key and records it truthfully`, async () => {
    try {
      const h = harness({ region });
      const result = await h.patientCancel();
      assert.equal(result.status, 200);
      assert.ok(claimsRefund(result.body.message), result.body.message);
      assert.deepEqual(h.stripe.refundCalls, [{ params: { payment_intent: 'pi_test', metadata: { appointmentRefund: 'test-apt' } }, idempotencyKey: 'appointment-refund:test-apt' }]);
      assert.equal(result.body.refundStatus, 'ISSUED'); assert.equal(h.apt().refundStatus, 'ISSUED');
      assert.equal(h.apt().status, 'CANCELLED'); assert.equal(h.apt().cancellationClaim, undefined);
      assert.deepEqual(h.refundRows().map(r => [r.billId, r.status, r.amount]), [['refund-test-apt', 'PROCESSED', -50]]);
      assert.equal(h.lock(), undefined, 'slot released');
      assert.deepEqual([h.receipts.at(-1).type, h.receipts.at(-1).status], ['REFUND', 'REFUNDED']);
      assert.deepEqual([...h.regions], [region]);
      // R8: the stored FHIR resource keeps the encrypted names; only the receipt copy is decrypted.
      for (const participant of h.apt().resource.participant) assert.match(participant.actor.display, /^phi:/);
      assert.equal(h.apt().resource.status, 'cancelled');
    } finally { mock.restoreAll(); }
  });
}

for (const refund of ['throw', 'failed', 'canceled', 'requires_action']) {
  test(`a ${refund} refund is recorded for manual processing and never reported as refunded`, async () => {
    try {
      const h = harness({ refund });
      const result = await h.patientCancel();
      assert.equal(result.status, 200);
      assert.equal(h.apt().status, 'CANCELLED');
      assert.deepEqual(h.refundRows().map(r => r.status), ['FAILED_REQUIRES_MANUAL_REFUND']);
      assert.ok(!claimsRefund(result.body.message), result.body.message);
      assert.ok(h.notices.every(n => !claimsRefund(n.message)), h.notices.map(n => n.message).join(' | '));
      // C11: no credit note and no negative amount for money that was not returned.
      assert.deepEqual([h.receipts.at(-1).type, h.receipts.at(-1).status, h.receipts.at(-1).amount], ['CANCELLATION', 'REFUND UNDER REVIEW', 50]);
      assert.equal(result.body.refundStatus, 'REQUIRES_MANUAL_REFUND'); assert.equal(h.apt().refundStatus, 'REQUIRES_MANUAL_REFUND');
    } finally { mock.restoreAll(); }
  });
}

// C20: Stripe accepted the refund but has not completed it, so it is requested, never "issued".
test('a pending refund is reported as requested, not issued', async () => {
  try {
    const h = harness({ refund: 'pending' });
    const result = await h.patientCancel();
    assert.equal(result.status, 200);
    assert.deepEqual(h.refundRows().map(r => r.status), ['PROCESSED']);
    assert.equal(result.body.refundStatus, 'PENDING'); assert.equal(h.apt().refundStatus, 'PENDING');
    assert.match(result.body.message, /refund has been requested/i); assert.ok(!claimsRefund(result.body.message), result.body.message);
    assert.ok(h.notices.every(n => !claimsRefund(n.message)), h.notices.map(n => n.message).join(' | '));
    assert.deepEqual([h.receipts.at(-1).type, h.receipts.at(-1).status], ['REFUND', 'REFUND PENDING']);
  } finally { mock.restoreAll(); }
});

test('a missing payment-provider key is a manual refund, not a processed one', async () => {
  try {
    const h = harness({ stripeKey: false });
    const result = await h.patientCancel();
    assert.equal(result.status, 200);
    assert.equal(h.stripe.refundCalls.length, 0);
    assert.deepEqual(h.refundRows().map(r => r.status), ['FAILED_REQUIRES_MANUAL_REFUND']);
    assert.ok(!claimsRefund(result.body.message));
  } finally { mock.restoreAll(); }
});

test('an appointment without a real payment is cancelled without a refund record', async () => {
  try {
    const h = harness({ appointments: [appointment({ paymentId: 'TEST_MODE' })] });
    const result = await h.patientCancel();
    assert.equal(result.status, 200);
    assert.equal(h.stripe.refundCalls.length, 0);
    assert.equal(h.refundRows().length, 0);
    assert.ok(!claimsRefund(result.body.message));
    assert.deepEqual([h.receipts.at(-1).type, h.receipts.at(-1).status], ['CANCELLATION', 'CANCELLED']);
    assert.equal(h.apt().refundStatus, 'NOT_APPLICABLE');
  } finally { mock.restoreAll(); }
});

test('cancelling an already-cancelled appointment is refused without touching the provider', async () => {
  try {
    const h = harness();
    assert.equal((await h.patientCancel()).status, 200);
    assert.equal((await h.patientCancel()).status, 409);
    assert.equal(h.stripe.refundCalls.length, 1);
    assert.equal(h.refundRows().length, 1);
  } finally { mock.restoreAll(); }
});

test('concurrent patient cancellations refund once', async () => {
  try {
    const h = harness();
    const results = await Promise.all([h.patientCancel(), h.patientCancel(), h.patientCancel()]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409]);
    assert.equal(h.stripe.refundCalls.length, 1);
    assert.equal(h.refundRows().length, 1);
  } finally { mock.restoreAll(); }
});

test('a patient and a doctor cancelling at once refund once', async () => {
  try {
    const h = harness();
    const results = await Promise.all([h.patientCancel(), h.doctorCancel()]);
    assert.equal(results.filter(r => r.status === 200).length, 1, results.map(r => r.status).join());
    assert.equal(h.stripe.refundCalls.length, 1);
    assert.equal(h.refundRows().length, 1);
  } finally { mock.restoreAll(); }
});

test('a doctor cannot cancel a completed appointment', async () => {
  try {
    const h = harness({ appointments: [appointment({ status: 'COMPLETED' })] });
    assert.equal((await h.doctorCancel()).status, 409);
    assert.equal(h.stripe.refundCalls.length, 0);
    assert.equal(h.apt().status, 'COMPLETED');
  } finally { mock.restoreAll(); }
});

test('a doctor cancellation that cannot be saved fails, and a retry reuses the same refund', async () => {
  try {
    const h = harness({ failFinalize: 1 });
    const first = await h.doctorCancel();
    assert.equal(first.status, 500, 'a failed save is not reported as success');
    assert.equal(h.apt().status, 'CONFIRMED'); assert.equal(h.apt().cancellationClaim, undefined, 'claim released for retry');
    const retry = await h.doctorCancel();
    assert.equal(retry.status, 200);
    assert.ok(claimsRefund(retry.body.message));
    assert.equal(new Set(h.stripe.refundCalls.map(c => c.idempotencyKey)).size, 1);
    assert.equal(h.stripe.refunds.size, 1, 'the provider saw one refund');
    assert.equal(h.stripe.created.length, 1, 'the provider holds one refund');
    assert.equal(h.refundRows().length, 1);
    assert.equal(h.apt().status, 'CANCELLED');
  } finally { mock.restoreAll(); }
});

test('a failed doctor refund is not reported as refunded', async () => {
  try {
    const h = harness({ refund: 'throw' });
    const result = await h.doctorCancel();
    assert.equal(result.status, 200);
    assert.ok(!claimsRefund(result.body.message), result.body.message);
    assert.ok(h.notices.every(n => !claimsRefund(n.message)), h.notices.map(n => n.message).join(' | '));
    assert.notEqual(h.receipts.at(-1).status, 'REFUNDED');
    assert.deepEqual(h.refundRows().map(r => r.status), ['FAILED_REQUIRES_MANUAL_REFUND']);
  } finally { mock.restoreAll(); }
});

test('cleanup refunds a doctor no-show with its key, keeps the patient no-show policy, and survives a failed item', async () => {
  try {
    const noShow = appointment({ appointmentId: 'test-no-show', timeSlot: slot(-20 * 60_000) });
    const doctorFault = appointment({ appointmentId: 'test-doctor-fault', timeSlot: slot(-40 * 60_000), patientArrived: true });
    const h = harness({ appointments: [noShow, doctorFault], failFinalize: 1 });
    const first = await h.cleanup();
    assert.equal(first.status, 200);
    assert.equal(first.body.processed, 1, 'one item failed and was skipped, the other completed');
    const second = await h.cleanup();
    assert.equal(second.status, 200);
    assert.equal(h.apt('test-no-show').status, 'CANCELLED_NO_SHOW');
    assert.equal(h.apt('test-doctor-fault').status, 'CANCELLED_DOCTOR_FAULT');
    assert.deepEqual(h.stripe.refundCalls.map(c => c.idempotencyKey).filter((k, i, all) => all.indexOf(k) === i), ['appointment-refund:test-doctor-fault']);
    const rows = Object.fromEntries(h.refundRows().map(r => [r.billId, r.status]));
    assert.deepEqual(rows, { 'refund-test-no-show': 'FAILED_REQUIRES_MANUAL_REFUND', 'refund-test-doctor-fault': 'PROCESSED' });
    const noShowReceipt = h.receipts.find(r => r.appointmentId === 'test-no-show');
    assert.deepEqual([noShowReceipt.type, noShowReceipt.status], ['CANCELLATION', 'NO-SHOW'], 'no credit note for a patient no-show');
    // C13: the no-show refund policy is an owner decision, so the notice must not promise one.
    const noShowNotice = h.notices.find(n => n.metadata?.appointmentId === 'test-no-show');
    assert.ok(noShowNotice, 'the patient is told about the no-show');
    assert.doesNotMatch(noShowNotice.message, /refund/i);
    assert.equal((await h.cleanup()).body.processed, 0, 'nothing is cancelled twice');
  } finally { mock.restoreAll(); }
});

test('booking compensation uses a deterministic key and reports a failed refund truthfully', async () => {
  for (const refund of ['succeeded', 'throw']) {
    try {
      const h = harness({ appointments: [], refund, failFinalize: 1 });
      const result = await h.book();
      assert.equal(result.status, 500);
      assert.deepEqual(h.stripe.refundCalls.map(c => c.idempotencyKey), ['booking-compensation-refund:pi_new']);
      assert.equal(claimsRefund(result.body.error), refund === 'succeeded', `${refund}: ${result.body.error}`);
    } finally { mock.restoreAll(); }
  }
});

test('a cancellation whose claim was taken over is never finalized over the new claimant', async () => {
  for (const cancel of ['patientCancel', 'doctorCancel']) {
    try {
      const h = harness({ beforeFinalize: ({ apt }) => { apt('test-apt').cancellationClaim = 'test-other-claim'; } });
      assert.equal((await h[cancel]()).status, 500, cancel);
      assert.equal(h.apt().status, 'CONFIRMED', `${cancel}: not finalized`);
      assert.equal(h.apt().cancellationClaim, 'test-other-claim', `${cancel}: the other claim is left alone`);
      assert.equal(h.refundRows().length, 0, `${cancel}: no refund row written`);
    } finally { mock.restoreAll(); }
  }
});

// C19: a refund already recorded for this appointment decides the outcome; nothing is refunded or recorded twice.
test('an existing refund record is reused, never overwritten or refunded again', async () => {
  for (const [status, refundStatus] of [['PROCESSED', 'ISSUED'], ['FAILED_REQUIRES_MANUAL_REFUND', 'REQUIRES_MANUAL_REFUND']]) {
    const existing = { billId: 'refund-test-apt', referenceId: 'test-apt', type: 'REFUND', status, amount: -50, note: 'test-operator-record' };
    for (const cancel of ['patientCancel', 'doctorCancel']) {
      try {
        const h = harness({ bills: [existing] });
        const result = await h[cancel]();
        assert.equal(result.status, 200, `${cancel}/${status}`);
        assert.equal(h.stripe.refundCalls.length, 0, `${cancel}/${status}: no provider call`);
        assert.deepEqual(h.refundRows(), [existing], `${cancel}/${status}: ledger unchanged`);
        assert.equal(h.apt().status, 'CANCELLED');
        assert.equal(result.body.refundStatus, refundStatus, `${cancel}/${status}`);
        assert.equal(claimsRefund(result.body.message), status === 'PROCESSED', result.body.message);
      } finally { mock.restoreAll(); }
    }
  }
});

// ── Independent review of 535263b (C11-C21) ──────────────────────────────────────────────────────────────────────

// C11: a stored receipt request for a cancelled appointment follows what actually happened to the money.
test('a receipt for a cancelled appointment is a credit note only when the refund was issued', async () => {
  for (const [label, overrides, expected] of [
    ['issued refund', { status: 'CANCELLED', refundStatus: 'ISSUED' }, ['REFUND', 'REFUNDED', 50]],
    ['manual refund', { status: 'CANCELLED', refundStatus: 'REQUIRES_MANUAL_REFUND' }, ['CANCELLATION', 'REFUND UNDER REVIEW', 50]],
    ['legacy cancellation', { status: 'CANCELLED' }, ['CANCELLATION', 'CANCELLED', 50]],
    // C26: charge.refunded can mark the appointment REFUNDED while the refund itself is still pending.
    ['pending refund marked refunded', { status: 'REFUNDED', refundStatus: 'PENDING' }, ['REFUND', 'REFUND PENDING', 50]],
    ['legacy no-show without an amount', { status: 'CANCELLED_NO_SHOW', amountPaid: undefined }, ['CANCELLATION', 'CANCELLED', 0]],
    ['booking without an amount', { amountPaid: undefined }, ['BOOKING', 'PAID', 0]],
  ]) {
    try {
      const h = harness({ appointments: [appointment(overrides)] });
      const result = await h.receipt();
      assert.equal(result.status, 200, label);
      const r = h.receipts.at(-1);
      assert.deepEqual([r.type, r.status, r.amount], expected, label);
    } finally { mock.restoreAll(); }
  }
});

// C14: a no-show without a real payment leaves no refund-review row.
test('a no-show without a real payment writes no refund-review row', async () => {
  for (const overrides of [{ paymentId: 'TEST_MODE' }, { paymentId: undefined }, { amountPaid: 0 }]) {
    try {
      const h = harness({ appointments: [appointment({ timeSlot: slot(-20 * 60_000), ...overrides })] });
      assert.equal((await h.cleanup()).body.processed, 1, JSON.stringify(overrides));
      assert.equal(h.apt().status, 'CANCELLED_NO_SHOW');
      assert.equal(h.refundRows().length, 0, JSON.stringify(overrides));
    } finally { mock.restoreAll(); }
  }
});

// C15: a claim abandoned by a crashed request expires; a live one still blocks.
test('an expired cancellation claim is taken over and refunded with the same key; a live one is respected', async () => {
  const claimedAt = offset => new Date(Date.now() + offset).toISOString();
  for (const cancel of ['patientCancel', 'doctorCancel', 'cleanup']) {
    try {
      const timeSlot = cancel === 'cleanup' ? slot(-40 * 60_000) : slot(72 * HOUR);
      const h = harness({ appointments: [appointment({ timeSlot, patientArrived: cancel === 'cleanup' ? true : undefined,
        cancellationClaim: 'test-crashed-claim', cancellationClaimedAt: claimedAt(-2 * HOUR) })] });
      const result = await h[cancel]();
      assert.equal(result.status, 200, cancel);
      assert.equal(h.apt().cancellationClaim, undefined, `${cancel}: finalized`);
      assert.match(h.apt().status, /^CANCELLED/, cancel);
      assert.deepEqual(h.stripe.refundCalls.map(c => c.idempotencyKey), ['appointment-refund:test-apt'], cancel);
    } finally { mock.restoreAll(); }
    try {
      const h = harness({ appointments: [appointment({ cancellationClaim: 'test-live-claim', cancellationClaimedAt: claimedAt(-60_000) })] });
      if (cancel === 'cleanup') continue;
      assert.equal((await h[cancel]()).status, 409, `${cancel}: live claim`);
      assert.equal(h.stripe.refundCalls.length, 0);
      assert.equal(h.apt().cancellationClaim, 'test-live-claim');
    } finally { mock.restoreAll(); }
  }
});

// C16: the charge.refunded webhook marks the appointment REFUNDED; it must still be possible to finish cancelling it.
test('a refunded appointment whose cancellation was not saved can still be cancelled, without a second refund', async () => {
  for (const cancel of ['patientCancel', 'doctorCancel']) {
    try {
      const h = harness({ failFinalize: 1 });
      assert.equal((await h[cancel]()).status, 500, cancel);
      h.apt().status = 'REFUNDED'; // what handleChargeRefunded writes for our own refund
      const retry = await h[cancel]();
      assert.equal(retry.status, 200, cancel);
      assert.equal(h.apt().status, 'CANCELLED');
      assert.equal(h.stripe.created.length, 1, `${cancel}: one refund at the provider`);
      assert.equal(h.refundRows().length, 1);
      assert.equal(h.lock(), undefined, `${cancel}: slot released`);
    } finally { mock.restoreAll(); }
  }
});

// C17: once Stripe forgets the key (after 24h), our own refund is still found by its metadata, across list pages.
test('a retry after the idempotency key expired reuses the refund already made', async () => {
  try {
    const other = { id: 're_test_dashboard_partial', object: 'refund', status: 'succeeded', payment_intent: 'pi_test', metadata: {} };
    const h = harness({ failFinalize: 1 });
    assert.equal((await h.doctorCancel()).status, 500);
    h.stripe.expireKeys();
    h.stripe.created.push(other); // a newer unrelated refund, so ours is on the second page
    const retry = await h.doctorCancel();
    assert.equal(retry.status, 200);
    assert.equal(h.stripe.created.length, 2, 'no second appointment refund');
    assert.equal(h.apt().refundId, 're_test_1');
    assert.equal(retry.body.refundStatus, 'ISSUED');
  } finally { mock.restoreAll(); }
});

// C17: a charge someone else already refunded in full has its money back; the outcome follows the provider's record.
test('a charge that was already refunded elsewhere is reported from the provider record', async () => {
  for (const [label, providerRefunds, expected] of [
    ['refunded elsewhere', [{ id: 're_test_erasure', object: 'refund', status: 'succeeded', payment_intent: 'pi_test', metadata: {} }], ['ISSUED', 'PROCESSED']],
    ['no refund on record', [], ['REQUIRES_MANUAL_REFUND', 'FAILED_REQUIRES_MANUAL_REFUND']],
  ]) {
    try {
      const h = harness({ refund: 'already_refunded', providerRefunds });
      const result = await h.patientCancel();
      assert.equal(result.status, 200, label);
      assert.equal(result.body.refundStatus, expected[0], label);
      assert.deepEqual(h.refundRows().map(r => r.status), [expected[1]], label);
    } finally { mock.restoreAll(); }
  }
});

// C18: an account erasure that lands during a cancellation keeps the anonymized record.
test('an erasure during a cancellation is never overwritten with the pre-erasure record', async () => {
  for (const cancel of ['patientCancel', 'doctorCancel']) {
    try {
      const h = harness({ beforeFinalize: ({ apt }) => Object.assign(apt('test-apt'), {
        status: 'CANCELLED', patientName: 'ANONYMIZED_GDPR', resource: { resourceType: 'Appointment', status: 'cancelled', participant: [] } }) });
      await h[cancel]();
      assert.equal(h.apt().patientName, 'ANONYMIZED_GDPR', cancel);
      assert.deepEqual(h.apt().resource.participant, [], `${cancel}: erased participants stay erased`);
      assert.equal(h.refundRows().length, 0, cancel);
    } finally { mock.restoreAll(); }
  }
});

// C18: while a cancellation is in flight nothing else may change the appointment it is cancelling.
test('status changes and check-in wait for a live cancellation; an expired claim does not block them', async () => {
  const claimedAt = offset => new Date(Date.now() + offset).toISOString();
  for (const [label, act] of [['doctor status', h => h.doctorUpdate({ status: 'IN_PROGRESS' })], ['check-in', h => h.patientCheckIn()]]) {
    try {
      const h = harness({ appointments: [appointment({ cancellationClaim: 'test-live-claim', cancellationClaimedAt: claimedAt(-60_000) })] });
      assert.equal((await act(h)).status, 409, label);
      assert.equal(h.apt().status, 'CONFIRMED'); assert.equal(h.apt().patientArrived, undefined);
    } finally { mock.restoreAll(); }
    try {
      const h = harness({ appointments: [appointment({ cancellationClaim: 'test-crashed-claim', cancellationClaimedAt: claimedAt(-2 * HOUR) })] });
      assert.equal((await act(h)).status, 200, `${label}: expired claim`);
    } finally { mock.restoreAll(); }
  }
});

// C18: cleanup decides no-show vs doctor fault from an index that may lag; the claim pins the fact it decided from.
test('cleanup never records a no-show for a patient who checked in after the index was read', async () => {
  try {
    const h = harness({ appointments: [appointment({ timeSlot: slot(-20 * 60_000) })],
      afterStatusQuery: ({ apt }) => { apt('test-apt').patientArrived = true; } });
    assert.equal((await h.cleanup()).body.processed, 0);
    assert.equal(h.apt().status, 'CONFIRMED');
    assert.equal(h.apt().cancellationClaim, undefined);
  } finally { mock.restoreAll(); }
});

// C21: a save that committed but whose reply was lost is a completed cancellation, not a failure.
test('a cancellation whose save committed but timed out reports success', async () => {
  for (const cancel of ['patientCancel', 'doctorCancel']) {
    try {
      const h = harness({ commitThenFail: 1 });
      const result = await h[cancel]();
      assert.equal(result.status, 200, cancel);
      assert.equal(h.apt().status, 'CANCELLED');
      assert.equal(h.refundRows().length, 1);
    } finally { mock.restoreAll(); }
  }
});

// C24 (review #2 B1): charge.refunded marks a FINISHED cancellation REFUNDED too; it must never be cancelled again,
// or the second finalize deletes the slot lock of a patient who has since rebooked that slot.
test('a finished cancellation later marked refunded is never cancelled again and keeps the rebooked slot lock', async () => {
  for (const cancel of ['patientCancel', 'doctorCancel']) {
    try {
      const h = harness();
      assert.equal((await h[cancel]()).status, 200, cancel);
      h.apt().status = 'REFUNDED'; // what handleChargeRefunded writes when our refund lands
      assert.equal(h.lock(h.apt()), undefined, `${cancel}: first cancellation freed the slot`);
      h.put(LOCKS, { lockId: `test-doctor#${h.apt().timeSlot}`, status: 'BOOKED', appointmentId: 'test-other-apt' }); // another patient rebooks
      const [notices, receipts] = [h.notices.length, h.receipts.length];
      const again = await h[cancel]();
      assert.equal(again.status, 409, `${cancel}: second cancellation refused`);
      assert.equal(h.notices.length, notices, `${cancel}: no second notice`);
      assert.equal(h.receipts.length, receipts, `${cancel}: no second receipt`);
      assert.equal(h.lock(h.apt())?.appointmentId, 'test-other-apt', `${cancel}: rebooked lock kept`);
      assert.equal(h.stripe.created.length, 1);
    } finally { mock.restoreAll(); }
  }
});

test('an earlier cancellation of any writer, later marked refunded, is never cancelled again', async () => {
  const booked = appointment().resource;
  for (const [label, marker] of [
    ['legacy patient cancel (FHIR status only)', { resource: { ...booked, status: 'cancelled' } }],
    ['legacy doctor cancel without a resource (refundId only)', { resource: null, refundId: 'NOT_APPLICABLE' }],
    ['cancellation without a resource (cancellationId only)', { resource: null, cancellationId: 'test-claim' }],
  ]) {
    for (const cancel of ['patientCancel', 'doctorCancel']) {
      try {
        const h = harness({ appointments: [appointment({ status: 'REFUNDED', paymentStatus: 'refunded', ...marker })] });
        const again = await h[cancel]();
        assert.equal(again.status, 409, `${label}: ${cancel}`);
        assert.equal(h.notices.length, 0); assert.equal(h.stripe.refundCalls.length, 0);
        assert.ok(h.lock(), `${label}: ${cancel}: slot lock untouched`);
      } finally { mock.restoreAll(); }
    }
  }
});

// C25 (review #2 M4): the refund list is bounded by configuration; past the bound the refund goes to a person.
test('a refund list longer than the configured page bound goes to manual review instead of refunding', async () => {
  const previous = process.env.CANCELLATION_REFUND_MAX_PAGES;
  process.env.CANCELLATION_REFUND_MAX_PAGES = '2';
  try {
    const others = [1, 2, 3, 4].map(n => ({ id: `re_test_other_${n}`, object: 'refund', status: 'succeeded', payment_intent: 'pi_test', metadata: {} }));
    const h = harness({ providerRefunds: others });
    const result = await h.doctorCancel();
    assert.equal(result.status, 200);
    assert.equal(result.body.refundStatus, 'REQUIRES_MANUAL_REFUND');
    assert.equal(h.stripe.refundCalls.length, 0, 'no refund created from an incomplete list');
    assert.ok(h.stripe.listCalls <= 2, `listed ${h.stripe.listCalls} pages`);
  } finally { restoreSetting('CANCELLATION_REFUND_MAX_PAGES', previous); mock.restoreAll(); }
});

// C27 (review #3 F2): the refund page bound is only needed to refund; a missing value never breaks check-in or status.
test('a missing refund page bound breaks neither check-in nor a doctor status change, and a refund goes to review', async () => {
  const previous = process.env.CANCELLATION_REFUND_MAX_PAGES;
  delete process.env.CANCELLATION_REFUND_MAX_PAGES;
  try {
    let h = harness();
    assert.equal((await h.patientCheckIn()).status, 200, 'check-in');
    assert.equal((await h.doctorUpdate({ status: 'IN_PROGRESS' })).status, 200, 'status change');
    mock.restoreAll(); h = harness();
    const cancelled = await h.doctorCancel();
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.refundStatus, 'REQUIRES_MANUAL_REFUND');
    assert.equal(h.stripe.refundCalls.length, 0);
  } finally { restoreSetting('CANCELLATION_REFUND_MAX_PAGES', previous); mock.restoreAll(); }
});
