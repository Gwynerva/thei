import { readdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { findOrphanedAssets } from './repository/find-orphaned';
import { deleteAsset } from './repository/delete';
import { deleteStoredAsset } from './storage';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const GENERATED_MEDIA_MAX_AGE_MS = 30 * ONE_DAY_MS;

async function deleteOrphanedAsset(assetUuid: string) {
  const deleted = await deleteStoredAsset(assetUuid);
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
      await deleteOrphanedAsset(asset.assetUuid);
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
  try {
    const danglingAssetRefs = await db
      .select({
        assetUuid: schema.assetUsages.assetUuid,
        containerType: schema.assetUsages.containerType,
        containerId: schema.assetUsages.containerId,
        role: schema.assetUsages.role,
      })
      .from(schema.assetUsages)
      .leftJoin(
        schema.assets,
        eq(schema.assetUsages.assetUuid, schema.assets.assetUuid),
      )
      .where(isNull(schema.assets.assetUuid));

    for (const usage of danglingAssetRefs) {
      await deleteUsage(usage);
    }

    const [assetRows, projectRows, eventRows, contentRows, usages] =
      await Promise.all([
        db.select({ assetUuid: schema.assets.assetUuid }).from(schema.assets),
        db
          .select({ projectUuid: schema.projects.projectUuid })
          .from(schema.projects),
        db.select({ eventUuid: schema.events.eventUuid }).from(schema.events),
        db
          .select({ contentUuid: schema.content.contentUuid })
          .from(schema.content),
        db.select().from(schema.assetUsages),
      ]);
    const assetUuids = new Set(assetRows.map((row) => row.assetUuid));
    const projectUuids = new Set(projectRows.map((row) => row.projectUuid));
    const eventIds = new Set(eventRows.map((row) => row.eventUuid));
    const contentUuids = new Set(contentRows.map((row) => row.contentUuid));

    for (const usage of usages) {
      if (
        (usage.containerType === 'asset' &&
          !assetUuids.has(usage.containerId)) ||
        (usage.containerType === 'project' &&
          !projectUuids.has(usage.containerId)) ||
        (usage.containerType === 'event' && !eventIds.has(usage.containerId)) ||
        (usage.containerType === 'content' &&
          !contentUuids.has(usage.containerId))
      ) {
        await deleteUsage(usage);
      }
    }
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
    const fileStat = await stat(filePath).catch(() => null);
    if (fileStat) continue;

    try {
      await deleteAssetRecordAndUsages(asset.assetUuid);
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

async function deleteAssetRecordAndUsages(assetUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  await db
    .delete(schema.assetUsages)
    .where(eq(schema.assetUsages.assetUuid, assetUuid));
  await db
    .delete(schema.assetUsages)
    .where(
      and(
        eq(schema.assetUsages.containerType, 'asset'),
        eq(schema.assetUsages.containerId, assetUuid),
      ),
    );
  await deleteAsset(assetUuid);
}

async function deleteUsage(usage: {
  assetUuid: string;
  containerType: string;
  containerId: string;
  role: string;
}) {
  const { db, schema } = THEI_SERVER.useDb();
  await db
    .delete(schema.assetUsages)
    .where(
      and(
        eq(schema.assetUsages.assetUuid, usage.assetUuid),
        eq(schema.assetUsages.containerType, usage.containerType as any),
        eq(schema.assetUsages.containerId, usage.containerId),
        eq(schema.assetUsages.role, usage.role as any),
      ),
    );
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
