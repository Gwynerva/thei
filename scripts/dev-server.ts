// Starts one of this repository's servers on its own port, and only there.
// Nuxt quietly moves to the next free port when its own is taken, where
// nobody looks for it; this script refuses instead.
//
//   bun scripts/dev-server.ts playground          nuxt dev on 3000
//   bun scripts/dev-server.ts fixture             nuxt dev on 3001
//   bun scripts/dev-server.ts fixture --build     production build on 3001
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { E2E_PORT } from '../tests/e2e/fixture-url';

const targets = {
  playground: { dir: '.playground', port: 3000, fork: true },
  fixture: { dir: 'tests/e2e/fixture', port: E2E_PORT, fork: false },
} as const;

const root = fileURLToPath(new URL('..', import.meta.url));
/** What a production build is made from, and what inside it is not. */
const buildSources = [
  'app',
  'server',
  'shared',
  'modules',
  'public',
  'update',
  'backup',
  'tests/e2e/fixture',
  'nuxt.config.ts',
  'package.json',
  'bun.lock',
  'tsconfig.json',
];
const skippedInSources = new Set(['node_modules', '.nuxt', '.output', '.thei']);
/**
 * The fixture's own data, which the tests write to: skipped by its path, not
 * by its name, or every folder called `content` — the editor's components
 * among them — would go unwatched and leave the build stale.
 */
const skippedSourcePaths = new Set(['tests/e2e/fixture/content']);
const name = process.argv[2] as keyof typeof targets;
const target = targets[name];
if (!target) {
  console.error(
    `Usage: bun scripts/dev-server.ts <${Object.keys(targets).join('|')}> [--build]`,
  );
  process.exit(2);
}
const host = '127.0.0.1';
const origin = `http://${host}:${target.port}`;
const bun = process.execPath;

if (await portTaken(target.port)) {
  const owner = await describeOwner();
  if (owner) {
    console.log(`The ${name} already runs at ${origin} (${owner}). Use it.`);
    process.exit(0);
  }
  console.error(
    `Port ${target.port} is taken, and not by a ${name} this script started. ` +
      'Not moving to another port: find the owner first.',
  );
  process.exit(1);
}

if (process.argv.includes('--build')) {
  // Most of a build is Nitro bundling the server, which takes minutes: build
  // again only when a source has changed since the last one.
  const built = modifiedAt(`${target.dir}/.output/nitro.json`);
  if (!built || buildSources.some((path) => newerThan(path, built))) {
    const build = spawnSync(bun, ['x', 'nuxt', 'build', target.dir], {
      cwd: root,
      stdio: 'inherit',
    });
    if (build.status !== 0) process.exit(build.status ?? 1);
  } else {
    console.log(`The ${name} build is up to date.`);
  }
  run('node', [`${target.dir}/.output/server/index.mjs`], {
    HOST: host,
    PORT: String(target.port),
  });
} else {
  // The lock records this server in `.nuxt/nuxt.lock`, which is how the next
  // run recognises it, and nuxi refuses a second one over the same directory.
  const args = ['x', 'nuxt', 'dev', target.dir, '--port', String(target.port)];
  args.push('--host', host);
  if (!target.fork) args.push('--no-fork');
  run(bun, args, {
    NUXT_LOCK: '1',
    // Nitro's dev worker takes requests from the dev server over a named pipe
    // on Windows, where reading an upload's body from it can stall the worker
    // for seconds, every request with it. A port on localhost has no stall.
    ...(process.platform === 'win32' ? { NITRO_NO_UNIX_SOCKET: '1' } : {}),
  });
}

function modifiedAt(path: string): number | undefined {
  try {
    return statSync(`${root}/${path}`).mtimeMs;
  } catch {
    return undefined;
  }
}

/** Whether a file, or anything in a directory, changed after `time`. */
function newerThan(path: string, time: number): boolean {
  const full = `${root}/${path}`;
  if (!existsSync(full)) return false;
  if (!statSync(full).isDirectory()) return statSync(full).mtimeMs > time;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (skippedInSources.has(entry.name) || skippedSourcePaths.has(child))
      continue;
    if (
      entry.isDirectory() ? newerThan(child, time) : modifiedAt(child)! > time
    )
      return true;
  }
  return false;
}

function run(command: string, args: string[], env: Record<string, string>) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code) => process.exit(code ?? 0));
}

/** Taken on either loopback: a server on [::1] answers `localhost` as well. */
async function portTaken(port: number): Promise<boolean> {
  for (const address of ['127.0.0.1', '::1']) {
    const taken = await new Promise<boolean>((resolve) => {
      const probe = createServer()
        .once('error', (error: NodeJS.ErrnoException) =>
          resolve(error.code === 'EADDRINUSE'),
        )
        .once('listening', () => probe.close(() => resolve(false)))
        .listen(port, address);
    });
    if (taken) return true;
  }
  return false;
}

/** Recognises a dev server by its lock, and the fixture by its marker. */
async function describeOwner(): Promise<string | undefined> {
  try {
    const lockPath = `${root}/${target.dir}/.nuxt/nuxt.lock`;
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (lock.port === target.port) {
      process.kill(lock.pid, 0);
      return `nuxt dev, PID ${lock.pid}`;
    }
  } catch {}
  if (name === 'fixture') {
    try {
      const response = await fetch(`${origin}/test-fixture.json`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) return 'it answers with its marker';
    } catch {}
  }
  return undefined;
}
