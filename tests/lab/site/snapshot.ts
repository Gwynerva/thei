// Snapshots of a seeded site in the shared cache, and putting one in place.
//
// A snapshot is what a backup of the site holds (`server/thei/content-layout.ts`):
// the database (a consistent copy), the config and the folders beside the
// library, and the list of the library's files. The files themselves live
// once in the cache, linked into every site restored from it: Thei writes a
// stored file beside it and renames it into place, and deletes by unlinking,
// so a file it holds is never written through a link.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import {
  THEI_BACKUP_DIRS,
  THEI_BACKUP_FILES,
  THEI_CONTENT_DIRS,
} from '../../../server/thei/content-layout';
import { cachePaths, repoRoot } from '../config';
import type { SiteIndex, SnapshotManifest } from '../types';
import { alive, readJson, readJsonIf } from '../util';
import { copyDatabase, hasHotJournal, readLedger, touchAssets } from './sqlite';

const DATABASE = 'thei.db';
const CONFIG = 'thei.config.json';

export interface SnapshotPaths {
  dir: string;
  manifest: string;
  database: string;
  config: string;
  index: string;
}

export function snapshotPaths(
  id: string,
  root = cachePaths().snapshots,
): SnapshotPaths {
  const dir = join(root, id);
  return {
    dir,
    manifest: join(dir, 'manifest.json'),
    database: join(dir, DATABASE),
    config: join(dir, CONFIG),
    index: join(dir, 'site-index.json'),
  };
}

/** Where the library's files are kept once for every snapshot. */
export function siteAssetsDir(root = cachePaths().root) {
  return join(root, 'site-assets');
}

/** The search index beside a site's content: it describes that content, and is built anew. */
export function searchIndexFiles(siteDir: string) {
  return [
    'search.db',
    'search.db-wal',
    'search.db-shm',
    'search.db-journal',
  ].map((name) => join(siteDir, '.thei', name));
}

/** A hard link, or a copy where one cannot be made (another volume). */
export function linkOrCopy(
  from: string,
  to: string,
  link: typeof linkSync = linkSync,
): 'linked' | 'copied' {
  mkdirSync(dirname(to), { recursive: true });
  try {
    link(from, to);
    return 'linked';
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return 'linked';
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'ENOTSUP') throw error;
    copyFileSync(from, to);
    return 'copied';
  }
}

/** A rename, tried again while something (an indexer, an antivirus) holds a file. */
export function retryRename(from: string, to: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        attempt >= 20 ||
        (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES')
      )
        throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

/**
 * Removes a folder nothing needs any more — a restore's work, or content a
 * snapshot replaced — telling instead of failing when something holds it.
 */
function removeLater(dir: string) {
  try {
    rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 20,
      retryDelay: 250,
    });
  } catch (error) {
    console.warn(
      `! ${dir} could not be removed (${(error as Error).message.split('\n')[0]}); nothing needs it, and it can be removed by hand.`,
    );
  }
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  const visit = (folder: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) found.push(path);
    }
  };
  visit(dir);
  return found;
}

/** The folders of a backup that are copied whole; the library is linked file by file. */
const copiedDirs = () =>
  THEI_BACKUP_DIRS.filter((dir) => dir !== THEI_CONTENT_DIRS.assets);

function gitState() {
  const run = (args: string[]) =>
    execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  try {
    return {
      commit: run(['rev-parse', 'HEAD']),
      dirty: run(['status', '--porcelain']).length > 0,
    };
  } catch {
    return { commit: '', dirty: true };
  }
}

function stamp(at = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
}

export interface SaveOptions {
  contentDir: string;
  index?: SiteIndex;
  cacheRoot?: string;
  link?: typeof linkSync;
}

/** Saves the site's content as a snapshot; the server may be running. */
export function saveSnapshot(options: SaveOptions): SnapshotManifest {
  const cacheRoot = options.cacheRoot ?? cachePaths().root;
  const archive = options.index?.archive;
  const id = `${archive ? archive.version.replace(/[^a-z0-9.-]+/gi, '-') : 'site'}_${stamp()}`;
  const target = snapshotPaths(id, join(cacheRoot, 'snapshots'));
  const work = `${target.dir}.tmp-${process.pid}`;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  for (const file of THEI_BACKUP_FILES) {
    const from = join(options.contentDir, file);
    if (file === DATABASE) copyDatabase(from, join(work, file));
    else copyFileSync(from, join(work, file));
  }
  for (const dir of copiedDirs()) {
    const from = join(options.contentDir, dir);
    if (existsSync(from)) cpSync(from, join(work, dir), { recursive: true });
  }
  if (options.index)
    writeFileSync(
      join(work, 'site-index.json'),
      `${JSON.stringify(options.index, null, 2)}\n`,
    );

  const assetsRoot = join(options.contentDir, THEI_CONTENT_DIRS.assets);
  const store = siteAssetsDir(cacheRoot);
  let copied = 0;
  const assets = filesUnder(assetsRoot).map((path) => {
    const rel = relative(assetsRoot, path).replaceAll('\\', '/');
    const blob = join(store, rel);
    if (!existsSync(blob) && linkOrCopy(path, blob, options.link) === 'copied')
      copied++;
    return { path: rel, sha256: '', bytes: statSync(path).size };
  });

  const config = JSON.parse(readFileSync(join(work, CONFIG), 'utf8'));
  const manifest: SnapshotManifest = {
    id,
    createdAt: new Date().toISOString(),
    archive: archive ?? { conformance: true },
    adapter: options.index?.adapter ?? '',
    ledger: readLedger(join(work, DATABASE)),
    engineVersion: String(config.version ?? ''),
    seedDay: options.index?.seedDay ?? '',
    code: gitState(),
    assets,
  };
  writeFileSync(
    join(work, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  mkdirSync(dirname(target.dir), { recursive: true });
  retryRename(work, target.dir);
  if (copied)
    console.warn(
      `${copied} file(s) were copied into the cache, not linked: another volume?`,
    );
  return manifest;
}

/** Why a manifest cannot be trusted, or undefined when it can. */
function manifestProblem(value: unknown, folder: string): string | undefined {
  const manifest = value as Partial<SnapshotManifest> | undefined;
  if (!manifest || typeof manifest !== 'object') return 'is not an object';
  if (manifest.id !== folder) return `names another snapshot (${manifest.id})`;
  if (typeof manifest.createdAt !== 'string') return 'has no createdAt';
  if (!manifest.archive || typeof manifest.archive !== 'object')
    return 'has no archive';
  if (!Array.isArray(manifest.ledger)) return 'has no ledger';
  if (
    !Array.isArray(manifest.assets) ||
    manifest.assets.some((asset) => typeof asset?.path !== 'string')
  )
    return 'has no list of files';
  return undefined;
}

/** Every snapshot of the cache, newest first; one whose manifest is broken is left out, and named. */
export function listSnapshots(
  cacheRoot = cachePaths().root,
): SnapshotManifest[] {
  const root = join(cacheRoot, 'snapshots');
  if (!existsSync(root)) return [];
  const found: SnapshotManifest[] = [];
  for (const name of readdirSync(root)) {
    const file = join(root, name, 'manifest.json');
    if (name.includes('.tmp-') || !existsSync(file)) continue;
    let problem: string | undefined;
    try {
      const manifest = readJson<unknown>(file);
      problem = manifestProblem(manifest, name);
      if (!problem) found.push(manifest as SnapshotManifest);
    } catch (error) {
      problem = `cannot be read (${(error as Error).message.split('\n')[0]})`;
    }
    if (problem)
      console.warn(`! Snapshot ${name} is left out: its manifest ${problem}.`);
  }
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Migrations of a snapshot this checkout does not know: it cannot run it. */
export function unknownMigrations(
  manifest: SnapshotManifest,
  known: readonly string[],
): string[] {
  const set = new Set(known);
  return manifest.ledger.filter((id) => !set.has(id));
}

/**
 * Snapshots the checkouts still name: the one each playground holds
 * (`.lab/playground.json`) and the one each lab site was restored from or
 * saved as (`.lab/site-index.json`).
 */
export function referencedSnapshots(checkoutDirs: string[]): Set<string> {
  const named = new Set<string>();
  for (const checkout of checkoutDirs) {
    const lab = join(checkout, '.lab');
    for (const id of [
      readJsonIf<{ snapshot?: string } | undefined>(
        join(lab, 'playground.json'),
        undefined,
      )?.snapshot,
      readJsonIf<{ snapshotId?: string } | undefined>(
        join(lab, 'site-index.json'),
        undefined,
      )?.snapshotId,
    ])
      if (id) named.add(id);
  }
  return named;
}

export interface CollectOptions {
  cacheRoot?: string;
  /** How many of the newest snapshots stay, at least one. */
  keep: number;
  /** Snapshots that stay whatever their age (`referencedSnapshots`). */
  referenced: Set<string>;
}

/**
 * Removes the snapshots past the newest `keep` that no checkout names, and
 * every file of the cache no snapshot left holds.
 */
export function collectSnapshots(options: CollectOptions) {
  if (!Number.isInteger(options.keep) || options.keep < 1)
    throw new Error(
      `--keep is how many snapshots stay: a whole number, at least 1 (not "${options.keep}").`,
    );
  const cacheRoot = options.cacheRoot ?? cachePaths().root;
  const root = join(cacheRoot, 'snapshots');
  // A snapshot being saved has linked its files already, before its
  // manifest names them: those files are not left to be swept.
  if (existsSync(root))
    for (const name of readdirSync(root)) {
      const at = name.lastIndexOf('.tmp-');
      if (at < 0) continue;
      if (alive(Number(name.slice(at + '.tmp-'.length))))
        throw new Error(
          `Snapshot ${name.slice(0, at)} is being saved: collect once it is done.`,
        );
      rmSync(join(root, name), { recursive: true, force: true });
    }
  const all = listSnapshots(cacheRoot);
  const kept = all.filter(
    (manifest, index) =>
      index < options.keep || options.referenced.has(manifest.id),
  );
  const removed = all.filter((manifest) => !kept.includes(manifest));
  for (const manifest of removed)
    rmSync(snapshotPaths(manifest.id, root).dir, {
      recursive: true,
      force: true,
    });
  const held = new Set(
    kept.flatMap((manifest) => manifest.assets.map((asset) => asset.path)),
  );
  let files = 0;
  const visit = (dir: string, prefix: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(join(dir, entry.name), rel);
      else if (!held.has(rel)) {
        rmSync(join(dir, entry.name));
        files++;
      }
    }
  };
  visit(siteAssetsDir(cacheRoot), '');
  return {
    kept: kept.map((manifest) => manifest.id),
    removed: removed.map((manifest) => manifest.id),
    files,
  };
}

export interface RestoreOptions {
  manifest: SnapshotManifest;
  contentDir: string;
  cacheRoot?: string;
  /** The config the restored site gets, from the snapshot's. */
  config?: (snapshot: Record<string, unknown>) => Record<string, unknown>;
  /** Called with the new database before it is put in place. */
  beforeSwap?: (database: string) => void;
  link?: typeof linkSync;
  /** How a folder is renamed; tests stand in a failing one. */
  rename?: (from: string, to: string) => void;
}

/**
 * Folders an earlier restore left beside a site's content, by the mark the
 * restore gave them: `old`, what the content held while a snapshot was being
 * put in its place — perhaps all there is of it — and `gone`, what it held
 * once the snapshot stood there, left only to be removed.
 */
function leftBeside(target: string, mark: 'old' | 'gone') {
  const prefix = `${basename(target)}.${mark}-`;
  const dir = dirname(target);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => join(dir, name));
}

/**
 * Puts a snapshot in place of a site's content, whole: the new content is
 * built beside the old, the old is renamed aside, the new renamed into
 * place, and only then the old removed. A rename that fails puts the old
 * back; nothing ever stands half-deleted where the site reads its content.
 */
export function restoreSnapshot(options: RestoreOptions) {
  const cacheRoot = options.cacheRoot ?? cachePaths().root;
  const rename = options.rename ?? retryRename;
  const from = snapshotPaths(options.manifest.id, join(cacheRoot, 'snapshots'));
  const target = options.contentDir;
  // What an earlier restore set aside and never saw replaced may be the
  // only copy of the content: it is never removed here, only named.
  const aside = leftBeside(target, 'old');
  if (aside.length)
    throw new Error(
      `An earlier restore left ${aside[0]} beside ${target}. If ${basename(target)} holds what it should, remove ${basename(aside[0]!)}; ` +
        `if ${basename(aside[0]!)} does, move it back to ${basename(target)}. Then try again.`,
    );
  if (existsSync(target) && hasHotJournal(target))
    throw new Error(
      `${target} holds a thei.db-journal: a write never finished there. Start its server once and stop it, then try again.`,
    );
  for (const gone of leftBeside(target, 'gone')) removeLater(gone);

  const work = `${target}.tmp-${process.pid}`;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  let copied = 0;
  try {
    for (const file of THEI_BACKUP_FILES) {
      if (file !== CONFIG) {
        copyFileSync(join(from.dir, file), join(work, file));
        continue;
      }
      const snapshotConfig = readJson<Record<string, unknown>>(from.config);
      const config = options.config
        ? options.config(snapshotConfig)
        : snapshotConfig;
      writeFileSync(join(work, file), `${JSON.stringify(config, null, 2)}\n`);
    }
    for (const dir of copiedDirs())
      if (existsSync(join(from.dir, dir)))
        cpSync(join(from.dir, dir), join(work, dir), { recursive: true });
    const store = siteAssetsDir(cacheRoot);
    for (const asset of options.manifest.assets) {
      const blob = join(store, asset.path);
      if (!existsSync(blob))
        throw new Error(
          `The cache lost ${asset.path} of snapshot ${options.manifest.id}.`,
        );
      if (
        linkOrCopy(
          blob,
          join(work, THEI_CONTENT_DIRS.assets, asset.path),
          options.link,
        ) === 'copied'
      )
        copied++;
    }
    touchAssets(join(work, DATABASE));
    options.beforeSwap?.(join(work, DATABASE));
  } catch (error) {
    removeLater(work);
    throw error;
  }

  if (!existsSync(target)) {
    try {
      rename(work, target);
    } catch (error) {
      removeLater(work);
      throw error;
    }
    return { copied, files: options.manifest.assets.length };
  }
  const old = `${target}.old-${process.pid}`;
  try {
    rename(target, old);
  } catch (error) {
    removeLater(work);
    throw error;
  }
  try {
    rename(work, target);
  } catch (error) {
    try {
      rename(old, target);
    } catch {
      throw new Error(
        `${target} could not take the snapshot (${(error as Error).message.split('\n')[0]}), ` +
          `and what it held could not be put back: it is at ${old}, the snapshot at ${work}. Move ${basename(old)} back to ${basename(target)}.`,
      );
    }
    removeLater(work);
    throw error;
  }
  // The snapshot stands in place: what the content held is only to go.
  const gone = `${target}.gone-${process.pid}`;
  try {
    rename(old, gone);
    removeLater(gone);
  } catch {
    try {
      rmSync(old, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 250,
      });
    } catch (error) {
      console.warn(
        `! ${old} could not be removed (${(error as Error).message.split('\n')[0]}): ${basename(target)} holds the snapshot, so remove it by hand.`,
      );
    }
  }
  return { copied, files: options.manifest.assets.length };
}
