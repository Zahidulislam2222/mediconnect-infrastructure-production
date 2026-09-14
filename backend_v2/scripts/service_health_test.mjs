import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { after, test, mock } from "node:test";

const backendRoot = path.resolve(import.meta.dirname, "..");
const service = process.argv[2];
const allowedServices = new Set([
  "doctor-service",
  "patient-service",
  "booking-service",
  "communication-service",
  "staff-service",
]);

if (!allowedServices.has(service)) {
  throw new Error(`Unsupported service health test target: ${service ?? "missing"}`);
}

for (const line of fs.readFileSync(path.join(backendRoot, ".env.example"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/); 
  if (!match) continue;
  const [, name, exampleValue] = match;
  process.env[name] ??= exampleValue || `test-${name.toLowerCase()}`;
}
process.env.AWS_EC2_METADATA_DISABLED = "true";
process.env.NODE_ENV = "test";
process.env.REDIS_URL = "";

const entryPath = path.join(
  backendRoot,
  service,
  "dist",
  service,
  "src",
  "index.js",
);
const require = createRequire(import.meta.url);
const { app } = require(entryPath);
assert.equal(typeof app?.listen, "function", `${service} must export its Express app`);
if (service === 'patient-service') {
  // Startup normally attaches this router after vault loading. Use safe example configuration.
  app.use('/', require(path.join(path.dirname(entryPath), 'routes/patient.routes.js')).default);
}

let server;
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test(`${service} serves its real HTTP liveness response`, async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { status: "UP", type: "liveness" });
});

test(`${service} preflight permits only configured origins and methods`, async () => {
  const url = `http://127.0.0.1:${server.address().port}/test-preflight`;
  const permittedOrigin = process.env.ALLOWED_ORIGINS.split(',')[0];
  const request = origin => fetch(url, { method: 'OPTIONS', headers: {
    Origin: origin, 'Access-Control-Request-Method': 'PATCH',
    'Access-Control-Request-Headers': 'Authorization,x-user-region',
  } });
  const permitted = await request(permittedOrigin);
  assert.equal(permitted.status, 204);
  assert.equal(permitted.headers.get('access-control-allow-origin'), permittedOrigin);
  assert.equal(permitted.headers.get('access-control-allow-credentials'), process.env.CORS_CREDENTIALS);
  assert.ok(permitted.headers.get('access-control-allow-methods').split(',').includes('PATCH'));
  for (const origin of [permittedOrigin + '.evil.example', 'null', 'http://localhost', 'capacitor://localhost']) {
    const denied = await request(origin);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  }
  const csp = permitted.headers.get('content-security-policy');
  assert.ok(csp); assert.equal(csp.includes('*'), false);
});

if (service === 'patient-service') {
  test('public knowledge stays public and respects explicit regional selection', async () => {
    const aws = require(path.join(path.dirname(entryPath), '../../shared/aws-config.js'));
    const selected = [];
    mock.method(aws, 'getRegionalClient', region => {
      selected.push(region); return { send: async () => ({ Items: [] }) };
    });
    try {
      for (const region of ['EU', 'US']) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/public/knowledge`, { headers: { 'x-user-region': region } });
        assert.equal(response.status, 200); assert.deepEqual(await response.json(), []);
      }
      assert.deepEqual(selected, ['EU', 'US']);
      const invalid = await fetch(`http://127.0.0.1:${server.address().port}/public/knowledge`, { headers: { 'x-user-region': 'EU, US' } });
      assert.equal(invalid.status, 400); assert.equal(selected.length, 2);
    } finally { mock.restoreAll(); }
  });
}
