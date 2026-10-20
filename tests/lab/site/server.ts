// The lab site's server, always through `scripts/dev-server.ts`. One the lab
// starts itself is recorded — the wrapper's PID and the server's own, from
// its `nuxt.lock`, each with the moment the system says it started — and
// only such a one is ever stopped by it. A PID alone proves nothing: after
// a restart the system gives the number to whatever starts next, so a
// recorded process is the same one only while it started when it did.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import {
  checkouts,
  claimedPort,
  labDir,
  labOrigin,
  labPort,
  paths,
  portFile,
  repoRoot,
  WORKTREE_PORTS,
  worktreeName,
} from '../config';
import {
  alive,
  fnv1a,
  portAnswers,
  readJson,
  readJsonIf,
  writeJson,
} from '../util';

const logPath = join(labDir, 'site-server.log');

export interface ServerRecord {
  /** The `scripts/dev-server.ts` the lab spawned. */
  pid: number;
  /** When the system says `pid` started, in ms since the epoch. */
  pidStartedAt?: number;
  /** The server itself, as its `nuxt.lock` names it (dev only). */
  serverPid?: number;
  /** When the system says `serverPid` started. */
  serverStartedAt?: number;
  port: number;
  startedAt: string;
  mode: 'dev' | 'build';
}

/** A recorded server whose processes are still the ones recorded. */
export type OwnServer = ServerRecord & {
  /** The recorded PIDs that are still those processes: the ones to stop. */
  pids: number[];
};

/** How the lab looks at processes: the system's own, or a test's stand-in. */
export interface Processes {
  alive(pid: number): boolean;
  /** When the system says the process started, or undefined. */
  startedAt(pid: number): number | undefined;
  portAnswers(port: number): Promise<boolean>;
  /** Stops the process and everything it started. */
  killTree(pid: number): void;
}

/** Where the lab's record and the server's lock are, and on which port. */
export interface ServerFiles {
  record: string;
  lock: string;
  port: number;
}

/** The record `scripts/dev-server.ts` keeps of the lab site it runs. */
export interface ServerRun {
  pid: number;
  port: number;
  mode: 'dev' | 'build';
  /** The checkout whose lab site it is. */
  checkout: string;
  startedAt: number;
}

interface NuxtLock {
  pid: number;
  port: number;
  startedAt: number;
  cwd?: string;
}

/** Two starts read from the system are one when this close. */
const SAME_START_MS = 2000;

/**
 * When the system says a process started, in ms since the epoch; undefined
 * when it cannot say (no such process, or one it does not show).
 */
export function processStartedAt(pid: number): number | undefined {
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  try {
    const out =
      process.platform === 'win32'
        ? execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`,
            ],
            {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
              windowsHide: true,
              timeout: 15_000,
            },
          )
        : execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 15_000,
          });
    const at = Date.parse(out.trim());
    return Number.isFinite(at) ? at : undefined;
  } catch {
    return undefined;
  }
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

export const systemProcesses: Processes = {
  alive,
  startedAt: processStartedAt,
  portAnswers,
  killTree,
};

export function serverFiles(): ServerFiles {
  return {
    record: join(labDir, 'site-server.json'),
    lock: join(paths.site, '.nuxt', 'nuxt.lock'),
    port: labPort(),
  };
}

function readLock(file: string): NuxtLock | undefined {
  try {
    const lock = readJson<NuxtLock>(file);
    return Number.isInteger(lock.pid) && Number.isInteger(lock.port)
      ? lock
      : undefined;
  } catch {
    return undefined;
  }
}

const samePath = (a: string, b: string) =>
  relative(resolve(a), resolve(b)) === '';

/** Whether a PID is still the process that started at `recorded`. */
function sameProcess(
  pid: number | undefined,
  recorded: number | undefined,
  processes: Processes,
) {
  if (!pid || recorded === undefined || !processes.alive(pid)) return false;
  const now = processes.startedAt(pid);
  return now !== undefined && Math.abs(now - recorded) <= SAME_START_MS;
}

/**
 * The server the lab started, while its processes are still the ones it
 * recorded: each PID with the start the system gave it then, or — for a
 * server recorded without one — the `nuxt.lock` naming that PID on that
 * port while the port answers. Otherwise the record is stale: it goes, and
 * nothing it names is ever stopped.
 */
export async function ownServer(
  options: { files?: ServerFiles; processes?: Processes } = {},
): Promise<OwnServer | undefined> {
  const files = options.files ?? serverFiles();
  const processes = options.processes ?? systemProcesses;
  if (!existsSync(files.record)) return undefined;
  let record: ServerRecord | undefined;
  try {
    record = readJson<ServerRecord>(files.record);
  } catch {}
  const pids: number[] = [];
  if (record && record.port === files.port) {
    if (sameProcess(record.pid, record.pidStartedAt, processes))
      pids.push(record.pid);
    if (sameProcess(record.serverPid, record.serverStartedAt, processes))
      pids.push(record.serverPid!);
    else if (record.serverPid && record.serverStartedAt === undefined) {
      const lock = readLock(files.lock);
      if (
        lock?.pid === record.serverPid &&
        lock.port === record.port &&
        processes.alive(record.serverPid) &&
        (await processes.portAnswers(record.port))
      )
        pids.push(record.serverPid);
    }
  }
  if (!record || !pids.length) {
    rmSync(files.record, { force: true });
    return undefined;
  }
  return { ...record, pids };
}

/** Stops the server the lab started, and nothing else. */
export async function stopOwnServer(
  options: {
    files?: ServerFiles;
    processes?: Processes;
    timeoutMs?: number;
  } = {},
): Promise<boolean> {
  const files = options.files ?? serverFiles();
  const processes = options.processes ?? systemProcesses;
  const own = await ownServer({ files, processes });
  if (!own) return false;
  for (const pid of own.pids) if (processes.alive(pid)) processes.killTree(pid);
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  while (await processes.portAnswers(own.port)) {
    if (Date.now() > deadline)
      throw new Error(
        `The lab site (PID ${own.serverPid ?? own.pid}) did not stop.`,
      );
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  rmSync(files.record, { force: true });
  return true;
}

/** What `scripts/dev-server.ts` says of the lab site it runs, while it runs. */
function serverRun(): ServerRun | undefined {
  try {
    const run = readJsonIf<ServerRun | undefined>(paths.serverRun, undefined);
    return run && run.port === labPort() && alive(run.pid) ? run : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether what runs on the lab's port is this checkout's lab site: as
 * `scripts/dev-server.ts` recorded it, as its `nuxt.lock` names this
 * checkout's site folder, or as the lab started it. Two worktrees may come
 * to one port, and a play on another checkout's site would judge its code.
 */
export async function siteIsOurs(): Promise<boolean> {
  const run = serverRun();
  if (run && samePath(run.checkout, repoRoot)) return true;
  const lock = readLock(serverFiles().lock);
  if (
    lock &&
    lock.port === labPort() &&
    lock.cwd &&
    samePath(lock.cwd, paths.site) &&
    alive(lock.pid)
  )
    return true;
  return Boolean(await ownServer());
}

/** Refuses unless this checkout's lab site answers. */
export async function requireOwnSite() {
  if (!(await portAnswers(labPort())))
    throw new Error('The lab site is not running: bun run lab up lab --start');
  if (!(await siteIsOurs()))
    throw new Error(
      `Something answers at ${labOrigin()}, but not this checkout's lab site (another worktree's, or a server of its own). ` +
        'Stop it, or start this one with bun run lab up lab --start, which takes another port in a worktree.',
    );
}

/** dev or build, as the running server was started. */
export async function serverMode(): Promise<'dev' | 'build'> {
  const run = serverRun();
  if (run) return run.mode;
  const own = await ownServer();
  if (own) return own.mode;
  const lock = readLock(serverFiles().lock);
  return lock?.port === labPort() && alive(lock.pid) ? 'dev' : 'build';
}

/**
 * A worktree's own port when another checkout's site holds it: the next one
 * free among the worktrees' ports that no other worktree is given or took,
 * kept in `.lab/port.json` so the site, its config and every command agree.
 */
async function takeAnotherPort(): Promise<number> {
  const here = resolve(repoRoot);
  const others = checkouts().filter((checkout) => !samePath(checkout, here));
  const reserved = new Set<number>();
  for (const checkout of others) {
    const taken = claimedPort(checkout);
    if (taken) reserved.add(taken);
    reserved.add(
      WORKTREE_PORTS.first + (fnv1a(basename(checkout)) % WORKTREE_PORTS.count),
    );
  }
  const from = labPort() - WORKTREE_PORTS.first;
  for (let step = 1; step < WORKTREE_PORTS.count; step++) {
    const port = WORKTREE_PORTS.first + ((from + step) % WORKTREE_PORTS.count);
    if (reserved.has(port) || (await portAnswers(port))) continue;
    writeJson(portFile(), { port, takenAt: new Date().toISOString() });
    return port;
  }
  throw new Error(
    `No port between ${WORKTREE_PORTS.first} and ${WORKTREE_PORTS.first + WORKTREE_PORTS.count - 1} is free for this worktree's lab site.`,
  );
}

/**
 * Makes the lab's port this checkout's: `ours` when its own site answers
 * there, `free` when nothing does. A worktree whose port another site holds
 * takes another; the main checkout keeps 3003 and says who is in the way.
 */
export async function claimPort(
  log: (message: string) => void = () => {},
): Promise<'ours' | 'free'> {
  if (!(await portAnswers(labPort()))) return 'free';
  if (await siteIsOurs()) return 'ours';
  const taken = labPort();
  if (!worktreeName() || process.env.THEI_LAB_PORT)
    throw new Error(
      `Port ${taken} answers, but not with this checkout's lab site: stop whatever runs there first.`,
    );
  const port = await takeAnotherPort();
  log(
    `Port ${taken} answers with another site: this worktree's lab site takes ${port} (${relative(repoRoot, portFile())}).`,
  );
  return 'free';
}

/** Starts the lab site in the background and waits for its port. */
export async function startServer(
  mode: 'dev' | 'build' = 'dev',
  timeoutMs = 10 * 60 * 1000,
  log: (message: string) => void = (message) => console.log(message),
): Promise<ServerRecord> {
  if ((await claimPort(log)) === 'ours')
    throw new Error(`The lab site runs at ${labOrigin()} already.`);
  const files = serverFiles();
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
    pidStartedAt: processStartedAt(child.pid!),
    port: files.port,
    startedAt: new Date(spawnedAt).toISOString(),
    mode,
  };
  writeJson(files.record, record);
  const lock = () => {
    const found = readLock(files.lock);
    return found &&
      found.port === files.port &&
      found.startedAt >= spawnedAt - 1000
      ? found
      : undefined;
  };
  try {
    const deadline = Date.now() + timeoutMs;
    while (!(await portAnswers(files.port))) {
      if (!alive(record.pid))
        throw new Error(`The lab site stopped while starting; see ${logPath}.`);
      if (Date.now() > deadline)
        throw new Error(`The lab site did not start in time; see ${logPath}.`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    // What was started goes with the failure: nothing runs unrecorded.
    killTree(record.pid);
    const server = lock();
    if (server && alive(server.pid)) killTree(server.pid);
    rmSync(files.record, { force: true });
    throw error;
  }
  const server = mode === 'dev' ? lock() : undefined;
  if (server) {
    record.serverPid = server.pid;
    record.serverStartedAt = processStartedAt(server.pid);
    writeJson(files.record, record);
  }
  return record;
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
