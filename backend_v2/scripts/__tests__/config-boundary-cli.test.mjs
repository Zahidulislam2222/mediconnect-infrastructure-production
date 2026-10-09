import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('../verify_config_boundary.mjs', import.meta.url), 'utf8');

function fixture(t, frontend = false) {
  const root = mkdtempSync(path.join(tmpdir(), 'mediconnect-config-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, value);
  };
  write('backend/backend_v2/scripts/verify_config_boundary.mjs', source);
  write('backend/backend_v2/.env.example', 'TEST_API_SETTING=test-value\n');
  write('backend/backend_v2/shared/example.ts', 'setting("TEST_API_SETTING");');
  write('backend/backend_v2/shared/settings.ts', 'export const SDK_ENVIRONMENT_NAMES = [] as const;');
  mkdirSync(path.join(root, 'backend/legacy_lambdas'), { recursive: true });
  for (const service of ['patient', 'doctor', 'booking', 'communication', 'staff']) {
    write(`backend/backend_v2/${service}-service/src/index.ts`, 'getApiBrowserPolicy();');
  }
  const frontendRoot = path.join(root, 'explicit client with spaces');
  if (frontend) {
    write('explicit client with spaces/src/config/env.ts', 'const variable = "VITE_PUBLIC_API";');
    write('explicit client with spaces/.env.example', 'VITE_PUBLIC_API=https://api.example.test\n');
  }
  return {
    write, frontendRoot,
    run: (...args) => spawnSync(process.execPath,
      [path.join(root, 'backend/backend_v2/scripts/verify_config_boundary.mjs'), ...args],
      { encoding: 'utf8' }),
  };
}

test('standalone backend checkout audits its own variables without another repository', t => {
  const result = fixture(t).run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 backend/);
  assert.match(result.stdout, /frontend audit not requested/);
});

test('explicit frontend root is audited, including paths containing spaces', t => {
  const f = fixture(t, true);
  const result = f.run('--frontend-root', f.frontendRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 backend and 1 frontend/);
});

test('missing backend documentation still fails a standalone audit', t => {
  const f = fixture(t);
  f.write('backend/backend_v2/.env.example', '');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /backend .env.example is missing TEST_API_SETTING/);
});

for (const name of ['AWS_ROLE_ARN', 'AWS_WEB_IDENTITY_TOKEN_FILE']) {
  test(`SDK inventory requires documentation for ${name}`, t => {
    const f = fixture(t);
    f.write('backend/backend_v2/shared/settings.ts', `export const SDK_ENVIRONMENT_NAMES = ["${name}"] as const;`);
    const missing = f.run();
    assert.notEqual(missing.status, 0);
    assert.ok(missing.stderr.includes(`backend .env.example is missing ${name}`));
    f.write('backend/backend_v2/.env.example', `TEST_API_SETTING=test-value\n${name}=\n`);
    const documented = f.run();
    assert.equal(documented.status, 0, documented.stderr);
    assert.match(documented.stdout, /2 backend/);
  });
}

test('explicit frontend missing documentation cannot silently skip its audit', t => {
  const f = fixture(t, true);
  f.write('explicit client with spaces/.env.example', '');
  const result = f.run('--frontend-root', f.frontendRoot);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /frontend .env.example is missing VITE_PUBLIC_API/);
});

test('explicit frontend boundary bypass remains a blocking failure', t => {
  const f = fixture(t, true);
  f.write('explicit client with spaces/src/bypass.ts', 'const value = import.meta.env.VITE_PUBLIC_API;');
  const result = f.run('--frontend-root', f.frontendRoot);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /bypasses src.config.env.ts/);
});

test('an absent explicitly requested frontend fails instead of falling back', t => {
  const f = fixture(t);
  const result = f.run('--frontend-root', f.frontendRoot);
  assert.notEqual(result.status, 0);
});

test('unknown, incomplete and empty scope arguments fail', t => {
  const f = fixture(t);
  for (const args of [['--unknown'], ['--frontend-root'], ['--frontend-root', ''], ['--frontend-root', f.frontendRoot, 'extra']]) {
    assert.notEqual(f.run(...args).status, 0, JSON.stringify(args));
  }
});
