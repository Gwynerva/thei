import { readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { statSync } from 'node:fs';
import {
  ASSET_CONTAINER_TYPES,
  type AssetContainerType,
} from '#layers/thei/shared/asset';
import { ASSET_ORPHAN_GRACE_MS } from '#layers/thei/shared/asset-library';
import { backupSessionOpen } from '../backup/session';
import { findOrphanedAssets } from './repository/find-orphaned';
import { deleteStoredAsset } from './storage';
import { sweepTheiTempDir } from './temp';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const GENERATED_MEDIA_MAX_AGE_MS = 30 * ONE_DAY_MS;

/**
 * Rows pulled per query when walking the whole library.
 *
 * A resume site is not expected to pass a few tens of thousands of assets, but
 * one query per batch keeps peak memory flat regardless, instead of holding
 * every row and every expected path at once.
 */
const SCAN_BATCH_SIZE = 1000;

async function deleteOrphanedAsset(assetUuid: string, cutoffMs: number) {
  const deleted = await deleteStoredAsset(assetUuid, cutoffMs);
  if (!deleted) return;
  THEI_SERVER.console
    .tag('Assets')
    .log(`Cleaned up orphaned asset ${assetUuid}`);
}

export interface AssetCleanupOptions {
  /**
   * Whether to walk `content/assets` looking for files no row points at.
   *
   * The walk is the only part of cleanup whose cost scales with the size of
   * the library rather than with the amount of garbage in it, so it runs on a
   * slower cadence than the SQL phases.
   */
  sweepFiles?: boolean;
}

/**
 * A sweep already in flight.
 *
 * The daily and weekly timers are independent, and a full sweep can outlast
 * the gap between them on a large library. Two of them walking `content/assets`
 * at once would double the IO for no extra reclaim.
 */
let running = false;

export async function runAssetCleanup(options: AssetCleanupOptions = {}) {
  if (running) {
    THEI_SERVER.console.tag('Assets').log('Cleanup already running; skipped');
    return;
  }
  running = true;
  try {
    await runAssetCleanupOnce(options);
  } finally {
    running = false;
  }
}

async function runAssetCleanupOnce(options: AssetCleanupOptions) {
  const cutoffMs = Date.now() - ASSET_ORPHAN_GRACE_MS;
  await cleanupDanglingUsages();
  await cleanupMissingAssetFiles();

  let orphans: Awaited<ReturnType<typeof findOrphanedAssets>>;
  try {
    orphans = await findOrphanedAssets(cutoffMs);
  } catch {
    THEI_SERVER.console.tag('Assets').error('Failed to query orphaned assets');
    return;
  }

  for (const asset of orphans) {
    try {
      await deleteOrphanedAsset(asset.assetUuid, cutoffMs);
    } catch {
      THEI_SERVER.console
        .tag('Assets')
        .error(`Failed to clean orphaned asset ${asset.assetUuid}`);
    }
  }

  await sweepTemp();

  if (options.sweepFiles !== false) {
    // The file sweep is the half whose cost scales with the library, and a
    // backup is already reading every one of those files. Deferring it costs
    // nothing: everything it would reclaim has waited 24 hours already and can
    // wait for the next run.
    if (backupSessionOpen()) {
      THEI_SERVER.console
        .tag('Assets')
        .log('Backup in progress; deferred the file sweep');
      return;
    }
    await cleanupStrayAssetFiles(cutoffMs);
    await cleanupGeneratedMedia(Date.now() - GENERATED_MEDIA_MAX_AGE_MS);
  }
}

async function sweepTemp() {
  try {
    const removed = await sweepTheiTempDir();
    if (removed) {
      THEI_SERVER.console
        .tag('Assets')
        .log(`Cleaned up ${removed} abandoned temporary file(s)`);
    }
  } catch {
    THEI_SERVER.console.tag('Assets').error('Failed to sweep temporary files');
  }
}

async function cleanupGeneratedMedia(cutoffMs: number) {
  const files = await listFiles(THEI_SERVER.contentPath('generated-media'));
  for (const file of files) {
    const fileStat = await stat(file).catch(() => null);
    if (!fileStat || fileStat.mtimeMs >= cutoffMs) continue;
    await rm(file, { force: true }).catch(() => {});
  }
}

async function cleanupDanglingUsages() {
  const { db, schema } = THEI_SERVER.useDb();
  // Test ownership in the DELETE itself, never against an earlier snapshot.
  const owners: {
    [Type in AssetContainerType]: readonly [Type, string, string];
  }[AssetContainerType][] = [
    ['asset', 'assets', 'assetUuid'],
    ['project', 'projects', 'projectUuid'],
    ['event', 'events', 'eventUuid'],
    ['page', 'pages', 'pageUuid'],
    ['diary-entry', 'diary-entries', 'diaryUuid'],
    ['tag', 'tags', 'tagUuid'],
    ['content', 'content', 'contentUuid'],
    ['profile', 'profiles', 'profileId'],
    ['profile-avatar', 'profile-avatars', 'id'],
    ['profile-status', 'statuses', 'id'],
    ['project-status', 'statuses', 'id'],
  ];

  // Every container type must have an owner table here. Without this, adding a
  // container type silently starts accumulating usages nothing ever reclaims.
  const covered = new Set(owners.map(([type]) => type));
  const uncovered = ASSET_CONTAINER_TYPES.filter((type) => !covered.has(type));
  if (uncovered.length) {
    THEI_SERVER.console
      .tag('Assets')
      .error(`No owner table for container type(s): ${uncovered.join(', ')}`);
  }
  try {
    db.transaction((tx) => {
      tx.delete(schema.assetUsages)
        .where(
          sql`NOT EXISTS (SELECT 1 FROM assets WHERE assets.assetUuid="asset-usages".assetUuid)`,
        )
        .run();
      for (const [type, table, id] of owners) {
        tx.delete(schema.assetUsages)
          .where(
            and(
              eq(schema.assetUsages.containerType, type),
              sql.raw(
                'NOT EXISTS (SELECT 1 FROM "' +
                  table +
                  '" WHERE "' +
                  table +
                  '"."' +
                  id +
                  '"="asset-usages".containerId)',
              ),
            ),
          )
          .run();
      }
    });
  } catch {
    THEI_SERVER.console.tag('Assets').error('Failed to clean dangling usages');
  }
}

async function cleanupMissingAssetFiles() {
  for await (const batch of scanBlobs()) {
    for (const blob of batch) {
      const filePath = THEI_SERVER.assets.filePath(
        blob.contentHash,
        blob.extension,
      );
      const missing = await stat(filePath).then(
        () => false,
        (error: NodeJS.ErrnoException) => error.code === 'ENOENT',
      );
      if (!missing) continue;

      try {
        const removed = deleteAssetRecordsAndUsages(blob, filePath);
        if (!removed) continue;
        THEI_SERVER.console
          .tag('Assets')
          .error(
            `Removed ${removed} asset record(s) with missing file ${filePath}`,
          );
      } catch {
        THEI_SERVER.console
          .tag('Assets')
          .error(`Failed to remove assets with missing file ${filePath}`);
      }
    }
  }
}

/** Yields every distinct stored file in batches, newest query per batch. */
async function* scanBlobs() {
  const { db, schema } = THEI_SERVER.useDb();
  for (let offset = 0; ; offset += SCAN_BATCH_SIZE) {
    let batch: { contentHash: string; extension: string }[];
    try {
      batch = await db
        .selectDistinct({
          contentHash: schema.assets.contentHash,
          extension: schema.assets.extension,
        })
        .from(schema.assets)
        .orderBy(schema.assets.contentHash, schema.assets.extension)
        .limit(SCAN_BATCH_SIZE)
        .offset(offset);
    } catch {
      THEI_SERVER.console.tag('Assets').error('Failed to query stored assets');
      return;
    }
    if (!batch.length) return;
    yield batch;
    if (batch.length < SCAN_BATCH_SIZE) return;
  }
}

async function cleanupStrayAssetFiles(cutoffMs: number) {
  // The expected set has to be complete before a single file is judged: a
  // path missing from it would be deleted as stray.
  const expectedPaths = new Set<string>();
  for await (const batch of scanBlobs()) {
    for (const blob of batch) {
      expectedPaths.add(
        normalizePath(
          THEI_SERVER.assets.filePath(blob.contentHash, blob.extension),
        ),
      );
    }
  }

  const files = await listFiles(THEI_SERVER.contentPath('assets'));
  for (const file of files) {
    if (expectedPaths.has(normalizePath(file))) continue;

    const fileStat = await stat(file).catch(() => null);
    if (!fileStat || fileStat.mtimeMs >= cutoffMs) continue;

    await rm(file, { force: true }).catch(() => {});
    THEI_SERVER.console.tag('Assets').log(`Cleaned up stray file ${file}`);
  }
}

function deleteAssetRecordsAndUsages(
  blob: { contentHash: string; extension: string },
  filePath: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.transaction((tx) => {
    // Only a confirmed missing file permits removal; access errors must preserve data.
    try {
      statSync(filePath);
      return 0;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return 0;
    }

    const rows = tx
      .select({ assetUuid: schema.assets.assetUuid })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.contentHash, blob.contentHash),
          eq(schema.assets.extension, blob.extension),
        ),
      )
      .all();

    for (const row of rows) {
      tx.delete(schema.assetUsages)
        .where(eq(schema.assetUsages.assetUuid, row.assetUuid))
        .run();
      tx.delete(schema.assetUsages)
        .where(
          and(
            eq(schema.assetUsages.containerType, 'asset'),
            eq(schema.assetUsages.containerId, row.assetUuid),
          ),
        )
        .run();
      tx.delete(schema.assets)
        .where(eq(schema.assets.assetUuid, row.assetUuid))
        .run();
    }

    return rows.length;
  });
}

async function listFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(
    () => [],
  );
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = `${dirPath}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizePath(filePath: string): string {
  return resolve(filePath).toLowerCase();
}
