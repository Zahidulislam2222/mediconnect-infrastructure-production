// Local HTTP contract tests with provider/storage boundaries stubbed; never calls a paid API.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
for (const line of (await readFile(new URL('../.env.example', import.meta.url), 'utf8')).split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2] || `test-${match[1].toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = '';
const require = createRequire(new URL('../communication-service/package.json', import.meta.url));
const { parseClinicalAssessment, AIUnavailableError } = require('./dist/communication-service/src/utils/clinical-assessment.js');
const { AICircuitBreaker } = require('./dist/communication-service/src/utils/ai-circuit-breaker.js');
const { parseVertexText } = require('./dist/communication-service/src/utils/vertex-response.js');

test('Vertex responses require non-empty typed text instead of accepting blocked/malformed data', () => {
  for (const value of [null, {}, { candidates: [] }, { candidates: [{ content: { parts: [{ text: 42 }] } }] }, { candidates: [{ content: { parts: [{ text: ' ' }] } }] }]) {
    assert.throws(() => parseVertexText(value), AIUnavailableError);
  }
  assert.equal(parseVertexText({ candidates: [{ content: { parts: [{ text: 'Synthetic ' }, { text: 'answer' }] } }] }), 'Synthetic answer');
});

test('malformed assessments fail closed rather than inventing Medium', () => {
  for (const text of ['invalid', '{}', '{"risk":"Medium"}', '{"risk":"Low","reason":""}', '{"risk":"Error","reason":"test"}']) {
    assert.throws(() => parseClinicalAssessment(text), AIUnavailableError);
  }
  assert.equal(parseClinicalAssessment('{"risk":"High","reason":"Synthetic response"}').risk, 'High');
});

for (const mode of ['generateResponse', 'generateWithConfig']) {
  test(`${mode}: all provider failures never manufacture a clinical score`, async () => {
    const service = new AICircuitBreaker();
    const calls = [];
    for (const provider of ['callBedrock', 'callVertexAI', 'callAzureOpenAI']) {
      mock.method(service, provider, async () => { calls.push(provider); throw new Error('test unavailable'); });
    }
    await assert.rejects(service[mode]('Synthetic symptoms', [], 'EU', {
      bedrock: { modelId: 'test-model', maxTokens: 1 },
      vertex: { modelName: 'test-model', maxTokens: 1 },
      azure: { deployment: 'test-model', maxTokens: 1 },
    }), AIUnavailableError);
    assert.deepEqual(calls, ['callBedrock', 'callVertexAI', 'callAzureOpenAI']);
    mock.restoreAll();
  });
}

test('real local HTTP controller returns503 with no report or persistence on unavailable/invalid AI', async () => {
  const express = require('express');
  const { ComprehendMedicalClient } = require('@aws-sdk/client-comprehendmedical');
  const db = require('./dist/communication-service/src/utils/db-adapter.js');
  const { checkSymptoms } = require('./dist/communication-service/src/controllers/symptom.controller.js');
  mock.method(ComprehendMedicalClient.prototype, 'send', async () => ({ Entities: [{ Category: 'MEDICAL_CONDITION', Text: 'Synthetic symptoms' }] }));
  let outcome = 'unavailable';
  mock.method(AICircuitBreaker.prototype, 'generateResponse', async () => {
    if (outcome === 'unavailable') throw new AIUnavailableError();
    return { text: '{"risk":"Medium"}', provider: 'test-provider', model: 'test-model' };
  });
  const storage = mock.method(db, 'getRegionalDB', () => { throw new Error('Storage must not be reached'); });
  const app = express();
  app.use(express.json());
  app.post('/test-symptoms', (req, res) => { req.user = { sub: 'test-patient', region: 'EU' }; return checkSymptoms(req, res); });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (outcome of ['unavailable', 'malformed']) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/test-symptoms`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-region': 'EU' }, body: JSON.stringify({ text: 'Synthetic symptoms' }),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { success: false, status: 'unavailable', code: 'AI_ASSESSMENT_UNAVAILABLE' });
    }
    assert.equal(storage.mock.callCount(), 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    mock.restoreAll();
  }
});
