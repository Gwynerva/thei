// Where an archive is read from: the pinned release in the shared cache, a
// local checkout of the archive repository, or the conformance archive.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { archiveOverride, cachePaths, paths } from '../config';
import type { ArchiveLock, ArchiveRelease } from '../types';

export interface ArchiveSource {
  /** How messages name it. */
  label: string;
  kind: 'release' | 'checkout' | 'conformance';
  dir: string;
  /** Where a file's bytes are, or undefined when they are not here (yet). */
  mediaPath(id: string, ext: string): string | undefined;
  release?: ArchiveRelease;
}

export function readLock(): ArchiveLock | undefined {
  return existsSync(paths.lock)
    ? JSON.parse(readFileSync(paths.lock, 'utf8'))
    : undefined;
}

/**
 * A hash of the adapter's own code: a site seeded, or a snapshot saved, by
 * another version of it may hold what this one would write differently.
 */
export function adapterFingerprint(): string {
  const dir = join(paths.conformance, '..');
  const hash = createHash('sha256');
  const visit = (folder: string) => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (
        name.endsWith('.ts') &&
        !name.endsWith('.test.ts') &&
        !name.endsWith('.test-d.ts')
      )
        hash.update(name).update(readFileSync(path));
    }
  };
  visit(dir);
  return hash.digest('hex').slice(0, 16);
}

export function blobPath(sha256: string): string {
  return join(cachePaths().blobs, sha256.slice(0, 2), sha256);
}

/** The conformance archive's files, made by `conformance/media.ts`. */
export function conformanceMediaDir(): string {
  return join(cachePaths().root, 'conformance-media');
}

/**
 * `--archive conformance`, `--archive <dir>`, else `THEI_LAB_ARCHIVE`, else
 * the release the lock pins (fetched by `bun run lab fetch`).
 */
export function archiveSource(option?: string): ArchiveSource {
  if (option === 'conformance') {
    const media = conformanceMediaDir();
    return {
      label: 'the conformance archive',
      kind: 'conformance',
      dir: join(paths.conformance, 'archive'),
      mediaPath: (id, ext) => join(media, `${id}.${ext}`),
    };
  }
  const checkout = option ? resolve(option) : archiveOverride();
  if (checkout) {
    if (!existsSync(join(checkout, 'archive.yaml')))
      throw new Error(`${checkout} holds no archive.yaml`);
    return {
      label: checkout,
      kind: 'checkout',
      dir: checkout,
      mediaPath: (id, ext) => join(checkout, 'media', `${id}.${ext}`),
    };
  }
  const lock = readLock();
  if (!lock)
    throw new Error(
      'No archive release is pinned (tests/lab/archive.lock.json). Use --archive conformance, --archive <dir> or THEI_LAB_ARCHIVE.',
    );
  const root = join(cachePaths().archive, lock.version);
  const releasePath = join(root, 'release.json');
  if (!existsSync(releasePath))
    throw new Error(
      `Archive ${lock.version} is not fetched yet: bun run lab fetch`,
    );
  const release = JSON.parse(
    readFileSync(releasePath, 'utf8'),
  ) as ArchiveRelease;
  return {
    label: `release ${lock.version}`,
    kind: 'release',
    dir: join(root, 'text'),
    release,
    mediaPath: (id) => {
      const file = release.files[id];
      return file ? blobPath(file.sha256) : undefined;
    },
  };
}
