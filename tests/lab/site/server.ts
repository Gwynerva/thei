// The lab site's server, always through `scripts/dev-server.ts`. One the lab
// starts itself is recorded — the wrapper's PID and the server's own, from
// its `nuxt.lock` — and only such a one is ever stopped by it.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { labDir, labPort, paths, repoRoot } from '../config';
import { portAnswers } from '../util';

const recordPath = join(labDir, 'site-server.json');
const logPath = join(labDir, 'site-server.log');
const lockPath = join(paths.site, '.nuxt', 'nuxt.lock');

interface ServerRecord {
  /** The `scripts/dev-server.ts` the lab spawned. */
  pid: number;
  /** The server itself, as its `nuxt.lock` names it (dev only). */
  serverPid?: number;
  port: number;
  startedAt: string;
  mode: 'dev' | 'build';
}

function alive(pid: number | undefined) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock():
  { pid: number; port: number; startedAt: number } | undefined {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return undefined;
  }
}

/** The server the lab started, if it still runs. */
export function ownServer(): ServerRecord | undefined {
  if (!existsSync(recordPath)) return undefined;
  const record = JSON.parse(readFileSync(recordPath, 'utf8')) as ServerRecord;
  if (
    record.port !== labPort() ||
    (!alive(record.pid) && !alive(record.serverPid))
  ) {
    rmSync(recordPath, { force: true });
    return undefined;
  }
  return record;
}

/** dev or build, as the running server was started. */
export function serverMode(): 'dev' | 'build' {
  return ownServer()?.mode ?? (readLock() ? 'dev' : 'build');
}

/** Starts the lab site in the background and waits for its port. */
export async function startServer(
  mode: 'dev' | 'build' = 'dev',
  timeoutMs = 10 * 60 * 1000,
): Promise<ServerRecord> {
  if (await portAnswers(labPort()))
    throw new Error(`Port ${labPort()} is taken already.`);
  mkdirSync(labDir, { recursive: true });
  const out = openSync(logPath, 'w');
  const spawnedAt = Date.now();
  // Detached, so the server outlives this command (on Windows a child that
  // is not would go with it, and leave its own child running unrecorded).
  const child = spawn(
    process.execPath,
    ['scripts/dev-server.ts', 'lab', ...(mode === 'build' ? ['--build'] : [])],
    {
      cwd: repoRoot,
      detached: true,
      stdio: ['ignore', out, out],
      windowsHide: true,
    },
  );
  child.unref();
  const record: ServerRecord = {
    pid: child.pid!,
    port: labPort(),
    startedAt: new Date().toISOString(),
    mode,
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  const deadline = Date.now() + timeoutMs;
  while (!(await portAnswers(labPort()))) {
    if (!alive(record.pid))
      throw new Error(`The lab site stopped while starting; see ${logPath}.`);
    if (Date.now() > deadline)
      throw new Error(`The lab site did not start in time; see ${logPath}.`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const lock = readLock();
  if (
    mode === 'dev' &&
    lock &&
    lock.port === labPort() &&
    lock.startedAt >= spawnedAt - 1000
  ) {
    record.serverPid = lock.pid;
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  }
  return record;
}

function killTree(pid: number) {
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  else
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {}
    }
}

/**
 * Waits until a site is ready for a play: open, and its search index built.
 * The index is rebuilt in the background after a restore, and a search asked
 * while it builds finds little — a person would meet a site that is not
 * there yet, and the reviewers would judge the lab, not Thei.
 */
export async function waitUntilReady(
  origin: string,
  log: (message: string) => void = () => {},
  timeoutMs = 15 * 60 * 1000,
) {
  const deadline = Date.now() + timeoutMs;
  let said = -1;
  for (;;) {
    let building: number | undefined | 'down';
    try {
      const progress = await fetch(`${origin}/api/update/progress`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
      const open =
        progress.status === 200 &&
        (await progress.json().catch(() => ({})))?.site === 'open';
      if (!open) building = 'down';
      else {
        const search = await fetch(`${origin}/api/search?q=lab`, {
          signal: AbortSignal.timeout(30_000),
        });
        const body =
          search.status === 200
            ? await search.json().catch(() => ({}))
            : { building: 0 };
        building =
          typeof body.building === 'number' ? body.building : undefined;
      }
    } catch {
      building = 'down';
    }
    if (building === undefined) return;
    if (Date.now() > deadline)
      throw new Error(
        `${origin} was not ready in time (search index: ${building}).`,
      );
    if (typeof building === 'number' && building !== said) {
      log(`  … the search index is being built (${building}%)`);
      said = building;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** Stops the server the lab started, and nothing else. */
export async function stopOwnServer(): Promise<boolean> {
  const record = ownServer();
  if (!record) return false;
  for (const pid of [record.pid, record.serverPid])
    if (alive(pid)) killTree(pid!);
  const deadline = Date.now() + 30_000;
  while (await portAnswers(labPort())) {
    if (Date.now() > deadline)
      throw new Error(
        `The lab site (PID ${record.serverPid ?? record.pid}) did not stop.`,
      );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  rmSync(recordPath, { force: true });
  return true;
}
