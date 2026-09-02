import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { AssetType } from '../../../shared/asset';
import { runAssetCleanup } from '../../../server/thei/assets/cleanup';
import { schema } from '../../../server/thei/db/schema';

describe('asset cleanup', () => {
  it('cleans DB orphans, dangling usages, missing files, and old stray files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'thei-assets-cleanup-'));
    const rawDb = new Database(':memory:');
    const db = drizzle(rawDb, { schema });
    const now = Date.now();
    const old = now - 2 * 24 * 60 * 60 * 1000;

    try {
      rawDb.exec(`
        CREATE TABLE assets (
          assetUuid text PRIMARY KEY,
          slug text NOT NULL UNIQUE,
          extension text NOT NULL,
          familyUuid text NOT NULL,
          contentHash text NOT NULL,
          settingsKey text NOT NULL,
          settingsVersion integer NOT NULL,
          settings text,
          type text NOT NULL,
          size integer NOT NULL,
          touchedAt integer NOT NULL,
          meta text
        );
        CREATE TABLE "asset-usages" (
          assetUuid text NOT NULL,
          containerType text NOT NULL,
          containerId text NOT NULL,
          role text NOT NULL,
          meta text,
          PRIMARY KEY(assetUuid, containerType, containerId, role)
        );
        CREATE TABLE projects (
          projectUuid text PRIMARY KEY,
          title text NOT NULL,
          summary text NOT NULL,
          access text NOT NULL,
          humanReadableSlug text NOT NULL,
          publicId text NOT NULL UNIQUE,
          showcase integer NOT NULL DEFAULT false,
          cv integer NOT NULL DEFAULT false,
          action text,
          createdAt integer NOT NULL,
          updatedAt integer NOT NULL
        );
        CREATE TABLE events (
          eventUuid text PRIMARY KEY,
          title text NOT NULL,
          summary text NOT NULL,
          access text NOT NULL,
          humanReadableSlug text NOT NULL,
          publicId text NOT NULL UNIQUE,
          action text,
          createdAt integer NOT NULL,
          updatedAt integer NOT NULL
        );
        CREATE TABLE pages (
          pageUuid text PRIMARY KEY,
          slug text NOT NULL UNIQUE,
          title text NOT NULL,
          summary text NOT NULL,
          access text NOT NULL,
          createdAt integer NOT NULL,
          updatedAt integer NOT NULL
        );
        CREATE TABLE content (
          contentUuid text PRIMARY KEY,
          ownerType text NOT NULL,
          ownerId text NOT NULL,
          slot text NOT NULL,
          data text NOT NULL,
          blockCount integer NOT NULL DEFAULT 0,
          assetCount integer NOT NULL DEFAULT 0,
          assetTotalSize integer NOT NULL DEFAULT 0,
          createdAt integer NOT NULL,
          updatedAt integer NOT NULL
        );
      `);

      const filePath = (assetUuid: string, extension: string) =>
        join(
          root,
          'assets',
          assetUuid.slice(2, 4),
          `${assetUuid}.${extension}`,
        );
      const writeAssetFile = async (assetUuid: string, extension: string) => {
        const path = filePath(assetUuid, extension);
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, 'asset');
        return path;
      };

      (globalThis as any).THEI_SERVER = {
        useDb: () => ({ db, schema }),
        contentPath: (...parts: string[]) => join(root, ...parts),
        assets: {
          filePath,
          findByUuid: async (assetUuid: string) =>
            await db.query.assets.findFirst({
              where: eq(schema.assets.assetUuid, assetUuid),
            }),
          delete: async (assetUuid: string) => {
            await db
              .delete(schema.assets)
              .where(eq(schema.assets.assetUuid, assetUuid));
          },
          usages: {
            findByContainer: async () => [],
            detach: async () => {},
          },
        },
        console: {
          tag: () => ({
            log: () => {},
            error: () => {},
          }),
        },
      };

      await db.insert(schema.projects).values({
        projectUuid: 'p-live',
        title: 'Project',
        summary: 'Summary',
        access: 'public' as any,
        humanReadableSlug: 'project',
        publicId: 'project',
        showcase: false,
        cv: false,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.events).values({
        eventUuid: 'e-live',
        title: 'Event',
        summary: 'Summary',
        access: 'public' as any,
        humanReadableSlug: 'event',
        publicId: 'event',
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(schema.pages).values({
        pageUuid: 'pg-live',
        slug: 'page',
        title: 'Page',
        summary: 'Summary',
        access: 'public' as any,
        createdAt: now,
        updatedAt: now,
      });

      await insertAsset(db, 'a-live', 'webp', now);
      await insertAsset(db, 'a-content', 'webp', old);
      await insertAsset(db, 'a-missing', 'webp', now);
      await insertAsset(db, 'a-orphan', 'webp', old);

      const liveFile = await writeAssetFile('a-live', 'webp');
      const contentFile = await writeAssetFile('a-content', 'webp');
      const orphanFile = await writeAssetFile('a-orphan', 'webp');
      const strayFile = await writeAssetFile('a-stray', 'webp');
      await utimes(strayFile, new Date(old), new Date(old));

      await db.insert(schema.content).values({
        contentUuid: 'c-live',
        ownerType: 'project',
        ownerId: 'p-live',
        slot: 'project-description',
        data: { blocks: [] },
        blockCount: 0,
        assetCount: 0,
        assetTotalSize: 0,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(schema.assetUsages).values([
        {
          assetUuid: 'a-live',
          containerType: 'project',
          containerId: 'p-live',
          role: 'icon',
        },
        {
          assetUuid: 'a-missing',
          containerType: 'project',
          containerId: 'p-live',
          role: 'banner',
        },
        {
          assetUuid: 'a-gone',
          containerType: 'project',
          containerId: 'p-live',
          role: 'showcase-asset',
        },
        {
          assetUuid: 'a-content',
          containerType: 'content',
          containerId: 'c-live',
          role: 'content',
        },
        {
          assetUuid: 'a-live',
          containerType: 'event',
          containerId: 'e-live',
          role: 'banner',
        },
        {
          assetUuid: 'a-live',
          containerType: 'page',
          containerId: 'pg-live',
          role: 'icon',
        },
        {
          assetUuid: 'a-live',
          containerType: 'event',
          containerId: 'e-gone',
          role: 'icon',
        },
        {
          assetUuid: 'a-live',
          containerType: 'content',
          containerId: 'c-gone',
          role: 'content',
        },
      ]);

      await runAssetCleanup();

      expect(await fileExists(liveFile)).toBe(true);
      expect(await fileExists(contentFile)).toBe(true);
      expect(await fileExists(orphanFile)).toBe(false);
      expect(await fileExists(strayFile)).toBe(false);

      const remainingAssets = await db
        .select({ assetUuid: schema.assets.assetUuid })
        .from(schema.assets);
      expect(remainingAssets.map((asset) => asset.assetUuid).sort()).toEqual([
        'a-content',
        'a-live',
      ]);

      const remainingUsages = await db.select().from(schema.assetUsages);
      expect(remainingUsages).toHaveLength(4);
      expect(remainingUsages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetUuid: 'a-live',
            containerType: 'project',
            containerId: 'p-live',
            role: 'icon',
          }),
          expect.objectContaining({
            assetUuid: 'a-content',
            containerType: 'content',
            containerId: 'c-live',
            role: 'content',
          }),
          expect.objectContaining({
            assetUuid: 'a-live',
            containerType: 'event',
            containerId: 'e-live',
            role: 'banner',
          }),
          expect.objectContaining({
            assetUuid: 'a-live',
            containerType: 'page',
            containerId: 'pg-live',
            role: 'icon',
          }),
        ]),
      );

      expect(
        await db.query.assets.findFirst({
          where: eq(schema.assets.assetUuid, 'a-missing'),
        }),
      ).toBeUndefined();
    } finally {
      rawDb.close();
      delete (globalThis as any).THEI_SERVER;
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function insertAsset(
  db: ReturnType<typeof drizzle<typeof schema>>,
  assetUuid: string,
  extension: string,
  touchedAt: number,
) {
  await db.insert(schema.assets).values({
    assetUuid,
    slug: assetUuid,
    extension,
    familyUuid: `family-${assetUuid}`,
    contentHash: `content-${assetUuid}`,
    settingsKey: 'v5:original',
    settingsVersion: 5,
    settings: { version: 5, type: 'original' },
    type: AssetType.Image,
    size: 5,
    touchedAt,
    meta: null,
  });
}

async function fileExists(path: string): Promise<boolean> {
  return await readFile(path)
    .then(() => true)
    .catch(() => false);
}
