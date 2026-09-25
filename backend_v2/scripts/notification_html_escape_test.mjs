// F1k (memory/followups-2-acceptance-20260926.md): the HTML part of every notice escapes the subject and message, so
// patient- or doctor-written text (a custom reminder, a reason) cannot add markup or links to the email. Newlines
// become <br>. The plain-text part is sent exactly as given. Uses the booking-service build; no provider requests.
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

test('subject and message are escaped in the HTML part and unchanged in the text part', async () => {
  try {
    for (const name of ['safeLog', 'safeError']) mock.method(logger, name, () => {});
    const sends = [];
    mock.method(aws, 'getRegionalSESClient', () => ({ send: async command => { sends.push(command.input); } }));
    const subject = 'Test <b>subject</b> & "more"';
    const message = `Line one <a href="https://example.test/x">click</a>\nLine two 'quoted' <script>alert(1)</script>`;
    await sendNotification({ region: 'us-east-1', recipientEmail: 'patient@example.test', subject, message, type: 'GENERAL' });
    assert.equal(sends.length, 1);
    const { Subject, Body } = sends[0].Message;
    assert.equal(Subject.Data, subject);
    assert.equal(Body.Text.Data, message);
    const html = Body.Html.Data;
    for (const raw of ['<b>', '<a ', '<script>', 'href="', '& "']) assert.ok(!html.includes(raw), `raw ${raw} in\n${html}`);
    assert.ok(html.includes('Test &lt;b&gt;subject&lt;/b&gt; &amp; &quot;more&quot;'), html);
    assert.ok(html.includes('Line one &lt;a href=&quot;https://example.test/x&quot;&gt;click&lt;/a&gt;<br>Line two &#39;quoted&#39; &lt;script&gt;alert(1)&lt;/script&gt;'), html);
  } finally { mock.restoreAll(); }
});
