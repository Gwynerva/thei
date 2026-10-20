// Snapshots of a seeded site in the shared cache, and putting one in place.
//
// A snapshot is the database (a consistent copy), the config, the link
// favicons, and the list of the library's files. The files themselves live
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
import { dirname, join, relative } from 'node:path';
import { cachePaths, repoRoot } from '../config';
import type { SiteIndex, SnapshotManifest } from '../types';
import { copyDatabase, hasHotJournal, readLedger, touchAssets } from './sqlite';

export interface SnapshotPaths {
  dir: string;
  manifest: string;
  database: string;
  config: string;
  favicons: string;
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
    database: join(dir, 'thei.db'),
    config: join(dir, 'thei.config.json'),
    favicons: join(dir, 'external-link-favicons'),
    index: join(dir, 'site-index.json'),
  };
}

/** Where the library's files are kept once for every snapshot. */
export function siteAssetsDir(root = cachePaths().root) {
  return join(root, 'site-assets');
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

  copyDatabase(join(options.contentDir, 'thei.db'), join(work, 'thei.db'));
  copyFileSync(
    join(options.contentDir, 'thei.config.json'),
    join(work, 'thei.config.json'),
  );
  const favicons = join(options.contentDir, 'external-link-favicons');
  if (existsSync(favicons))
    cpSync(favicons, join(work, 'external-link-favicons'), { recursive: true });
  if (options.index)
    writeFileSync(
      join(work, 'site-index.json'),
      `${JSON.stringify(options.index, null, 2)}\n`,
    );

  const assetsRoot = join(options.contentDir, 'assets');
  const store = siteAssetsDir(cacheRoot);
  let copied = 0;
  const assets = filesUnder(assetsRoot).map((path) => {
    const rel = relative(assetsRoot, path).replaceAll('\\', '/');
    const blob = join(store, rel);
    if (!existsSync(blob) && linkOrCopy(path, blob, options.link) === 'copied')
      copied++;
    return { path: rel, sha256: '', bytes: statSync(path).size };
  });

  const config = JSON.parse(
    readFileSync(join(work, 'thei.config.json'), 'utf8'),
  );
  const manifest: SnapshotManifest = {
    id,
    createdAt: new Date().toISOString(),
    archive: archive ?? { conformance: true },
    adapter: options.index?.adapter ?? '',
    ledger: readLedger(join(work, 'thei.db')),
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

export function listSnapshots(
  cacheRoot = cachePaths().root,
): SnapshotManifest[] {
  const root = join(cacheRoot, 'snapshots');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter(
      (name) =>
        !name.includes('.tmp-') &&
        existsSync(join(root, name, 'manifest.json')),
    )
    .map(
      (name) =>
        JSON.parse(
          readFileSync(join(root, name, 'manifest.json'), 'utf8'),
        ) as SnapshotManifest,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Migrations of a snapshot this checkout does not know: it cannot run it. */
export function unknownMigrations(
  manifest: SnapshotManifest,
  known: readonly string[],
): string[] {
  const set = new Set(known);
  return manifest.ledger.filter((id) => !set.has(id));
}

export interface RestoreOptions {
  manifest: SnapshotManifest;
  contentDir: string;
  cacheRoot?: string;
  /** The config the restored site gets, from the snapshot's. */
  config?: (snapshot: Record<string, unknown>) => Record<string, unknown>;
  /** Called with the new database before it is put in place. */
  beforeSwap?: (database: string) => void;
  /** Where the content in place goes; removed when absent. */
  previousTo?: string;
  link?: typeof linkSync;
}

/**
 * Puts a snapshot in place of a site's content, whole: the new content is
 * built beside the old and renamed into place, never written file by file.
 */
export function restoreSnapshot(options: RestoreOptions) {
  const cacheRoot = options.cacheRoot ?? cachePaths().root;
  const from = snapshotPaths(options.manifest.id, join(cacheRoot, 'snapshots'));
  const target = options.contentDir;
  if (existsSync(target) && hasHotJournal(target))
    throw new Error(
      `${target} holds a thei.db-journal: a write never finished there. Start its server once and stop it, then try again.`,
    );
  const work = `${target}.tmp-${process.pid}`;
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  copyFileSync(from.database, join(work, 'thei.db'));
  const snapshotConfig = JSON.parse(readFileSync(from.config, 'utf8'));
  const config = options.config
    ? options.config(snapshotConfig)
    : snapshotConfig;
  writeFileSync(
    join(work, 'thei.config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  if (existsSync(from.favicons))
    cpSync(from.favicons, join(work, 'external-link-favicons'), {
      recursive: true,
    });
  const store = siteAssetsDir(cacheRoot);
  let copied = 0;
  for (const asset of options.manifest.assets) {
    const blob = join(store, asset.path);
    if (!existsSync(blob))
      throw new Error(
        `The cache lost ${asset.path} of snapshot ${options.manifest.id}.`,
      );
    if (
      linkOrCopy(blob, join(work, 'assets', asset.path), options.link) ===
      'copied'
    )
      copied++;
  }
  touchAssets(join(work, 'thei.db'));
  options.beforeSwap?.(join(work, 'thei.db'));
  if (existsSync(target)) {
    if (options.previousTo) {
      mkdirSync(dirname(options.previousTo), { recursive: true });
      retryRename(target, options.previousTo);
    } else
      rmSync(target, {
        recursive: true,
        force: true,
        maxRetries: 20,
        retryDelay: 250,
      });
  }
  retryRename(work, target);
  return { copied, files: options.manifest.assets.length };
}
