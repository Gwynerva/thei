import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
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
import {
  deleteStoredAsset,
  storeAsset,
  sha256,
} from '../../../server/thei/assets/storage';
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

    const filePath = (contentHash: string, extension: string) =>
      join(root, contentHash.slice(0, 2), `${contentHash}.${extension}`);
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
      bytes: { buffer },
      extension: 'bin',
      familyUuid: 'family-1',
      settingsKey: 'original',
      settings: original,
      type: AssetType.Other,
      meta: null,
    });
    const reused = await storeAsset({
      bytes: { buffer },
      extension: 'bin',
      familyUuid: 'family-1',
      settingsKey: 'original',
      settings: original,
      type: AssetType.Other,
      meta: null,
    });
    const otherPreset = await storeAsset({
      bytes: { buffer },
      extension: 'zip',
      familyUuid: 'family-1',
      settingsKey: 'file-zip',
      settings: zipped,
      type: AssetType.Other,
      meta: null,
    });
    const otherFamily = await storeAsset({
      bytes: { buffer },
      extension: 'bin',
      familyUuid: 'family-2',
      settingsKey: 'original',
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
    expect(await db.select().from(schema.assets)).toHaveLength(3);

    // Same bytes, same extension, different family: two logical rows sharing
    // one file. Writing the bytes twice is what used to leak 11% of the
    // library to byte-identical duplicates.
    expect(otherFamily.asset.contentHash).toBe(first.asset.contentHash);
    // One file per (bytes, extension): the .zip variant is genuinely a
    // different extension, so it is a second file, not a duplicate.
    const stored = await readdir(join(root, sha256(buffer).slice(0, 2)));
    expect(stored.sort()).toEqual([
      `${sha256(buffer)}.bin`,
      `${sha256(buffer)}.zip`,
    ]);
  });

  it('keeps a shared file until the last row referencing it is gone', async () => {
    const buffer = Buffer.from('shared bytes');
    const settings = createOriginalAssetSettings();
    const store = (familyUuid: string) =>
      storeAsset({
        bytes: { buffer },
        extension: 'bin',
        familyUuid,
        settingsKey: 'original',
        settings,
        type: AssetType.Other,
        meta: null,
      });

    const first = await store('family-a');
    const second = await store('family-b');
    const blobPath = join(
      root,
      sha256(buffer).slice(0, 2),
      `${sha256(buffer)}.bin`,
    );

    expect(await deleteStoredAsset(first.asset.assetUuid)).toBe(true);
    expect(await stat(blobPath).then(() => true)).toBe(true);

    expect(await deleteStoredAsset(second.asset.assetUuid)).toBe(true);
    expect(
      await stat(blobPath).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
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
