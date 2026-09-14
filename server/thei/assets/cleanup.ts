import { readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { statSync } from 'node:fs';
import { findOrphanedAssets } from './repository/find-orphaned';
import { deleteStoredAsset } from './storage';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const GENERATED_MEDIA_MAX_AGE_MS = 30 * ONE_DAY_MS;

async function deleteOrphanedAsset(assetUuid: string, cutoffMs: number) {
  const deleted = await deleteStoredAsset(assetUuid, cutoffMs);
  if (!deleted) return;
  THEI_SERVER.console
    .tag('Assets')
    .log(`Cleaned up orphaned asset ${assetUuid}`);
}

export async function runAssetCleanup() {
  const cutoffMs = Date.now() - ONE_DAY_MS;
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

  await cleanupStrayAssetFiles(cutoffMs);
  await cleanupGeneratedMedia(Date.now() - GENERATED_MEDIA_MAX_AGE_MS);
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
  const owners = [
    ['asset', 'assets', 'assetUuid'],
    ['project', 'projects', 'projectUuid'],
    ['event', 'events', 'eventUuid'],
    ['page', 'pages', 'pageUuid'],
    ['tag', 'tags', 'tagUuid'],
    ['content', 'content', 'contentUuid'],
    ['profile', 'profiles', 'profileId'],
    ['profile-avatar', 'profile-avatars', 'id'],
    ['profile-status', 'profile-statuses', 'id'],
  ] as const;
  try {
    db.transaction(tx => {
      tx.delete(schema.assetUsages).where(sql`NOT EXISTS (SELECT 1 FROM assets WHERE assets.assetUuid="asset-usages".assetUuid)`).run();
      for (const [type, table, id] of owners) {
        tx.delete(schema.assetUsages).where(and(
          eq(schema.assetUsages.containerType, type),
          sql.raw('NOT EXISTS (SELECT 1 FROM "' + table + '" WHERE "' + table + '"."' + id + '"="asset-usages".containerId)'),
        )).run();
      }
    });
  } catch {
    THEI_SERVER.console.tag('Assets').error('Failed to clean dangling usages');
  }
}

async function cleanupMissingAssetFiles() {
  const { db, schema } = THEI_SERVER.useDb();
  let assets: {
    assetUuid: string;
    extension: string;
  }[];
  try {
    assets = await db
      .select({
        assetUuid: schema.assets.assetUuid,
        extension: schema.assets.extension,
      })
      .from(schema.assets);
  } catch {
    THEI_SERVER.console.tag('Assets').error('Failed to query stored assets');
    return;
  }

  for (const asset of assets) {
    const filePath = THEI_SERVER.assets.filePath(
      asset.assetUuid,
      asset.extension,
    );
    const missing = await stat(filePath).then(() => false, (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
    if (!missing) continue;

    try {
      if (!deleteAssetRecordAndUsages(asset.assetUuid, filePath)) continue;
      THEI_SERVER.console
        .tag('Assets')
        .error(`Removed asset record with missing file ${asset.assetUuid}`);
    } catch {
      THEI_SERVER.console
        .tag('Assets')
        .error(`Failed to remove asset with missing file ${asset.assetUuid}`);
    }
  }
}

async function cleanupStrayAssetFiles(cutoffMs: number) {
  const { db, schema } = THEI_SERVER.useDb();
  let expectedPaths: Set<string>;
  try {
    const assets = await db
      .select({
        assetUuid: schema.assets.assetUuid,
        extension: schema.assets.extension,
      })
      .from(schema.assets);
    expectedPaths = new Set(
      assets.map((asset) =>
        normalizePath(
          THEI_SERVER.assets.filePath(asset.assetUuid, asset.extension),
        ),
      ),
    );
  } catch {
    THEI_SERVER.console
      .tag('Assets')
      .error('Failed to query asset paths for stray cleanup');
    return;
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

function deleteAssetRecordAndUsages(assetUuid: string, filePath: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.transaction(tx => {
    // Only a confirmed missing file permits removal; access errors must preserve data.
    try { statSync(filePath); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false; }
    tx.delete(schema.assetUsages).where(eq(schema.assetUsages.assetUuid, assetUuid)).run();
    tx.delete(schema.assetUsages).where(and(
      eq(schema.assetUsages.containerType, 'asset'),
      eq(schema.assetUsages.containerId, assetUuid),
    )).run();
    tx.delete(schema.assets).where(eq(schema.assets.assetUuid, assetUuid)).run();
    return true;
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
