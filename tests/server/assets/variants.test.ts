import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssetType } from '../../../shared/asset';
import {
  createFileZipSettings,
  createOriginalAssetSettings,
} from '../../../shared/asset-upload-settings';
import { storeAsset, sha256 } from '../../../server/thei/assets/storage';
import { createAsset } from '../../../server/thei/assets/repository/create';
import { findAssetByIdentity } from '../../../server/thei/assets/repository/find-by-identity';
import { findAssetBySlug } from '../../../server/thei/assets/repository/find-by-slug';
import { findAssetByUuid } from '../../../server/thei/assets/repository/find-by-uuid';
import { touchAsset } from '../../../server/thei/assets/repository/touch';
import { countAssetPlacements } from '../../../server/thei/assets/repository/usage-count';
import { schema } from '../../../server/thei/db/schema';

describe('asset variants', () => {
  let root = '';
  let rawDb: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'thei-asset-variants-'));
    rawDb = new Database(':memory:');
    db = drizzle(rawDb, { schema });
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
      CREATE UNIQUE INDEX assets_family_content_settings_idx
        ON assets (familyUuid, contentHash, settingsKey);
      CREATE TABLE "asset-usages" (
        assetUuid text NOT NULL,
        containerType text NOT NULL,
        containerId text NOT NULL,
        role text NOT NULL,
        meta text,
        PRIMARY KEY(assetUuid, containerType, containerId, role)
      );
    `);

    const filePath = (assetUuid: string, extension: string) =>
      join(root, assetUuid.slice(2, 4), `${assetUuid}.${extension}`);
    (globalThis as any).THEI_SERVER = {
      useDb: () => ({ db, schema }),
      assets: {
        filePath,
        create: createAsset,
        findByIdentity: findAssetByIdentity,
        findByUuid: findAssetByUuid,
        findBySlug: findAssetBySlug,
        touch: touchAsset,
      },
    };
  });

  afterEach(async () => {
    rawDb.close();
    delete (globalThis as any).THEI_SERVER;
    await rm(root, { recursive: true, force: true });
  });

  it('hashes stored output and deduplicates only an exact family/settings match', async () => {
    const buffer = Buffer.from('processed output bytes');
    const original = createOriginalAssetSettings();
    const zipped = createFileZipSettings();
    const first = await storeAsset({
      buffer,
      extension: 'bin',
      familyUuid: 'family-1',
      settingsKey: 'v5:original',
      settingsVersion: 5,
      settings: original,
      type: AssetType.Other,
      meta: null,
    });
    const reused = await storeAsset({
      buffer,
      extension: 'bin',
      familyUuid: 'family-1',
      settingsKey: 'v5:original',
      settingsVersion: 5,
      settings: original,
      type: AssetType.Other,
      meta: null,
    });
    const otherPreset = await storeAsset({
      buffer,
      extension: 'zip',
      familyUuid: 'family-1',
      settingsKey: 'v5:file-zip',
      settingsVersion: 5,
      settings: zipped,
      type: AssetType.Other,
      meta: null,
    });
    const otherFamily = await storeAsset({
      buffer,
      extension: 'bin',
      familyUuid: 'family-2',
      settingsKey: 'v5:original',
      settingsVersion: 5,
      settings: original,
      type: AssetType.Other,
      meta: null,
    });

    expect(first.created).toBe(true);
    expect(first.asset.contentHash).toBe(sha256(buffer));
    expect(reused).toMatchObject({
      created: false,
      asset: { assetUuid: first.asset.assetUuid },
    });
    expect(otherPreset.asset.assetUuid).not.toBe(first.asset.assetUuid);
    expect(otherFamily.asset.assetUuid).not.toBe(first.asset.assetUuid);
    expect(
      await db.select().from(schema.assets),
    ).toHaveLength(3);
  });

  it('counts placements, not service preview links', async () => {
    await db.insert(schema.assetUsages).values([
      {
        assetUuid: 'a-usage',
        containerType: 'project',
        containerId: 'p-1',
        role: 'icon',
      },
      {
        assetUuid: 'a-usage',
        containerType: 'content',
        containerId: 'c-1',
        role: 'content',
        meta: {
          role: 'content',
          refs: [
            { blockType: 'contentMedia', isPrivate: false },
            { blockType: 'contentGallery', isPrivate: true },
          ],
          isPrivate: true,
        },
      },
      {
        assetUuid: 'a-usage',
        containerType: 'asset',
        containerId: 'a-video',
        role: 'preview',
        meta: { role: 'preview' },
      },
    ]);

    expect(await countAssetPlacements('a-usage')).toBe(3);
  });
});
