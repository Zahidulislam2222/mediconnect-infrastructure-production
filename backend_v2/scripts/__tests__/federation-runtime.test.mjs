import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFederationSettings } from '../../shared/runtime/federation-settings.mjs';
import { refreshFederationToken } from '../../shared/runtime/federation-token.mjs';

const metadataEndpoint = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=test-audience';
const fakeToken = 'test-header.test-payload.test-signature';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'federation-runtime-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const environment = { K_SERVICE: 'test-service', AWS_WEB_IDENTITY_TOKEN_FILE: path.join(directory, 'token'),
    FEDERATION_IDENTITY_URL: metadataEndpoint, FEDERATION_TOKEN_REFRESH_MS: '100',
    FEDERATION_HTTP_TIMEOUT_MS: '50', FEDERATION_SHUTDOWN_TIMEOUT_MS: '50', FEDERATION_MAX_TOKEN_BYTES: '1024' };
  return { directory, environment, settings: readFederationSettings(environment) };
}

test('non-cloud startup reads no bootstrap values or credentials', () => {
  assert.equal(readFederationSettings({}), null);
});

for (const [key, value] of [
  ['FEDERATION_IDENTITY_URL', 'https://outside.example.test/?audience=test'],
  ['FEDERATION_IDENTITY_URL', 'http://@metadata.google.internal/?audience=test'],
  ['FEDERATION_IDENTITY_URL', 'http://metadata.google.internal/'],
  ['FEDERATION_TOKEN_REFRESH_MS', '0'], ['FEDERATION_HTTP_TIMEOUT_MS', 'Infinity'],
  ['FEDERATION_SHUTDOWN_TIMEOUT_MS', '2147483648'], ['FEDERATION_MAX_TOKEN_BYTES', '1.5'],
  ['AWS_WEB_IDENTITY_TOKEN_FILE', 'relative-token'],
]) {
  test('invalid bootstrap configuration rejected: ' + key + ' ' + value, async t => {
    const { environment } = await fixture(t);
    assert.throws(() => readFederationSettings({ ...environment, [key]: value }));
  });
}

test('complete metadata token is replaced atomically with private permissions', async t => {
  const { settings, directory } = await fixture(t);
  await fs.writeFile(settings.tokenFile, 'previous-test-token');
  await refreshFederationToken(settings, new AbortController().signal, async (url, options) => {
    assert.equal(url, metadataEndpoint); assert.equal(options.redirect, 'error');
    assert.equal(options.headers['Metadata-Flavor'], 'Google');
    return new Response(fakeToken, { headers: { 'Metadata-Flavor': 'Google' } });
  });
  assert.equal(await fs.readFile(settings.tokenFile, 'utf8'), fakeToken);
  assert.deepEqual(await fs.readdir(directory), ['token']);
  if (process.platform !== 'win32') assert.equal((await fs.stat(settings.tokenFile)).mode & 0o777, 0o600);
});

for (const kind of ['status', 'header', 'oversized', 'malformed', 'nonascii', 'stream-failure', 'aborted', 'trailing-lf', 'trailing-cr']) {
  test('failed refresh preserves complete original token: ' + kind, async t => {
    const { settings, directory } = await fixture(t);
    await fs.writeFile(settings.tokenFile, 'previous-test-token');
    const controller = new AbortController();
    if (kind === 'aborted') controller.abort();
    const transport = async () => {
      const headers = kind === 'header' ? {} : { 'Metadata-Flavor': 'Google' };
      const body = kind === 'oversized' ? 'x'.repeat(settings.maximumBytes + 1) :
        kind === 'malformed' ? 'not-a-token' : kind === 'nonascii' ? 'téšt.payload.signature' :
          kind === 'trailing-lf' ? fakeToken + '\n' : kind === 'trailing-cr' ? fakeToken + '\r' : fakeToken;
      if (kind === 'stream-failure') return new Response(new ReadableStream({
        start(stream) { stream.enqueue(new TextEncoder().encode('partial')); stream.error(new Error('test-stream-failure')); },
      }), { headers });
      return new Response(body, { headers, status: kind === 'status' ? 403 : 200 });
    };
    await assert.rejects(refreshFederationToken(settings, controller.signal, transport));
    assert.equal(await fs.readFile(settings.tokenFile, 'utf8'), 'previous-test-token');
    assert.deepEqual(await fs.readdir(directory), ['token']);
  });
}

test('real CLI starts child offline, forwards shutdown and makes no metadata request', { skip: process.platform === 'win32', timeout: 5000 }, async t => {
  const { directory } = await fixture(t);
  const entry = path.join(directory, 'child.mjs');
  await fs.writeFile(entry, "process.on('SIGTERM',()=>process.exit(0));console.log('CHILD_STARTED');setInterval(()=>{},100);");
  const wrapper = fileURLToPath(new URL('../../shared/runtime/federation-entrypoint.mjs', import.meta.url));
  const child = spawn(process.execPath, [wrapper, entry], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.once('data', data => { assert.match(data.toString(), /CHILD_STARTED/); resolve(); });
  });
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const code = await exited;
  assert.equal(code, 0);
});

test('real CLI rejects missing cloud bootstrap before starting child', async t => {
  const { directory } = await fixture(t);
  const marker = path.join(directory, 'marker');
  const entry = path.join(directory, 'child.mjs');
  await fs.writeFile(entry, "import fs from 'node:fs';fs.writeFileSync(" + JSON.stringify(marker) + ",'started');");
  const wrapper = fileURLToPath(new URL('../../shared/runtime/federation-entrypoint.mjs', import.meta.url));
  const child = spawn(process.execPath, [wrapper, entry], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, K_SERVICE: 'test-service' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const code = await new Promise(resolve => child.once('exit', resolve));
  assert.equal(code, 1);
  await assert.rejects(fs.stat(marker), { code: 'ENOENT' });
});

for (const initialFailure of [false, true]) {
  test('real supervisor fails closed on metadata failure; initial=' + initialFailure,
    { skip: process.platform === 'win32', timeout: 6000 }, async t => {
      const { directory, environment } = await fixture(t);
      const marker = path.join(directory, 'started'), entry = path.join(directory, 'child.mjs');
      // Ignore graceful shutdown to exercise the configured forced-stop deadline.
      await fs.writeFile(entry, "import fs from 'node:fs';fs.writeFileSync(" + JSON.stringify(marker) +
        ",'started');process.on('SIGTERM',()=>{});setInterval(()=>{},100);");
      const wrapper = new URL('../../shared/runtime/federation-entrypoint.mjs', import.meta.url).href;
      const script = `import {runFederatedApplication} from ${JSON.stringify(wrapper)};
        let calls=0;globalThis.fetch=async()=>{calls++;if(${initialFailure}||calls>1)
          throw Error('test-sensitive-provider-body');
          return new Response(${JSON.stringify(fakeToken)},{headers:{'Metadata-Flavor':'Google'}})};
        try{process.exitCode=await runFederatedApplication(${JSON.stringify(entry)},${JSON.stringify(environment)})}
        catch{process.exitCode=1};console.log('CALLS:'+calls);`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
        env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject); child.once('exit', resolve);
      });
      assert.equal(code, 1);
      assert.match(stdout, new RegExp('CALLS:' + (initialFailure ? 1 : 2)));
      assert(!stderr.includes('test-sensitive-provider-body'));
      if (initialFailure) await assert.rejects(fs.stat(marker), { code: 'ENOENT' });
      else assert.equal(await fs.readFile(marker, 'utf8'), 'started');
    });
}

test('shutdown during initial metadata fetch never starts the application',
  { skip: process.platform === 'win32', timeout: 6000 }, async t => {
    const { directory, environment } = await fixture(t);
    const marker = path.join(directory, 'started'), entry = path.join(directory, 'child.mjs');
    await fs.writeFile(entry, "import fs from 'node:fs';fs.writeFileSync(" + JSON.stringify(marker) + ",'started');");
    const wrapper = new URL('../../shared/runtime/federation-entrypoint.mjs', import.meta.url).href;
    const script = `import {runFederatedApplication} from ${JSON.stringify(wrapper)};
      globalThis.fetch=async(_url,options)=>new Promise((_resolve,reject)=>{
        const pendingRequest=setInterval(()=>{},1000);
        options.signal.addEventListener('abort',()=>{clearInterval(pendingRequest);reject(Error('test-aborted'));},{once:true});
        console.log('FETCH_STARTED');});
      try{process.exitCode=await runFederatedApplication(${JSON.stringify(entry)},${JSON.stringify(environment)})}
      catch{process.exitCode=1};`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.once('data', () => child.kill('SIGTERM'));
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('exit', resolve);
    });
    assert.equal(code, 1);
    await assert.rejects(fs.stat(marker), { code: 'ENOENT' });
  });

for (const trigger of ['shutdown', 'child-exit']) {
  test('supervisor drains submitted token replacement before return: ' + trigger,
    { skip: process.platform === 'win32', timeout: 6000 }, async t => {
      const { directory, environment } = await fixture(t);
      const marker = path.join(directory, 'exit-request'), entry = path.join(directory, 'child.mjs');
      await fs.writeFile(entry, "import fs from 'node:fs';process.on('SIGTERM',()=>process.exit(0));" +
        "setInterval(()=>{if(fs.existsSync(" + JSON.stringify(marker) + "))process.exit(0)},10);");
      const wrapper = new URL('../../shared/runtime/federation-entrypoint.mjs', import.meta.url).href;
      const script = `import fs from 'node:fs/promises';import {runFederatedApplication} from ${JSON.stringify(wrapper)};
        globalThis.fetch=async()=>new Response(${JSON.stringify(fakeToken)},{headers:{'Metadata-Flavor':'Google'}});
        const original=fs.rename;let calls=0;fs.rename=async(...args)=>{calls++;
          if(calls===2){${trigger === 'shutdown' ? "process.kill(process.pid,'SIGTERM');" : 'await fs.writeFile(' + JSON.stringify(marker) + ",'exit');"}
            await new Promise(resolve=>setTimeout(resolve,150));}
          await original(...args);console.log('RENAMED:'+calls);};
        const code=await runFederatedApplication(${JSON.stringify(entry)},${JSON.stringify(environment)});
        console.log('RETURNED');process.exitCode=code;`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
        env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout.on('data', data => { stdout += data; });
      await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
      assert(stdout.includes('RENAMED:2'));
      assert(stdout.indexOf('RENAMED:2') < stdout.indexOf('RETURNED'));
    });
}
