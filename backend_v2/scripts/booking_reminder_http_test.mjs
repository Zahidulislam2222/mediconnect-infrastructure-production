// F1 (memory/followups-2-acceptance-20260926.md): appointment reminders reach only the appointment's own patient, at the
// decrypted contact on their profile, are sent once per 24h/1h type, and only the appointment's doctor or patient can
// send or read them. Drives the real reminder controller with an in-memory DynamoDB and SNS/SES doubles; no provider requests.
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
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const kms = require('./dist/shared/kms-crypto.js');
const logger = require('./dist/shared/logger.js');
const notifications = require('./dist/shared/notifications.js');
const eventBus = require('./dist/shared/event-bus.js');

const APPOINTMENTS = process.env.TABLE_APPOINTMENTS, REMINDERS = process.env.TABLE_REMINDERS;
const PATIENTS = process.env.TABLE_PATIENTS, DOCTORS = process.env.TABLE_DOCTORS;
const KEYS = { [APPOINTMENTS]: ['appointmentId'], [REMINDERS]: ['reminderId', 'appointmentId'], [PATIENTS]: ['patientId'], [DOCTORS]: ['doctorId'] };
const PHONE = '+15550100', EMAIL = 'patient@example.test';
const HOUR = 3600_000;
const inHours = hours => new Date(Date.now() + hours * HOUR).toISOString();

const resolve = (path, names = {}) => path.startsWith('#') ? names[path] : path;
// Evaluates only the condition forms a reminder claim may use; anything else throws so it cannot silently pass.
function holds(item, expression, names = {}, values = {}) {
  if (!expression) return true;
  return expression.split(/\s+OR\s+/).some(clause => {
    let m;
    clause = clause.trim().replace(/^\((.*)\)$/, '$1');
    if ((m = clause.match(/^attribute_not_exists\((\S+)\)$/))) return item?.[resolve(m[1], names)] === undefined;
    if ((m = clause.match(/^(\S+)\s*=\s*(:\w+)$/))) return item !== undefined && item[resolve(m[1], names)] === values[m[2]];
    throw new Error(`Test double cannot evaluate condition: ${clause}`);
  });
}
function apply(item, expression, names = {}, values = {}) {
  const [setPart, removePart = ''] = expression.replace(/^SET\s+/i, '').split(/\s+REMOVE\s+/i);
  for (const assignment of setPart.split(',')) {
    const [target, source] = assignment.split('=').map(s => s.trim());
    if (!/^:\w+$/.test(source)) throw new Error(`Test double cannot apply update: ${assignment}`);
    item[resolve(target, names)] = structuredClone(values[source]);
  }
  for (const path of removePart.split(',').filter(Boolean)) delete item[resolve(path.trim(), names)];
}
const conditional = () => Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' });

const appointment = (overrides = {}) => ({
  appointmentId: 'test-apt', patientId: 'test-patient', doctorId: 'test-doctor', timeSlot: inHours(20), status: 'CONFIRMED',
  reason: 'test-reason', patientName: 'phi:kms:phi:kms:double-encrypted', doctorName: 'phi:kms:phi:kms:double-encrypted', ...overrides,
});

function harness({ region = 'EU', appointments = [appointment()], profile = {}, failSms = 0, failDecrypt = false } = {}) {
  const rows = new Map();
  const key = (table, item) => `${table}|${KEYS[table].map(k => item[k]).join('|')}`;
  const put = (table, item) => rows.set(key(table, item), structuredClone(item));
  const get = (table, k) => rows.get(key(table, k));
  const table = name => [...rows.entries()].filter(([k]) => k.startsWith(`${name}|`)).map(([, v]) => structuredClone(v));
  for (const apt of appointments) put(APPOINTMENTS, apt);
  put(PATIENTS, { patientId: 'test-patient', name: 'phi:kms:Test Patient', phone: `phi:kms:${PHONE}`, email: `phi:kms:${EMAIL}`, ...profile });
  put(DOCTORS, { doctorId: 'test-doctor', name: 'phi:kms:Test Doctor' });
  put(DOCTORS, { doctorId: 'other-doctor', name: 'phi:kms:Other Doctor' });

  const reads = [], sms = [], emails = [], snsRegions = [], decryptRegions = [];
  let smsFailures = failSms;
  mock.method(audit, 'writeAuditLog', async () => {});
  mock.method(eventBus, 'publishEvent', async () => {});
  mock.method(logger, 'safeLog', () => {});
  const errors = mock.method(logger, 'safeError', () => {});
  mock.method(notifications, 'sendNotification', async notice => { emails.push(notice); });
  mock.method(kms, 'decryptPHI', async (fields, keyRegion) => {
    decryptRegions.push(keyRegion);
    if (failDecrypt) throw new Error('test KMS outage');
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v).replace(/^phi:kms:/, '')]));
  });
  mock.method(aws, 'getRegionalSNSClient', snsRegion => ({ send: async command => {
    snsRegions.push(snsRegion);
    const input = command.input;
    // The claim is written before anything is sent (F1e).
    const claimed = table(REMINDERS).some(r => r.appointmentId === 'test-apt' && r.status === 'sending');
    sms.push({ ...input, claimed });
    if (smsFailures > 0) { smsFailures--; throw new Error('test SNS outage'); }
    return { MessageId: `test-msg-${sms.length}` };
  } }));
  mock.method(aws, 'getRegionalClient', () => ({ send: async command => {
    await new Promise(done => setImmediate(done));
    const input = command.input, kind = command.constructor.name;
    if (kind === 'GetCommand') {
      reads.push(input.TableName);
      return { Item: structuredClone(get(input.TableName, input.Key)) };
    }
    if (kind === 'PutCommand') {
      if (!holds(get(input.TableName, input.Item), input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) throw conditional();
      put(input.TableName, input.Item); return {};
    }
    if (kind === 'UpdateCommand') {
      const current = get(input.TableName, input.Key);
      if (!holds(current, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues)) throw conditional();
      const next = structuredClone(current ?? input.Key);
      apply(next, input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues);
      put(input.TableName, next); return {};
    }
    if (kind === 'QueryCommand') {
      // One item per page, so a handler that ignores LastEvaluatedKey misses appointments.
      assert.equal(input.TableName, APPOINTMENTS);
      assert.equal(input.IndexName, 'DoctorIndex');
      const doctorId = input.ExpressionAttributeValues[':did'];
      const all = table(APPOINTMENTS).filter(a => a.doctorId === doctorId).sort((a, b) => a.appointmentId.localeCompare(b.appointmentId));
      const start = input.ExclusiveStartKey ? all.findIndex(a => a.appointmentId === input.ExclusiveStartKey.appointmentId) + 1 : 0;
      const page = all.slice(start, start + 1);
      return { Items: page, LastEvaluatedKey: start + 1 < all.length ? { appointmentId: page[0].appointmentId } : undefined };
    }
    if (kind === 'ScanCommand') {
      assert.equal(input.TableName, REMINDERS, 'appointments are never scanned');
      const all = table(REMINDERS).filter(r => r.appointmentId === input.ExpressionAttributeValues[':aid'])
        .sort((a, b) => a.reminderId.localeCompare(b.reminderId));
      const start = input.ExclusiveStartKey ? all.findIndex(r => r.reminderId === input.ExclusiveStartKey.reminderId) + 1 : 0;
      const page = all.slice(start, start + 1);
      return { Items: page, LastEvaluatedKey: start + 1 < all.length ? { reminderId: page[0].reminderId, appointmentId: page[0].appointmentId } : undefined };
    }
    throw new Error(`Unexpected command ${kind}`);
  } }));

  const controller = require('./dist/booking-service/src/controllers/reminder.controller.js');
  const invoke = (handler, req) => new Promise(done => {
    const result = { status: 200 };
    const res = { status(code) { result.status = code; return this; }, json(body) { result.body = body; done(result); return this; } };
    Promise.resolve(handler({ headers: {}, params: {}, body: {}, ...req }, res)).catch(error => { result.status = 500; result.error = error; done(result); });
  });
  const as = (id, isDoctor) => ({ id, sub: id, region, isDoctor, isPatient: !isDoctor });
  const doctor = as('test-doctor', true), patient = as('test-patient', false);
  return {
    reads, sms, emails, snsRegions, decryptRegions, errors, doctor, patient, as,
    reminders: () => table(REMINDERS),
    send: (user, body = {}, appointmentId = 'test-apt') => invoke(controller.sendAppointmentReminder, { params: { appointmentId }, body, user }),
    pending: user => invoke(controller.getPendingReminders, { user }),
    list: (user, appointmentId = 'test-apt') => invoke(controller.getAppointmentReminders, { params: { appointmentId }, user }),
  };
}

const run = fn => async () => { try { await fn(); } finally { mock.restoreAll(); } };
/** Nothing the caller sees may carry ciphertext, the patient's contact details or provider error text. */
function assertClean(result) {
  const text = JSON.stringify(result.body ?? {});
  for (const bit of ['phi:', PHONE, EMAIL, 'test SNS outage', 'test KMS outage']) assert.ok(!text.includes(bit), `response leaks ${bit}: ${text}`);
}

test('F1a/F1c/F1d: the doctor\'s 24h reminder goes by SMS to the decrypted phone and by email to the decrypted address', run(async () => {
  const h = harness();
  const result = await h.send(h.doctor, { type: '24h' });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assertClean(result);
  assert.equal(h.sms.length, 1);
  assert.equal(h.sms[0].PhoneNumber, PHONE);
  assert.equal(h.sms[0].TopicArn, undefined, 'never published to a shared topic');
  assert.ok(h.sms[0].claimed, 'claimed before sending');
  assert.match(h.sms[0].Message, /Dr\. Test Doctor/);
  assert.deepEqual(h.emails.map(e => e.recipientEmail), [EMAIL]);
  assert.match(h.emails[0].message, /Dear Test Patient,/);
  assert.match(h.emails[0].message, /Dr\. Test Doctor/);
  for (const text of [h.sms[0].Message, h.emails[0].message, h.emails[0].subject]) assert.ok(!text.includes('phi:'), text);
  assert.ok(h.snsRegions.every(r => r === 'EU') && h.decryptRegions.length > 0 && h.decryptRegions.every(r => r === 'EU'), 'request region used');
  const [row] = h.reminders();
  assert.equal(row.reminderId, 'test-apt#24h');
  assert.equal(row.status, 'sent');
  assert.deepEqual(row.deliveries, { sms: 'sent', email: 'submitted' });
  assert.equal(result.body.status, 'sent');
}));

test('F1b: the appointment\'s own patient may send a 24h reminder', run(async () => {
  const h = harness();
  assert.equal((await h.send(h.patient, { type: '24h', channel: 'sms' })).status, 200);
  assert.equal(h.sms.length, 1);
}));

test('F1b: another doctor or patient gets 403 before any profile is read or anything is sent', run(async () => {
  for (const outsider of [['other-doctor', true], ['other-patient', false], ['test-doctor', false], ['test-patient', true]]) {
    const h = harness();
    const user = h.as(...outsider);
    for (const call of [() => h.send(user, { type: '24h' }), () => h.list(user)]) {
      const result = await call();
      assert.equal(result.status, 403, `${outsider}: ${JSON.stringify(result.body)}`);
    }
    assert.ok(!h.reads.includes(PATIENTS) && !h.reads.includes(DOCTORS), `${outsider}: no profile read`);
    assert.equal(h.sms.length + h.emails.length, 0);
    assert.equal(h.reminders().length, 0);
    mock.restoreAll();
  }
}));

test('F1b+: a custom message is the doctor\'s alone; each is sent, and template text inside it is inserted literally', run(async () => {
  const h = harness();
  assert.equal((await h.send(h.patient, { type: 'custom', customMessage: 'test' })).status, 403);
  assert.equal(h.sms.length, 0);
  const message = 'Bring $& and {{patientName}} and $1';
  for (let i = 0; i < 2; i++) assert.equal((await h.send(h.doctor, { type: 'custom', customMessage: message, channel: 'sms' })).status, 200);
  assert.equal(h.sms.length, 2, 'custom reminders are not deduplicated');
  assert.ok(h.sms.every(s => s.Message === `MediConnect: ${message}`), h.sms.map(s => s.Message).join(' | '));
  assert.equal(new Set(h.reminders().map(r => r.reminderId)).size, 2);
}));

test('F1a: a missing appointment is 404 and is found by key, not by a scan', run(async () => {
  const many = Array.from({ length: 5 }, (_, i) => appointment({ appointmentId: `test-apt-${i}` }));
  const h = harness({ appointments: [...many, appointment()] });
  assert.equal((await h.send(h.doctor, { type: '24h' }, 'test-missing')).status, 404);
  assert.equal((await h.send(h.doctor, { type: '24h', channel: 'sms' })).status, 200, 'found among many');
}));

test('F1g: a reminder for an appointment that is not confirmed is refused without a claim or a send', run(async () => {
  for (const status of ['CANCELLED', 'COMPLETED', 'PENDING_PAYMENT']) {
    const h = harness({ appointments: [appointment({ status })] });
    const result = await h.send(h.doctor, { type: '24h' });
    assert.equal(result.status, 409, status);
    assert.equal(h.sms.length + h.emails.length + h.reminders().length, 0, status);
    mock.restoreAll();
  }
}));

test('F1e: a repeated 24h reminder is 409 with no second send; a failed one may be retried', run(async () => {
  const h = harness({ failSms: 1 });
  const failed = await h.send(h.doctor, { type: '24h', channel: 'sms' });
  assert.equal(failed.status, 200);
  assert.equal(failed.body.status, 'failed');
  assertClean(failed);
  assert.equal(h.reminders()[0].status, 'failed');
  assert.equal(h.reminders()[0].deliveries.sms, 'failed');
  const retried = await h.send(h.doctor, { type: '24h', channel: 'sms' });
  assert.equal(retried.body.status, 'sent', 'a failed reminder can be retried');
  assert.equal((await h.send(h.patient, { type: '24h', channel: 'sms' })).status, 409);
  assert.equal(h.sms.length, 2);
  assert.equal(h.reminders().length, 1);
  assert.equal((await h.send(h.doctor, { type: '1h' })).status, 200, 'a different type is its own reminder');
}));

test('F1e: two simultaneous 24h reminders send once', run(async () => {
  const h = harness();
  const results = await Promise.all([h.send(h.doctor, { type: '24h', channel: 'sms' }), h.send(h.patient, { type: '24h', channel: 'sms' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(h.sms.length, 1);
}));

test('F1d: a requested channel without a contact is recorded as such; nothing attemptable means failed', run(async () => {
  const h = harness({ profile: { email: '' } });
  const result = await h.send(h.doctor, { type: '24h' });
  assert.equal(result.body.status, 'sent');
  assert.deepEqual(h.reminders()[0].deliveries, { sms: 'sent', email: 'no_contact' });
  assert.equal(h.emails.length, 0);
  mock.restoreAll();
  const none = harness({ profile: { phone: '' } });
  const smsOnly = await none.send(none.doctor, { type: '1h', channel: 'sms' });
  assert.equal(smsOnly.body.status, 'failed');
  assert.deepEqual(none.reminders()[0].deliveries, { sms: 'no_contact' });
  assert.equal(none.sms.length, 0);
}));

test('F1c/F1f: an undecryptable profile sends nothing and says nothing about why', run(async () => {
  const h = harness({ failDecrypt: true });
  const result = await h.send(h.doctor, { type: '24h' });
  assert.equal(result.body.status, 'failed');
  assertClean(result);
  assert.equal(h.sms.length + h.emails.length, 0);
  assert.equal(h.reminders()[0].status, 'failed', 'so it can be retried');
}));

test('F1c+: a name that is still ciphertext after decryption becomes the generic word', run(async () => {
  const h = harness({ profile: { name: 'phi:kms:phi:kms:still-encrypted' } });
  await h.send(h.doctor, { type: '24h', channel: 'email' });
  assert.match(h.emails[0].message, /^Dear Patient,/);
  assert.ok(!h.emails[0].message.includes('phi:'));
}));

test('F1b: pending reminders are the requesting doctor\'s own upcoming appointments, across every page', run(async () => {
  const h = harness({ appointments: [
    appointment({ appointmentId: 'test-apt' }),
    appointment({ appointmentId: 'test-apt-b' }),
    appointment({ appointmentId: 'test-apt-c', timeSlot: inHours(30) }),
    appointment({ appointmentId: 'test-apt-d', status: 'CANCELLED' }),
    appointment({ appointmentId: 'test-apt-e', doctorId: 'other-doctor' }),
    appointment({ appointmentId: 'test-apt-f' }),
  ] });
  assert.equal((await h.pending(h.patient)).status, 403);
  assert.equal((await h.send(h.doctor, { type: '24h', channel: 'sms' })).status, 200);
  const result = await h.pending(h.doctor);
  assert.equal(result.status, 200);
  assertClean(result);
  assert.deepEqual(result.body.pendingReminders.map(p => p.appointmentId).sort(), ['test-apt-b', 'test-apt-f']);
  assert.equal(result.body.upcomingInNext24h, 3);
}));

test('F1b: a participant sees every reminder of the appointment', run(async () => {
  const h = harness();
  await h.send(h.doctor, { type: '24h', channel: 'sms' });
  await h.send(h.doctor, { type: '1h', channel: 'sms' });
  await h.send(h.doctor, { type: 'custom', customMessage: 'test', channel: 'sms' });
  const result = await h.list(h.patient);
  assert.equal(result.status, 200);
  assertClean(result);
  assert.equal(result.body.total, 3, 'all pages read');
}));

test('F1d: a failed SMS marks the reminder failed even when the email was submitted', run(async () => {
  const h = harness({ failSms: 1 });
  const result = await h.send(h.doctor, { type: '24h' });
  assert.equal(result.body.status, 'failed');
  assert.deepEqual(h.reminders()[0].deliveries, { sms: 'failed', email: 'submitted' });
  assert.equal(h.reminders()[0].status, 'failed');
}));
