// S2 (memory/safe-followups-acceptance-20260925.md): booking-service refuses to start without its cancellation settings,
// instead of failing every check-in (claim TTL) or silently queueing every refund for manual review (page bound).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const preImportTables = { TABLE_PATIENTS: process.env.TABLE_PATIENTS, TABLE_TRANSACTIONS: process.env.TABLE_TRANSACTIONS };
delete process.env.TABLE_PATIENTS;
delete process.env.TABLE_TRANSACTIONS;
const { validateStartupSettings } = require('./dist/booking-service/src/index.js');
Object.assign(process.env, preImportTables);

const withSetting = (name, value, run) => {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  try { run(); } finally { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }
};

test('startup settings validate with the documented example values', () => {
  assert.equal(typeof validateStartupSettings, 'function');
  validateStartupSettings();
});

for (const name of ['CANCELLATION_CLAIM_TTL_SECONDS', 'CANCELLATION_REFUND_MAX_PAGES']) {
  for (const [label, value] of [['missing', undefined], ['not a positive integer', '0'], ['not a number', 'many']]) {
    test(`startup is refused when ${name} is ${label}`, () => {
      assert.equal(typeof validateStartupSettings, 'function');
      withSetting(name, value, () => assert.throws(() => validateStartupSettings(), error => !(error instanceof TypeError)));
    });
  }
}

for (const name of ['TABLE_PATIENTS', 'TABLE_TRANSACTIONS']) {
  for (const [label, value] of [['missing', undefined], ['blank', ' '], ['invalid resource name', 'test/table']]) {
    test(`startup is refused when ${name} is ${label}`, () => {
      withSetting(name, value, () => assert.throws(() => validateStartupSettings(), error =>
        error instanceof Error && error.message.includes(name) && !error.message.includes('test/table')));
    });
  }
}

test('startup accepts configured patient and transaction resource names', () => {
  withSetting('TABLE_PATIENTS', 'test-patients', () =>
    withSetting('TABLE_TRANSACTIONS', 'test-transactions', () => validateStartupSettings()));
});

test('SSM bootstrap validates the same patient table that regional requests consume', async () => {
  const aws = require('./dist/shared/aws-config.js');
  const { initializeBookingSettings } = require('./dist/booking-service/src/index.js');
  const { createBooking } = require('./dist/booking-service/src/controllers/booking.controller.js');
  const previous = { ...process.env };
  try {
    for (const region of ['US', 'EU']) {
      const patientsTable = `test-patients-${region.toLowerCase()}`;
      const reads = [];
      process.env.AWS_REGION = process.env[region === 'US' ? 'PRIVACY_US_REGION' : 'PRIVACY_EU_REGION'];
      process.env.TABLE_PATIENTS = 'test-pre-bootstrap-patients';
      const ssm = mock.method(aws, 'getRegionalSSMClient', () => ({ send: async () => ({
        Parameters: [{ Name: '/mediconnect/prod/db/patient_table', Value: patientsTable }],
      }) }));
      const db = mock.method(aws, 'getRegionalClient', requestedRegion => {
        assert.equal(requestedRegion, region);
        return { send: async command => { reads.push(command.input); return {}; } };
      });
      try {
        await initializeBookingSettings();
        assert.equal(process.env.TABLE_PATIENTS, patientsTable);
        await new Promise((resolve, reject) => {
          const response = { status: () => response, json: resolve };
          createBooking({ headers: {}, user: { sub: 'test-patient', region }, body: {
            doctorId: 'test-doctor', timeSlot: new Date(Date.now() + 86400000).toISOString(), paymentToken: 'test-payment-token',
          } }, response, reject);
        });
        assert.equal(reads.find(input => input.Key?.patientId === 'test-patient')?.TableName, patientsTable);
      } finally {
        ssm.mock.restore(); db.mock.restore();
      }
    }
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in previous)) delete process.env[name];
    Object.assign(process.env, previous);
  }
});
