import { readdir, stat } from 'node:fs/promises';
import { join, posix, sep } from 'node:path';
import type { BackupManifestEntry } from '#layers/thei/shared/backup';
import {
  THEI_BACKUP_DIRS,
  THEI_BACKUP_FILES,
  THEI_REGENERABLE_DIRS,
  unclassifiedContentDirs,
} from '../content-layout';
import { backupWorkDir } from './state';

export type BackupManifest = {
  entries: BackupManifestEntry[];
  totalBytes: number;
  /** Entries in `content/` this version does not own and does not copy. */
  skipped: string[];
};

function toRelative(path: string, root: string): string {
  return path
    .slice(root.length + 1)
    .split(sep)
    .join(posix.sep);
}

async function walk(root: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const files: string[] = [];
  for (const entry of entries) {
    const full = `${directory}${sep}${entry.name}`;
    if (entry.isDirectory()) files.push(...(await walk(root, full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

/**
 * Everything a backup copies, and everything it deliberately does not.
 *
 * The two root files come from the session snapshot rather than from
 * `content/`: the live database is being written to, and a byte copy of it is
 * not a database. Everything else is walked from the directories the engine
 * declares it owns.
 *
 * Anything present but unowned is reported as skipped instead of copied. Such
 * a path is either left over from an experiment or a directory a future
 * release forgot to declare, and both are worth seeing rather than copying
 * blind — one of them could be a stray credential.
 */
export async function buildBackupManifest(
  sessionId: string,
): Promise<BackupManifest> {
  const root = THEI_SERVER.contentPath();
  const work = backupWorkDir(sessionId);
  const entries: BackupManifestEntry[] = [];

  for (const name of THEI_BACKUP_FILES) {
    const info = await stat(join(work, name)).catch(() => null);
    if (!info) continue;
    entries.push({
      path: name,
      size: info.size,
      mtime: Math.round(info.mtimeMs),
    });
  }

  const assetEntries: BackupManifestEntry[] = [];
  for (const directory of THEI_BACKUP_DIRS) {
    for (const file of await walk(root, THEI_SERVER.contentPath(directory))) {
      const info = await stat(file).catch(() => null);
      if (!info) continue;
      assetEntries.push({
        path: toRelative(file, root),
        size: info.size,
        mtime: Math.round(info.mtimeMs),
      });
    }
  }
  assetEntries.sort((left, right) => left.path.localeCompare(right.path));
  entries.push(...assetEntries);

  const known = new Set<string>([
    ...THEI_BACKUP_DIRS,
    ...THEI_REGENERABLE_DIRS,
    ...THEI_BACKUP_FILES,
  ]);
  const present = await readdir(root, { withFileTypes: true }).catch(() => []);
  const skipped = present
    .filter((entry) => !known.has(entry.name))
    .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
    .sort();

  const unclassified = unclassifiedContentDirs();
  if (unclassified.length) {
    THEI_SERVER.console
      .tag('Backup')
      .error(
        `Content directories are neither backed up nor regenerable: ${unclassified.join(', ')}`,
      );
  }

  return {
    entries,
    totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
    skipped: [...skipped, ...unclassified.map((name) => `${name}/`)],
  };
}

/**
 * Resolve a manifest path to a file on disk.
 *
 * Refuses anything that climbs out of `content/` or names a directory the
 * backup does not cover, so a manifest path from a client can never address
 * more than the backup itself would.
 */
export function resolveBackupFile(
  sessionId: string,
  relative: string,
): string | undefined {
  if (!relative || relative.includes('\0')) return undefined;
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    return undefined;
  }
  const [head] = parts;
  if (
    parts.length === 1 &&
    (THEI_BACKUP_FILES as readonly string[]).includes(head!)
  ) {
    return join(backupWorkDir(sessionId), head!);
  }
  if (parts.length > 1 && THEI_BACKUP_DIRS.includes(head as never)) {
    return THEI_SERVER.contentPath(...parts);
  }
  return undefined;
}
