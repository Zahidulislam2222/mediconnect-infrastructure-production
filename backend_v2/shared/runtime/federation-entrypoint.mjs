import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readFederationSettings } from './federation-settings.mjs';
import { refreshFederationToken } from './federation-token.mjs';

/** @param {string} entry @param {NodeJS.ProcessEnv} environment */
export async function runFederatedApplication(entry, environment) {
  const settings = readFederationSettings(environment), controller = new AbortController();
  /** @type {import('node:child_process').ChildProcess|undefined} */
  let child;
  let failed = false;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let refresh;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let shutdown;
  /** @type {Promise<void>|undefined} */
  let activeRefresh;
  /** @param {NodeJS.Signals} signal */
  const stop = signal => {
    controller.abort();
    clearTimeout(refresh);
    child?.kill(signal);
    if (settings && child && !shutdown) shutdown = setTimeout(() => child?.kill('SIGKILL'), settings.shutdownMs);
  };
  const terminate = () => stop('SIGTERM'), interrupt = () => stop('SIGINT');
  process.once('SIGTERM', terminate);
  process.once('SIGINT', interrupt);
  const schedule = () => {
    if (!settings || controller.signal.aborted) return;
    refresh = setTimeout(() => {
      activeRefresh = refreshFederationToken(settings, controller.signal).then(schedule, () => {
        if (!controller.signal.aborted) {
          failed = true;
          console.error('Federation refresh failed');
          stop('SIGTERM');
        }
      });
    }, settings.refreshMs);
  };
  try {
    if (settings) {
      activeRefresh = refreshFederationToken(settings, controller.signal);
      await activeRefresh;
    }
    controller.signal.throwIfAborted();
    const launched = child = spawn(process.execPath, [entry], { env: environment, stdio: 'inherit', shell: false });
    schedule();
    return await new Promise((resolve, reject) => {
      launched.once('error', reject);
      launched.once('exit', code => { resolve(failed ? 1 : code ?? 1); });
    });
  } finally {
    controller.abort(); clearTimeout(refresh); clearTimeout(shutdown);
    process.removeListener('SIGTERM', terminate); process.removeListener('SIGINT', interrupt);
    // An already-submitted atomic rename cannot be cancelled. Drain it before exit.
    await activeRefresh?.catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error('One application entry is required');
    process.exitCode = Number(await runFederatedApplication(process.argv[2], process.env));
  } catch {
    console.error('Federation runtime startup failed');
    process.exitCode = 1;
  }
}
