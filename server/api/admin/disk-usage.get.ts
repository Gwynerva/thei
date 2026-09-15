import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { normalizeAdminDiskUsage } from '#layers/thei/shared/admin/disk-usage';
import { THEI_CONTENT_DIRS } from '../../thei/content-layout';

const THEI_SIZE_CACHE_MS = 30_000;
let cachedTheiSize: { value: number; expiresAt: number } | undefined;
let pendingTheiSize: Promise<number> | undefined;

/**
 * Size of the asset library, taken from the database rather than the disk.
 *
 * Every stored file has a row recording its size, and rows sharing a content
 * hash share one file, so summing distinct blobs is exact. Walking the tree
 * instead meant one `lstat` per file on every dashboard poll, which is the one
 * request whose cost grew with the size of the library.
 */
function assetLibrarySize(): number {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({
      total: sql<number>`coalesce(sum(${schema.assets.size}), 0)`,
    })
    .from(
      db
        .selectDistinct({
          contentHash: schema.assets.contentHash,
          extension: schema.assets.extension,
          size: schema.assets.size,
        })
        .from(schema.assets)
        .as('blobs'),
    )
    .get();
  return row?.total ?? 0;
}

/** The small regenerable caches, plus the database file itself. */
async function auxiliarySize(): Promise<number> {
  const paths = [
    THEI_SERVER.contentPath('thei.db'),
    THEI_SERVER.contentPath(THEI_CONTENT_DIRS.generatedMedia),
    THEI_SERVER.contentPath(THEI_CONTENT_DIRS.externalLinkFavicons),
  ];
  const sizes = await Promise.all(paths.map((path) => pathSize(path)));
  return sizes.reduce((total, size) => total + size, 0);
}

async function pathSize(path: string): Promise<number> {
  const entry = await stat(path).catch(() => null);
  if (!entry) return 0;
  if (entry.isFile()) return entry.size;
  if (!entry.isDirectory()) return 0;

  const names = await readdir(path).catch(() => []);
  const sizes = await Promise.all(
    names.map((name) => pathSize(join(path, name))),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

function getTheiSize(): Promise<number> {
  const now = Date.now();
  if (cachedTheiSize && cachedTheiSize.expiresAt > now) {
    return Promise.resolve(cachedTheiSize.value);
  }
  if (pendingTheiSize) return pendingTheiSize;

  pendingTheiSize = auxiliarySize()
    .then((auxiliary) => {
      const value = assetLibrarySize() + auxiliary;
      cachedTheiSize = { value, expiresAt: Date.now() + THEI_SIZE_CACHE_MS };
      return value;
    })
    .finally(() => {
      pendingTheiSize = undefined;
    });

  return pendingTheiSize;
}

export default defineEventHandler(async () => {
  const [fileSystem, theiSize] = await Promise.all([
    statfs(THEI_SERVER.projectPath()),
    getTheiSize(),
  ]);

  return normalizeAdminDiskUsage(
    fileSystem.blocks * fileSystem.bsize,
    fileSystem.bavail * fileSystem.bsize,
    theiSize,
  );
});
