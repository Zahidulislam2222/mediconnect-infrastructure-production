// F2 (memory/followups-2-acceptance-20260926.md): when a patient notice is skipped or fails, the log says which
// appointment/bill it was for, using allowlisted ID fields only; no recipient, message or clinical detail is logged.
// Uses the booking-service build of shared/notifications; no provider requests.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.SES_SENDER_EMAIL = 'sender@example.test';
const require = createRequire(new URL('../booking-service/package.json', import.meta.url));
const aws = require('./dist/shared/aws-config.js');
const logger = require('./dist/shared/logger.js');
const { sendNotification } = require('./dist/shared/notifications.js');

const SECRET_BITS = ['patient@example.test', 'Test message body', 'Test subject', 'test-medication', 'Dr Test', 'test-patient'];
const notice = recipientEmail => ({
  region: 'us-east-1', recipientEmail, subject: 'Test subject', message: 'Test message body', type: 'PRESCRIPTION_ISSUED',
  metadata: { appointmentId: 'test-apt', billId: 'test-bill', prescriptionId: 'test-rx', medication: 'test-medication', doctorName: 'Dr Test', patientId: 'test-patient' },
});

function capture() {
  const lines = [];
  for (const name of ['safeLog', 'safeError']) mock.method(logger, name, (...args) => { lines.push(JSON.stringify(args)); });
  return lines;
}

for (const [label, recipient, failSend] of [['skipped (no recipient)', undefined, false], ['failed send', 'patient@example.test', true]]) {
  test(`a ${label} notice is logged with its IDs and nothing else`, async () => {
    try {
      const lines = capture();
      const sends = [];
      mock.method(aws, 'getRegionalSESClient', () => ({ send: async command => { sends.push(command); if (failSend) throw new Error('SES unavailable'); } }));
      await sendNotification(notice(recipient));
      assert.equal(sends.length, failSend ? 1 : 0);
      const text = lines.join('\n');
      for (const id of ['test-apt', 'test-bill', 'test-rx']) assert.ok(text.includes(id), `${label}: ${id} logged\n${text}`);
      for (const bit of SECRET_BITS) assert.ok(!text.includes(bit), `${label}: must not log ${bit}\n${text}`);
    } finally { mock.restoreAll(); }
  });
}
