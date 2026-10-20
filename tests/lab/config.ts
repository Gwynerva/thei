// Where the lab keeps things, and on which port and host name its site runs.
//
// Everything here is read from the environment or from git on demand, never
// at import: `scripts/dev-server.ts` and the lab site's `nuxt.config.ts`
// import this file too.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fnv1a } from './util';

/** This checkout: the main one or a worktree. */
export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

let mainRoot: string | undefined;

/**
 * The main checkout, which every worktree of it shares: its `.lab/cache/`
 * sits on the same volume as the worktrees under `.claude/worktrees/`, so a
 * snapshot's files reach any of them by hard link.
 */
export function mainCheckout(): string {
  if (mainRoot) return mainRoot;
  try {
    const common = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    mainRoot = basename(common) === '.git' ? dirname(common) : repoRoot;
  } catch {
    mainRoot = repoRoot;
  }
  return mainRoot;
}

/**
 * The worktree's folder name, or undefined in the main checkout. Compared
 * as paths, not as words: git and Node may spell a Windows drive letter in
 * different cases.
 */
export function worktreeName(): string | undefined {
  const main = resolve(mainCheckout());
  const here = resolve(repoRoot);
  return relative(main, here) === '' ? undefined : basename(here);
}

/** Every checkout of this repository: the main one first, then each worktree. */
export function checkouts(): string[] {
  try {
    const list = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const found = list
      .split(/\r?\n/)
      .filter((line) => line.startsWith('worktree '))
      .map((line) => resolve(line.slice('worktree '.length).trim()));
    return found.length ? found : [resolve(repoRoot)];
  } catch {
    return [resolve(repoRoot)];
  }
}

/** The ports a worktree's lab site may take. */
export const WORKTREE_PORTS = { first: 3200, count: 100 } as const;

/** A port a worktree took because its own was another's (`lab up --start`). */
export function portFile(checkout = repoRoot): string {
  return join(checkout, '.lab', 'port.json');
}

/** The port written in a checkout's `port.json`, if any. */
export function claimedPort(checkout = repoRoot): number | undefined {
  try {
    const port = Number(
      JSON.parse(readFileSync(portFile(checkout), 'utf8')).port,
    );
    return Number.isInteger(port) && port > 0 ? port : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 3003 in the main checkout; in a worktree a port of its own between 3200
 * and 3299, away from the fixture's, the release bench's and the fake
 * models' ports — derived from its name, or the one it took when two names
 * met on one port (`.lab/port.json`). `THEI_LAB_PORT` overrides both.
 */
export function labPort(): number {
  const fromEnv = Number(process.env.THEI_LAB_PORT);
  if (fromEnv) return fromEnv;
  const worktree = worktreeName();
  if (!worktree) return 3003;
  return (
    claimedPort() ??
    WORKTREE_PORTS.first + (fnv1a(worktree) % WORKTREE_PORTS.count)
  );
}

/**
 * The name a browser opens the lab site by. Cookies ignore ports, so each
 * checkout's site gets a host name of its own and their sessions never meet,
 * nor the playground's (`localhost`) or the fixture's (`127.0.0.1`).
 */
export function labHost(): string {
  const worktree = worktreeName();
  if (!worktree) return 'lab.localhost';
  const label = worktree
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${label || 'worktree'}.lab.localhost`;
}

export function labOrigin(): string {
  return `http://${labHost()}:${labPort()}`;
}

/** The same server by its address, for clients that do not resolve `*.localhost`. */
export function labLoopbackOrigin(): string {
  return `http://127.0.0.1:${labPort()}`;
}

/** Folders of this checkout. All of them but `site/` are ignored by git. */
export const labDir = join(repoRoot, '.lab');
export const paths = {
  /** The lab site: a Nuxt app over the layer, like `.playground/`. */
  site: join(labDir, 'site'),
  content: join(labDir, 'site', 'content'),
  /** What the current site was made from and what is in it (`SiteIndex`). */
  siteIndex: join(labDir, 'site-index.json'),
  /** Plays and reviews, per study. */
  runs: join(labDir, 'runs'),
  /** Studies of the moment, never committed. */
  studies: join(labDir, 'studies'),
  /** Which snapshot the playground holds, written by `lab up playground`. */
  playgroundState: join(labDir, 'playground.json'),
  /**
   * The lab site's server as `scripts/dev-server.ts` started it — its PID,
   * port and mode — while it runs, however it was started.
   */
  serverRun: join(labDir, 'site-run.json'),
  /** Kept studies, in git only with the owner's agreement. */
  keptStudies: join(repoRoot, 'tests', 'lab', 'studies'),
  personas: join(repoRoot, 'tests', 'lab', 'personas'),
  lock: join(repoRoot, 'tests', 'lab', 'archive.lock.json'),
  conformance: join(repoRoot, 'tests', 'lab', 'archive', 'conformance'),
  playground: join(repoRoot, '.playground'),
  playgroundContent: join(repoRoot, '.playground', 'content'),
} as const;

/**
 * What every checkout shares: the archive's releases, the files of its packs
 * by hash, and site snapshots. `THEI_LAB_CACHE` moves it; on another volume
 * than a checkout, files are copied instead of linked.
 */
export function cacheDir(): string {
  return process.env.THEI_LAB_CACHE
    ? resolve(process.env.THEI_LAB_CACHE)
    : join(mainCheckout(), '.lab', 'cache');
}

export const cachePaths = () => {
  const root = cacheDir();
  return {
    root,
    archive: join(root, 'archive'),
    downloads: join(root, 'downloads'),
    blobs: join(root, 'blobs'),
    snapshots: join(root, 'snapshots'),
    locks: join(root, 'locks'),
  };
};

/**
 * A local checkout of the archive repository, read instead of the release
 * the lock pins: for working on the archive and on the adapter together.
 */
export function archiveOverride(): string | undefined {
  const dir = process.env.THEI_LAB_ARCHIVE;
  if (!dir) return undefined;
  const full = resolve(dir);
  return existsSync(full) ? full : undefined;
}
