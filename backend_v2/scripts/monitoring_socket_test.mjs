import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.COGNITO_USER_POOL_ID_US = 'us-east-1_test';
process.env.COGNITO_USER_POOL_ID_EU = 'eu-central-1_test';
process.env.TABLE_GRAPH = 'test-graph'; process.env.DYNAMO_TABLE = 'test-patients';
const require = createRequire(new URL('../patient-service/package.json', import.meta.url));
const { Server } = require('socket.io');
const { io: client } = require('socket.io-client');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const aws = require('./dist/shared/aws-config.js');
const audit = require('./dist/shared/audit.js');
const { attachMonitoringAuthorization, emitAuthorizedMonitoring, validateTelemetryJurisdiction } = require('./dist/patient-service/src/modules/iot/monitoring-access.js');

test('real monitoring sockets reject forged identity, separate USA/EU rooms and recheck authorization before delivery', { timeout: 15000 }, async () => {
  let erasureState, auditFails = false, clinicianApproved = true;
  mock.method(CognitoJwtVerifier, 'create', configuration => ({ verify: async token => {
    const region = configuration.userPoolId === process.env.COGNITO_USER_POOL_ID_EU ? 'EU' : 'US';
    if (!token.startsWith(`test-${region}-`)) throw new Error('test invalid signature');
    const role = token.split('-').at(-1);
    if (!['owner', 'doctor', 'unlinked', 'expired', 'short'].includes(role)) throw new Error('test invalid token');
    return { sub: ['doctor', 'unlinked'].includes(role) ? `test-${role}` : 'test-patient',
      'cognito:groups': ['doctor', 'unlinked'].includes(role) ? ['doctor'] : ['patient'],
      exp: Math.floor(Date.now() / 1000) + (role === 'expired' ? -1 : role === 'short' ? 2 : 60) };
  } }));
  mock.method(aws, 'getRegionalClient', region => {
    assert.ok(['US', 'EU'].includes(region));
    return { send: async command => {
      if (command.input.TableName === process.env.DYNAMO_TABLE_DOCTORS) return { Item: { verificationStatus: clinicianApproved ? 'APPROVED' : 'REVOKED' } };
      if (command.input.TableName === process.env.TABLE_GRAPH) return { Item: command.input.Key.SK === 'DOCTOR#test-doctor' ? { relationship: 'isTreatedBy' } : undefined };
      return { Item: { isIdentityVerified: true, erasure: { state: erasureState } } };
    } };
  });
  mock.method(audit, 'writeAuditLog', async (_actor, _patient, _action, _details, metadata) => {
    assert.equal(metadata.requirePersistence, true);
    if (auditFails) throw new Error('test unavailable audit');
  });
  const http = createServer(); const server = new Server(http, { serveClient: false });
  attachMonitoringAuthorization(server);
  http.listen(0, '127.0.0.1'); await once(http, 'listening');
  const sockets = [];
  const open = async (auth, rejected = false) => {
    const socket = client(`http://127.0.0.1:${http.address().port}`, { auth, autoConnect: false, reconnection: false, transports: ['websocket'] });
    sockets.push(socket);
    const connected = once(socket, rejected ? 'connect_error' : 'connect', { signal: AbortSignal.timeout(3000) });
    socket.connect(); await connected;
    if (rejected) assert.equal(socket.connected, false);
    return socket;
  };
  const join = (socket, patientId = 'test-patient') => socket.timeout(2000).emitWithAck('join_monitoring', patientId);
  try {
    await open({}, true);
    await open({ token: 'test-EU-owner', region: 'not-eu' }, true);
    await open({ token: 'test-US-owner', region: 'EU' }, true);
    await open({ token: 'test-EU-expired', region: 'EU' }, true);
    const eu = await open({ token: 'test-EU-owner', region: 'EU' });
    const us = await open({ token: 'test-US-owner', region: 'US' });
    const doctor = await open({ token: 'test-EU-doctor', region: 'EU' });
    const unlinked = await open({ token: 'test-EU-unlinked', region: 'EU' });
    assert.equal((await join(unlinked)).ok, false);
    assert.equal((await join(eu, 'test-other')).ok, false);
    for (const socket of [eu, us, doctor]) assert.equal((await join(socket)).ok, true);
    assert.throws(() => validateTelemetryJurisdiction({ region: 'US' }, 'EU'), /TELEMETRY_REGION_MISMATCH/);
    assert.equal(validateTelemetryJurisdiction({}, 'EU'), 'EU');
    const received = { eu: 0, us: 0, doctor: 0, unlinked: 0 };
    for (const [name, socket] of Object.entries({ eu, us, doctor, unlinked })) socket.on('vital_update', () => { received[name]++; });
    const euData = once(eu, 'vital_update'), doctorData = once(doctor, 'vital_update');
    await emitAuthorizedMonitoring(server, 'test-patient', 'EU', 'vital_update', { heartRate: 70, accessToken: 'test-key', metadata: { privateNote: 'test-private' } });
    const deliveries = await Promise.all([euData, doctorData]);
    for (const [delivery] of deliveries) assert.deepEqual(delivery, { patientId: 'test-patient', heartRate: 70 });
    await assert.rejects(emitAuthorizedMonitoring(server, 'test-patient', 'EU', 'vital_update', { patientId: 'test-other', heartRate: 70 }), /VITAL_SUBJECT_MISMATCH/);
    assert.deepEqual(received, { eu: 1, us: 0, doctor: 1, unlinked: 0 });
    clinicianApproved = false;
    const ownerDelivery = once(eu, 'vital_update');
    await emitAuthorizedMonitoring(server, 'test-patient', 'EU', 'vital_update', { heartRate: 71 });
    await ownerDelivery;
    assert.deepEqual(received, { eu: 2, us: 0, doctor: 1, unlinked: 0 });
    clinicianApproved = true;
    erasureState = 'IN_PROGRESS';
    await emitAuthorizedMonitoring(server, 'test-patient', 'EU', 'vital_update', { heartRate: 99 });
    assert.equal((await server.in('monitoring:EU:test-patient').fetchSockets()).length, 0);
    assert.deepEqual(received, { eu: 2, us: 0, doctor: 1, unlinked: 0 });
    erasureState = undefined; auditFails = true;
    assert.equal((await join(eu)).ok, false);
    auditFails = false;
    const short = await open({ token: 'test-EU-short', region: 'EU' });
    await once(short, 'disconnect', { signal: AbortSignal.timeout(4000) }); assert.equal(short.connected, false);
  } finally {
    for (const socket of sockets) socket.disconnect();
    await new Promise(resolve => server.close(resolve)); mock.restoreAll();
  }
});
