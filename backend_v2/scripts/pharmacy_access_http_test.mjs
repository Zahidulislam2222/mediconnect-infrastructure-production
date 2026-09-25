import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = /^(TABLE_|DYNAMO_TABLE)/.test(match[1])
    ? `test-${match[1].toLowerCase().replaceAll('_', '-')}` : match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.COGNITO_USER_POOL_ID_US = 'us-east-1_test';
process.env.COGNITO_USER_POOL_ID_EU = 'eu-central-1_test';
const require = createRequire(new URL('../doctor-service/package.json', import.meta.url));
const express = require('express');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const notifications = require('./dist/shared/notifications.js');
const eventBus = require('./dist/shared/event-bus.js');

// Minimal DynamoDB double: evaluates the condition/update forms the pharmacy controller uses and
// fails closed (throws) on anything it does not understand, so an unmodelled expression cannot pass.
const RX = 'mediconnect-prescriptions', BILLS = 'mediconnect-transactions', GRAPH = 'mediconnect-graph-data';
const keyOf = (table, key) => `${table}|${JSON.stringify(key, Object.keys(key).sort())}`;
function resolvePath(path, names) { return path.split('.').map(part => part.startsWith('#') ? names[part] : part); }
function readPath(item, path) { return path.reduce((value, part) => value?.[part], item); }
function evaluateCondition(item, expression, names = {}, values = {}) {
  if (!expression) return true;
  return expression.split(/\s+AND\s+/).every(raw => {
    const clause = raw.trim().replace(/^\((.*)\)$/, '$1');
    let m;
    if ((m = clause.match(/^attribute_not_exists\((\S+)\)$/))) return readPath(item, resolvePath(m[1], names)) === undefined;
    if ((m = clause.match(/^attribute_exists\((\S+)\)$/))) return readPath(item, resolvePath(m[1], names)) !== undefined;
    if ((m = clause.match(/^NOT\s*\(?\s*(\S+)\s+IN\s+\(([^)]*)\)\s*\)?$/))) return !m[2].split(',').map(v => values[v.trim()]).includes(readPath(item, resolvePath(m[1], names)));
    if ((m = clause.match(/^(\S+)\s+IN\s+\(([^)]*)\)$/))) return m[2].split(',').map(v => values[v.trim()]).includes(readPath(item, resolvePath(m[1], names)));
    if ((m = clause.match(/^(\S+)\s*(=|<>|>)\s*(:\w+)$/))) {
      const left = readPath(item, resolvePath(m[1], names)), right = values[m[3]];
      return m[2] === '=' ? left === right : m[2] === '<>' ? left !== right : left > right;
    }
    throw new Error(`Test double cannot evaluate condition: ${clause}`);
  });
}
function applyUpdate(item, expression, names = {}, values = {}) {
  const body = expression.replace(/^SET\s+/i, '');
  if (/\b(REMOVE|ADD|DELETE)\b/.test(body)) throw new Error(`Test double cannot apply update: ${expression}`);
  for (const assignment of body.split(',')) {
    const [target, source] = assignment.split('=').map(s => s.trim());
    const path = resolvePath(target, names);
    let value;
    let m;
    if ((m = source.match(/^(\S+)\s*-\s*(:\w+)$/))) value = readPath(item, resolvePath(m[1], names)) - values[m[2]];
    else if (/^:\w+$/.test(source)) value = values[source];
    else throw new Error(`Test double cannot apply update: ${assignment}`);
    let parent = item;
    for (const part of path.slice(0, -1)) parent = parent[part] ??= {};
    parent[path.at(-1)] = value;
  }
}
function conditionalFailure(name) { const error = new Error(`${name}: The conditional request failed`); error.name = name; return error; }

function createStore() {
  const tables = new Map();
  const put = (table, item, keyNames) => tables.set(keyOf(table, Object.fromEntries(keyNames.map(k => [k, item[k]]))), structuredClone(item));
  const get = (table, key) => tables.get(keyOf(table, key));
  const bills = () => [...tables.entries()].filter(([k]) => k.startsWith(`${BILLS}|`)).map(([, v]) => v);
  const rows = table => [...tables.entries()].filter(([k]) => k.startsWith(`${table}|`)).map(([, v]) => v);
  return { tables, put, get, bills, rows };
}

const baseRx = () => ({
  prescriptionId: 'rx-1', patientId: 'pat-1', doctorId: 'doc-1', medication: 'test-med', price: 10,
  status: 'DISPENSED', paymentStatus: 'PAID', refillsRemaining: 2, resource: { status: 'active' },
});

for (const region of ['US', 'EU']) {
  test(`${region}: pharmacy routes enforce ownership, payment and atomic state transitions`, async () => {
    const store = createStore();
    const seed = (overrides = {}) => {
      store.tables.clear();
      store.put(RX, { ...baseRx(), ...overrides }, ['prescriptionId']);
      store.put(RX, { ...baseRx(), prescriptionId: 'rx-2', patientId: 'pat-2', doctorId: 'doc-2' }, ['prescriptionId']);
      for (const doctorId of ['doc-1', 'doc-2', 'doc-3']) store.put(process.env.DYNAMO_TABLE, { doctorId, verificationStatus: 'APPROVED', isIdentityVerified: true }, ['doctorId']);
      store.put(GRAPH, { PK: 'PATIENT#pat-1', SK: 'DOCTOR#doc-3', relationship: 'isTreatedBy' }, ['PK', 'SK']);
    };
    const identities = {
      'pat-1': { sub: 'pat-1', 'cognito:groups': ['patient'] }, 'pat-2': { sub: 'pat-2', 'cognito:groups': ['patient'] },
      'doc-1': { sub: 'doc-1', 'cognito:groups': ['doctor'] }, 'doc-2': { sub: 'doc-2', 'cognito:groups': ['doctor'] },
      'doc-3': { sub: 'doc-3', 'cognito:groups': ['doctor'] },
    };
    mock.method(CognitoJwtVerifier, 'create', config => ({ verify: async token => {
      assert.equal(config.userPoolId, process.env[`COGNITO_USER_POOL_ID_${region}`]);
      const [tokenRegion, actor] = token.split(':');
      if (tokenRegion !== region || !identities[actor]) throw new Error('Test wrong regional token');
      return identities[actor];
    } }));
    const keyNamesFor = table => table === RX ? ['prescriptionId'] : table === BILLS ? ['billId'] : table === GRAPH ? ['PK', 'SK']
      : table === process.env.DYNAMO_TABLE ? ['doctorId'] : null;
    mock.method(aws, 'getRegionalClient', selected => {
      assert.equal(selected, region);
      return { send: async command => {
        await new Promise(resolve => setImmediate(resolve)); // let concurrent requests interleave like a network hop
        const input = command.input, kind = command.constructor.name;
        if (kind === 'GetCommand') {
          const item = store.get(input.TableName, input.Key);
          return { Item: item ? structuredClone(item) : undefined };
        }
        if (kind === 'DeleteCommand') { store.tables.delete(keyOf(input.TableName, input.Key)); return {}; }
        if (kind === 'QueryCommand' && input.TableName === BILLS) {
          assert.equal(input.IndexName, 'PatientIndex', 'The ledger has no reference index');
          const values = input.ExpressionAttributeValues;
          // hiddenFromIndex models GSI replication lag: the row exists but the index has not caught up.
          return { Items: store.bills().filter(bill => !bill.hiddenFromIndex && bill.patientId === values[':pid'] && bill.referenceId === values[':rid']).map(bill => structuredClone(bill)) };
        }
        if (kind === 'QueryCommand') {
          assert.equal(input.TableName, RX, 'Only prescription queries are expected');
          const field = input.IndexName === 'PatientIndex' ? 'patientId' : input.IndexName === 'DoctorIndex' ? 'doctorId' : null;
          assert.ok(field, `Unexpected index ${input.IndexName}`);
          return { Items: store.rows(RX).filter(rx => rx[field] === input.ExpressionAttributeValues[':id']).map(rx => structuredClone(rx)) };
        }
        if (kind === 'UpdateCommand') {
          // beforeUpdate lets a test commit a competing write between the handler's read and its update.
          const competingUpdate = store.beforeUpdate; store.beforeUpdate = null; competingUpdate?.();
          const item = store.get(input.TableName, input.Key);
          if (!item || !evaluateCondition(item, input.ConditionExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues))
            throw conditionalFailure('ConditionalCheckFailedException');
          applyUpdate(item, input.UpdateExpression, input.ExpressionAttributeNames, input.ExpressionAttributeValues);
          return {};
        }
        if (kind === 'TransactWriteCommand') {
          // beforeTransact lets a test commit a competing write between the handler's reads and its transaction.
          const competing = store.beforeTransact; store.beforeTransact = null; competing?.();
          if (store.transientFailures > 0) {
            store.transientFailures--;
            throw Object.assign(conditionalFailure('TransactionCanceledException'), { CancellationReasons: input.TransactItems.map(() => ({ Code: 'TransactionConflict' })) });
          }
          const staged = input.TransactItems.map(entry => {
            const [op, spec] = Object.entries(entry)[0];
            const keyNames = keyNamesFor(spec.TableName);
            assert.ok(keyNames, `Unexpected transaction table ${spec.TableName}`);
            const key = op === 'Put' ? Object.fromEntries(keyNames.map(k => [k, spec.Item[k]])) : spec.Key;
            const current = store.get(spec.TableName, key);
            const ok = op === 'Put'
              ? evaluateCondition(current ?? {}, spec.ConditionExpression, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues)
              : !!current && evaluateCondition(current, spec.ConditionExpression, spec.ExpressionAttributeNames, spec.ExpressionAttributeValues);
            return { op, spec, key, keyNames, current, ok };
          });
          // DynamoDB reports one reason per item, in request order.
          if (staged.some(s => !s.ok)) throw Object.assign(conditionalFailure('TransactionCanceledException'), { CancellationReasons: staged.map(s => ({ Code: s.ok ? 'None' : 'ConditionalCheckFailed' })) });
          for (const s of staged) {
            if (s.op === 'Put') store.put(s.spec.TableName, s.spec.Item, s.keyNames);
            else applyUpdate(s.current, s.spec.UpdateExpression, s.spec.ExpressionAttributeNames, s.spec.ExpressionAttributeValues);
          }
          return {};
        }
        throw new Error(`Unexpected command ${kind}`);
      } };
    });
    mock.method(audit, 'writeAuditLog', async () => {});
    mock.method(aws, 'getRegionalS3Client', () => ({ send: async () => ({}) }));
    mock.method(notifications, 'sendNotification', async () => {});
    mock.method(eventBus, 'publishEvent', async () => {});
    const realFetch = globalThis.fetch;
    mock.method(globalThis, 'fetch', (url, options) => {
      assert.ok(String(url).startsWith('http://127.0.0.1:'), 'Provider fetch forbidden'); return realFetch(url, options);
    });
    const router = require('./dist/doctor-service/src/modules/clinical/clinical.routes.js').default;
    const app = express(); app.use(express.json()); app.use(router);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const call = (actor, method, path, body) => realFetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-user-region': region, Authorization: `Bearer ${region}:${actor}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const rx1 = () => store.get(RX, { prescriptionId: 'rx-1' });
    try {
      // ── Reads: a patient only sees their own prescriptions; a clinician needs ownership or a care relationship ──
      seed();
      assert.equal((await call('pat-2', 'GET', '/prescriptions?patientId=pat-1')).status, 403, 'D1: patient must not read another patient');
      assert.equal((await call('pat-1', 'GET', '/prescriptions?doctorId=doc-1')).status, 403, 'patient must not list by doctor');
      assert.equal((await call('doc-2', 'GET', '/prescriptions?patientId=pat-1')).status, 403, 'unrelated clinician denied');
      assert.equal((await call('doc-2', 'GET', '/prescriptions?doctorId=doc-1')).status, 403, 'clinician cannot list another clinician');
      const own = await call('pat-1', 'GET', '/prescriptions?patientId=pat-1');
      assert.equal(own.status, 200);
      assert.deepEqual((await own.json()).prescriptions.map(rx => rx.prescriptionId), ['rx-1']);
      assert.equal((await call('doc-3', 'GET', '/prescriptions?patientId=pat-1')).status, 200, 'treating clinician allowed');
      assert.equal((await call('doc-1', 'GET', '/prescriptions?doctorId=doc-1')).status, 200, 'prescriber lists own');
      assert.equal((await call('doc-1', 'GET', '/prescription?patientId=pat-1')).status, 403, 'prescribing alone is not a standing care relationship');

      // ── Refill: owner patient only (or prescriber); one decrement, one bill, payment reset ──
      seed();
      assert.equal((await call('pat-2', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 403);
      assert.equal((await call('doc-2', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 403);
      assert.equal(rx1().refillsRemaining, 2); assert.equal(store.bills().length, 0);
      const refill = await call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' });
      assert.equal(refill.status, 200);
      assert.deepEqual(await refill.json(), { message: 'Refill authorized', status: 'PENDING' }, 'frontend contract refillAcknowledged');
      assert.equal(rx1().refillsRemaining, 1);
      assert.equal(rx1().paymentStatus, 'UNPAID', 'D3: refill must require a new payment');
      assert.equal(store.bills().length, 1);
      assert.equal(store.bills()[0].patientId, 'pat-1'); assert.equal(store.bills()[0].type, 'PHARMACY');
      const replay = await call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' });
      assert.equal(replay.status, 409, 'replayed refill must not bill again');
      assert.equal(rx1().refillsRemaining, 1); assert.equal(store.bills().length, 1);

      seed();
      const racing = await Promise.all([1, 2, 3].map(() => call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })));
      assert.deepEqual(racing.map(r => r.status).sort(), [200, 409, 409], 'D3: concurrent refills are atomic');
      assert.equal(rx1().refillsRemaining, 1); assert.equal(store.bills().length, 1);

      seed({ refillsRemaining: 0 });
      assert.equal((await call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 400);
      assert.equal(store.bills().length, 0);
      seed({ status: 'READY_FOR_PICKUP' });
      assert.equal((await call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 409, 'no refill before current fill is dispensed');
      seed();
      assert.equal((await call('doc-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 200, 'prescriber may refill');
      assert.equal((await call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'missing' })).status, 404);

      // ── Pickup code: owner only, paid only, never re-opens a dispensed fill ──
      seed({ status: 'READY_FOR_PICKUP', paymentStatus: 'PAID' });
      assert.equal((await call('pat-2', 'POST', '/pharmacy/generate-qr', { prescriptionId: 'rx-1' })).status, 403);
      assert.equal((await call('doc-2', 'POST', '/pharmacy/generate-qr', { prescriptionId: 'rx-1' })).status, 403);
      const qr = await call('pat-1', 'POST', '/pharmacy/generate-qr', { prescriptionId: 'rx-1' });
      assert.equal(qr.status, 200); assert.deepEqual(await qr.json(), { qrPayload: 'PICKUP-rx-1' });
      seed({ status: 'PENDING', paymentStatus: 'UNPAID' });
      assert.equal((await call('pat-1', 'POST', '/pharmacy/generate-qr', { prescriptionId: 'rx-1' })).status, 402);
      seed({ status: 'DISPENSED', paymentStatus: 'PAID' });
      assert.equal((await call('pat-1', 'POST', '/pharmacy/generate-qr', { prescriptionId: 'rx-1' })).status, 409, 'D2: dispensed fill cannot be reopened');
      assert.equal(rx1().status, 'DISPENSED');

      // ── Dispense: exactly once ──
      seed({ status: 'READY_FOR_PICKUP', paymentStatus: 'PAID' });
      const dispenses = await Promise.all([1, 2].map(() => call('doc-2', 'POST', '/pharmacy/fulfill', { token: 'PICKUP-rx-1' })));
      // As with cancel vs dispense below, the loser gets 409 from the write condition or 400 if it read after the winner.
      const dispenseStatuses = dispenses.map(r => r.status);
      assert.equal(dispenseStatuses.filter(status => status === 200).length, 1, `D5: concurrent dispense is atomic: ${dispenseStatuses}`);
      assert.ok(dispenseStatuses.every(status => [200, 400, 409].includes(status)), `D5: unexpected statuses ${dispenseStatuses}`);
      assert.equal(rx1().status, 'DISPENSED');
      assert.equal((await call('pat-1', 'POST', '/pharmacy/fulfill', { token: 'PICKUP-rx-2' })).status, 403, 'patients cannot dispense');

      // ── Generic status update: prescriber only, no payment/cancellation bypass ──
      seed({ status: 'ISSUED', paymentStatus: 'UNPAID' });
      assert.equal((await call('doc-2', 'PUT', '/prescription', { prescriptionId: 'rx-1', status: 'ISSUED' })).status, 403);
      assert.equal((await call('pat-1', 'PUT', '/prescription', { prescriptionId: 'rx-1', status: 'ISSUED' })).status, 403);
      for (const status of ['READY_FOR_PICKUP', 'DISPENSED', 'CANCELLED', 'PAID', 'anything'])
        assert.equal((await call('doc-1', 'PUT', '/prescription', { prescriptionId: 'rx-1', status })).status, 400, `D4: ${status}`);
      assert.equal(rx1().status, 'ISSUED');
      assert.equal((await call('doc-1', 'PUT', '/prescription', { prescriptionId: 'rx-1', status: 'ISSUED' })).status, 200);
      assert.equal(rx1().status, 'ISSUED'); assert.equal(rx1().paymentStatus, 'UNPAID');
      seed({ status: 'PENDING', paymentStatus: 'PAID' });
      assert.equal((await call('doc-1', 'PUT', '/prescription', { prescriptionId: 'rx-1', status: 'ISSUED' })).status, 409,
        'a refill awaiting its own bill cannot be re-issued past payment');
      assert.equal(rx1().status, 'PENDING');
      seed({ status: 'DISPENSED' });
      assert.equal((await call('doc-1', 'PUT', '/prescription', { prescriptionId: 'rx-1', status: 'ISSUED' })).status, 409);
      assert.equal(rx1().status, 'DISPENSED');

      // ── A clinician whose verification lapsed loses mutation rights on their own prescriptions ──
      seed();
      store.put(process.env.DYNAMO_TABLE, { doctorId: 'doc-1', verificationStatus: 'REVOKED' }, ['doctorId']);
      assert.equal((await call('doc-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 403);
      assert.equal(rx1().refillsRemaining, 2);
      assert.equal((await call('doc-1', 'GET', '/prescriptions?doctorId=doc-1')).status, 403, 'revoked clinician cannot list');
      assert.equal((await call('doc-1', 'PUT', '/prescription', { prescriptionId: 'rx-1', status: 'ISSUED' })).status, 403);
      seed({ status: 'READY_FOR_PICKUP', paymentStatus: 'PAID' });
      store.put(process.env.DYNAMO_TABLE, { doctorId: 'doc-1', verificationStatus: 'REVOKED' }, ['doctorId']);
      assert.equal((await call('doc-1', 'POST', '/pharmacy/generate-qr', { prescriptionId: 'rx-1' })).status, 403);
      assert.equal((await call('doc-1', 'POST', '/pharmacy/fulfill', { token: 'PICKUP-rx-1' })).status, 403, 'unapproved clinician cannot dispense');
      assert.equal(rx1().status, 'READY_FOR_PICKUP');

      // ── Reads: ambiguous listings and incomplete verification are refused ──
      seed();
      assert.equal((await call('doc-1', 'GET', '/prescriptions?patientId=pat-1&doctorId=doc-1')).status, 400, 'both ids are ambiguous');
      store.put(process.env.DYNAMO_TABLE, { doctorId: 'doc-1', verificationStatus: 'APPROVED', isIdentityVerified: false }, ['doctorId']);
      assert.equal((await call('doc-1', 'GET', '/prescriptions?doctorId=doc-1')).status, 403, 'APPROVED without identity verification');
      store.put(process.env.DYNAMO_TABLE, { doctorId: 'doc-3', verificationStatus: 'REVOKED', isIdentityVerified: true }, ['doctorId']);
      assert.equal((await call('doc-3', 'GET', '/prescriptions?patientId=pat-1')).status, 403, 'revoked treating clinician');

      // ── A legacy refill still carrying its previous fill's PAID flag must pay its refill bill first ──
      seed({ status: 'PENDING', paymentStatus: 'PAID' });
      assert.equal((await call('pat-1', 'POST', '/pharmacy/generate-qr', { prescriptionId: 'rx-1' })).status, 409);
      assert.equal(rx1().status, 'PENDING');

      // ── A transient transaction conflict is a retryable failure, never "already processed" ──
      seed();
      store.transientFailures = 1;
      assert.equal((await call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 500);
      assert.equal(rx1().refillsRemaining, 2); assert.equal(store.bills().length, 0);
      assert.equal((await call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 200, 'retry succeeds');

      // ── Cancel: approved prescriber only; closes unpaid bills, flags paid ones, never overrides a dispense ──
      const bill = (billId, changes = {}) => store.put(BILLS, { billId, referenceId: 'rx-1', patientId: 'pat-1', status: 'PENDING', type: 'PHARMACY', ...changes }, ['billId']);
      const billRow = billId => store.get(BILLS, { billId });
      seed({ status: 'ISSUED', paymentStatus: 'UNPAID' });
      bill('bill-1'); bill('bill-other', { referenceId: 'rx-2', patientId: 'pat-2' });
      assert.equal((await call('doc-2', 'PUT', '/prescriptions/rx-1/cancel')).status, 403, 'another clinician cannot cancel');
      store.put(process.env.DYNAMO_TABLE, { doctorId: 'doc-1', verificationStatus: 'REVOKED' }, ['doctorId']);
      assert.equal((await call('doc-1', 'PUT', '/prescriptions/rx-1/cancel')).status, 403, 'revoked prescriber cannot cancel');
      store.put(process.env.DYNAMO_TABLE, { doctorId: 'doc-1', verificationStatus: 'APPROVED', isIdentityVerified: true }, ['doctorId']);
      assert.equal(rx1().status, 'ISSUED');
      assert.equal((await call('doc-1', 'PUT', '/prescriptions/rx-1/cancel')).status, 200);
      assert.equal(rx1().status, 'CANCELLED');
      assert.equal(billRow('bill-1').status, 'CANCELLED', 'an unpaid bill cannot be paid after cancellation');
      assert.equal(billRow('bill-other').status, 'PENDING', 'other prescriptions are untouched');
      assert.equal((await call('doc-1', 'PUT', '/prescriptions/rx-1/cancel')).status, 400, 'already cancelled');
      seed({ status: 'READY_FOR_PICKUP', paymentStatus: 'PAID' });
      bill('bill-1', { status: 'PAID' });
      assert.equal((await call('doc-1', 'PUT', '/prescriptions/rx-1/cancel')).status, 200);
      assert.equal(billRow('bill-1').status, 'PAID');
      assert.equal(billRow('bill-1').reviewReason, 'PRESCRIPTION_CANCELLED_AFTER_PAYMENT', 'captured money is flagged for refund review');
      seed({ status: 'READY_FOR_PICKUP', paymentStatus: 'PAID' });
      const [cancelResult, dispenseResult] = await Promise.all([
        call('doc-1', 'PUT', '/prescriptions/rx-1/cancel'), call('doc-2', 'POST', '/pharmacy/fulfill', { token: 'PICKUP-rx-1' })]);
      // The loser is rejected by the write condition (409) or, if it read after the winner finished, by the status check (400).
      const statuses = [cancelResult.status, dispenseResult.status];
      assert.equal(statuses.filter(status => status === 200).length, 1, `cancel and dispense cannot both win: ${statuses}`);
      assert.ok(statuses.every(status => [200, 400, 409].includes(status)), `unexpected statuses ${statuses}`);
      assert.equal(rx1().status, dispenseResult.status === 200 ? 'DISPENSED' : 'CANCELLED');

      // ── Legacy refill requests: the retired Lambda set REFILL_REQUESTED with no bill, no decrement and no status check ──
      // A fill that was dispensed (dispensedAt from this service, fulfilledAt from the Lambda) is billed as a real refill.
      for (const evidence of [{ dispensedAt: '2026-01-01T00:00:00Z' }, { fulfilledAt: '2026-01-01T00:00:00Z' }]) {
        seed({ status: 'REFILL_REQUESTED', paymentStatus: 'PAID', ...evidence });
        assert.equal((await call('doc-1', 'PUT', '/prescription', { prescriptionId: 'rx-1', status: 'ISSUED' })).status, 409,
          'a legacy refill request cannot be issued past billing');
        assert.equal(rx1().status, 'REFILL_REQUESTED');
        assert.notEqual((await call('pat-1', 'POST', '/pharmacy/generate-qr', { prescriptionId: 'rx-1' })).status, 200);
        const approved = await call('doc-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' });
        assert.equal(approved.status, 200, 'R4-1: the prescriber approves a dispensed legacy refill');
        assert.deepEqual(await approved.json(), { message: 'Refill authorized', status: 'PENDING' });
        assert.equal(rx1().status, 'PENDING'); assert.equal(rx1().paymentStatus, 'UNPAID'); assert.equal(rx1().refillsRemaining, 1);
        assert.deepEqual(store.bills().map(b => [b.billId, b.status]), [['refill-rx-1-2', 'PENDING']]);
      }
      // R4-2: without dispense evidence the previous fill was never collected. Restore it; never bill or decrement again.
      for (const paymentStatus of ['PAID', 'UNPAID']) {
        seed({ status: 'REFILL_REQUESTED', paymentStatus, refillsRemaining: 0 });
        if (paymentStatus === 'UNPAID') bill('first-fill');
        const restored = await call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' });
        assert.equal(restored.status, 200, `R4-2: uncollected ${paymentStatus} fill is restored`);
        assert.deepEqual(await restored.json(), { message: 'Previous fill restored', status: 'ISSUED' });
        assert.equal(rx1().status, 'ISSUED'); assert.equal(rx1().paymentStatus, paymentStatus); assert.equal(rx1().refillsRemaining, 0);
        assert.deepEqual(store.bills().map(b => [b.billId, b.status]), paymentStatus === 'UNPAID' ? [['first-fill', 'PENDING']] : [],
          'R4-2: no second charge for a fill that was never collected');
        assert.equal((await call('pat-1', 'POST', '/pharmacy/generate-qr', { prescriptionId: 'rx-1' })).status,
          paymentStatus === 'PAID' ? 200 : 402, 'a paid restored fill is collectable; an unpaid one still needs its own bill');
      }
      seed({ status: 'REFILL_REQUESTED', paymentStatus: 'PAID' });
      assert.equal((await call('pat-2', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 403);
      assert.equal((await call('doc-2', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 403);
      assert.equal(rx1().status, 'REFILL_REQUESTED');
      // A legacy request on a cancelled prescription is neither billed nor restored.
      for (const evidence of [{}, { dispensedAt: '2026-01-01T00:00:00Z' }]) {
        seed({ status: 'REFILL_REQUESTED', paymentStatus: 'PAID', cancelledAt: '2026-01-02T00:00:00Z', ...evidence });
        assert.equal((await call('doc-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 409);
        assert.equal(rx1().status, 'REFILL_REQUESTED'); assert.equal(store.bills().length, 0);
      }
      // A dispense recorded between the read and the restore makes the restore fail instead of releasing a free fill.
      seed({ status: 'REFILL_REQUESTED', paymentStatus: 'PAID' });
      store.beforeUpdate = () => { rx1().dispensedAt = '2026-01-03T00:00:00Z'; };
      assert.equal((await call('pat-1', 'POST', '/pharmacy/request-refill', { prescriptionId: 'rx-1' })).status, 409);

      assert.equal(rx1().status, 'REFILL_REQUESTED');

      // ── Cancel is pinned to the state it read: a refill committed meanwhile makes it fail, not strand the new bill ──
      const refillMeanwhile = status => () => {
        Object.assign(rx1(), { status, paymentStatus: 'UNPAID', refillsRemaining: 1 });
        bill('refill-rx-1-2');
      };
      for (const status of ['PENDING', 'READY_FOR_PICKUP']) {
        seed({ status: 'READY_FOR_PICKUP', paymentStatus: 'PAID' });
        store.beforeTransact = refillMeanwhile(status);
        assert.equal((await call('doc-1', 'PUT', '/prescriptions/rx-1/cancel')).status, 409, `refill committed meanwhile (${status})`);
        assert.equal(rx1().status, status);
        assert.equal(billRow('refill-rx-1-2').status, 'PENDING');
      }
      // A refill bill the patient index has not replicated yet is still closed.
      seed({ status: 'PENDING', paymentStatus: 'UNPAID', refillsRemaining: 1 });
      bill('refill-rx-1-2', { hiddenFromIndex: true });
      assert.equal((await call('doc-1', 'PUT', '/prescriptions/rx-1/cancel')).status, 200);
      assert.equal(billRow('refill-rx-1-2').status, 'CANCELLED', 'deterministic refill bill found despite index lag');

      // ── The generic patient clinical-write blockade stays intact everywhere else ──
      seed();
      for (const [method, path, body] of [
        ['POST', '/prescription', { doctorId: 'pat-1', patientId: 'pat-1', medication: 'test-med' }],
        ['PUT', '/prescriptions/rx-1/cancel'],
        ['POST', '/lab/orders', { patientId: 'pat-1' }],
        ['POST', '/referrals', { patientId: 'pat-1' }],
      ]) assert.equal((await call('pat-1', method, path, body)).status, 403, `${method} ${path}`);
      assert.equal(rx1().status, 'DISPENSED'); assert.equal(store.bills().length, 0);
    } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
  });
}
