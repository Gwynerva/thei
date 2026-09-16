import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import sharp from 'sharp';
import { createAssetVariant } from '../../../server/thei/assets/create-variant';
import { createAsset } from '../../../server/thei/assets/repository/create';
import { findAssetByIdentity } from '../../../server/thei/assets/repository/find-by-identity';
import { findAssetBySlug } from '../../../server/thei/assets/repository/find-by-slug';
import { findAssetByUuid } from '../../../server/thei/assets/repository/find-by-uuid';
import { touchAsset } from '../../../server/thei/assets/repository/touch';
import { attachAssetUsage } from '../../../server/thei/assets/repository/usages/attach';
import { schema } from '../../../server/thei/db/schema';
import { AssetType } from '../../../shared/asset';
import {
  createImageTransformSettings,
  createOriginalAssetSettings,
} from '../../../shared/asset-upload-settings';

let root = '';
let rawDb: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-upload-pipeline-'));
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE assets (
      assetUuid text PRIMARY KEY NOT NULL,
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
  db = drizzle(rawDb, { schema });
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ db, schema }),
    projectPath: (...parts: string[]) => join(root, ...parts),
    assets: {
      filePath: (contentHash: string, extension: string) =>
        join(
          root,
          'assets',
          contentHash.slice(0, 2),
          `${contentHash}.${extension}`,
        ),
      create: createAsset,
      findByIdentity: findAssetByIdentity,
      findByUuid: findAssetByUuid,
      findBySlug: findAssetBySlug,
      touch: touchAsset,
      usages: {
        attach: attachAssetUsage,
        findByContainer: async (containerType: string, containerId: string) => {
          const rows = db
            .select()
            .from(schema.assetUsages)
            .all()
            .filter(
              (usage) =>
                usage.containerType === containerType &&
                usage.containerId === containerId,
            );
          return rows.map((usage) => ({
            ...usage,
            asset: db
              .select()
              .from(schema.assets)
              .all()
              .find((asset) => asset.assetUuid === usage.assetUuid),
          }));
        },
      },
    },
  };
});

afterEach(async () => {
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
  await rm(root, { recursive: true, force: true });
});

async function stagePng(width: number, height: number) {
  const bytes = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 90, b: 40 },
    },
  })
    .png()
    .toBuffer();
  const path = join(root, 'staged.png');
  await writeFile(path, bytes);
  return {
    path,
    size: bytes.length,
    hash: createHash('sha256').update(bytes).digest('hex'),
    extension: 'png',
    owned: true,
  };
}

describe('upload pipeline', () => {
  it('encodes a transformed image as AVIF and stores it by content hash', async () => {
    const source = await stagePng(1600, 900);
    const result = await createAssetVariant({
      source,
      familyUuid: `af-${source.hash}`,
      sourceType: AssetType.Image,
      settings: createImageTransformSettings(
        90,
        { width: 1200, height: 675 },
        { resizeMode: 'cover', allowUpscale: true },
      ),
    });

    expect(result.created).toBe(true);
    expect(result.extension).toBe('avif');
    expect(result.settingsKey).toBe(
      'image-transform:q90:w1200:h675:fit:cover:up:1:fmt:avif',
    );

    const stored = THEI_SERVER.assets.filePath(result.contentHash, 'avif');
    const bytes = await readFile(stored);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      result.contentHash,
    );
    expect((await sharp(bytes).metadata()).format).toBe('heif');
    // The staged upload is the caller's to clean up and was not consumed by a
    // transform, which produced its own output.
    expect((await stat(source.path)).size).toBe(source.size);
  });

  it('generates an AVIF preview and links it to its source', async () => {
    const source = await stagePng(1600, 900);
    const result = await createAssetVariant({
      source,
      familyUuid: `af-${source.hash}`,
      sourceType: AssetType.Image,
      settings: createImageTransformSettings(90, { width: 1200 }),
    });

    const preview = db
      .select()
      .from(schema.assetUsages)
      .all()
      .find((usage) => usage.role === 'preview');
    expect(preview?.containerId).toBe(result.assetUuid);

    const previewAsset = db
      .select()
      .from(schema.assets)
      .all()
      .find((asset) => asset.assetUuid === preview?.assetUuid);
    expect(previewAsset?.extension).toBe('avif');
    expect(previewAsset?.settingsKey).toBe('internal:media-preview');
    // The preview is a helper asset and must never be selectable from the
    // library, which is what a null settings column marks.
    expect(previewAsset?.settings).toBeNull();
  });

  it('stores an untransformed upload by moving the staged file', async () => {
    const source = await stagePng(64, 64);
    const result = await createAssetVariant({
      source,
      familyUuid: `af-${source.hash}`,
      sourceType: AssetType.Image,
      settings: createOriginalAssetSettings(),
    });

    expect(result.extension).toBe('png');
    expect(result.contentHash).toBe(source.hash);
    // Moved into the library rather than copied: no second read of the bytes.
    await expect(stat(source.path)).rejects.toThrow();
    expect(
      (await stat(THEI_SERVER.assets.filePath(source.hash, 'png'))).size,
    ).toBe(source.size);
  });

  it('keeps small images on WebP, where AVIF would be larger', async () => {
    const source = await stagePng(256, 256);
    const result = await createAssetVariant({
      source,
      familyUuid: `af-${source.hash}`,
      sourceType: AssetType.Image,
      settings: createImageTransformSettings(90, { width: 48, height: 48 }),
    });

    expect(result.extension).toBe('webp');
    expect(result.settingsKey).toContain(':fmt:webp');
  });
});
