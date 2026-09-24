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
import { createOriginalAssetSettings } from '../../../shared/asset-upload-settings';

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
      settings: {
        type: 'image-transform',
        quality: 90,
        dimensions: { width: 1200, height: 675 },
      },
    });

    expect(result.created).toBe(true);
    expect(result.extension).toBe('avif');
    expect(result.settingsKey).toBe('image-transform:q90:w1200:h675:fmt:avif');

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
      settings: {
        type: 'image-transform',
        quality: 90,
        dimensions: { width: 1200 },
      },
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
      settings: {
        type: 'image-transform',
        quality: 90,
        dimensions: { width: 48, height: 48 },
      },
    });

    expect(result.extension).toBe('webp');
    expect(result.settingsKey).toContain(':fmt:webp');
  });

  it('writes the cropped region at the exact requested size', async () => {
    const source = await stagePng(1600, 900);
    const result = await createAssetVariant({
      source,
      familyUuid: `af-${source.hash}`,
      sourceType: AssetType.Image,
      settings: {
        type: 'image-transform',
        quality: 90,
        crop: { left: 350, top: 0, width: 900, height: 900 },
        dimensions: { width: 256, height: 256 },
      },
    });

    expect(result.settingsKey).toBe(
      'image-transform:q90:w256:h256:crop:350,0,900,900:fmt:avif',
    );
    expect(result.meta).toMatchObject({ width: 256, height: 256 });
  });

  it('keeps every pixel of a lossless WebP', async () => {
    // A flat graphic with hard edges: exactly what lossy encoders blur.
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 16,
              height: 64,
              channels: 3,
              background: '#d01010',
            },
          })
            .png()
            .toBuffer(),
          left: 24,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    const path = join(root, 'logo.png');
    await writeFile(path, png);
    const hash = createHash('sha256').update(png).digest('hex');

    const result = await createAssetVariant({
      source: { path, size: png.length, hash, extension: 'png', owned: true },
      familyUuid: `af-${hash}`,
      sourceType: AssetType.Image,
      settings: {
        type: 'image-transform',
        quality: 50,
        format: 'webp-lossless',
        dimensions: {},
      },
    });

    expect(result.extension).toBe('webp');
    expect(result.settingsKey).toBe(
      'image-transform:q100:w64:h64:fmt:webp-lossless',
    );
    const stored = await readFile(
      THEI_SERVER.assets.filePath(result.contentHash, result.extension),
    );
    const [expected, actual] = await Promise.all(
      [png, stored].map((bytes) => sharp(bytes).removeAlpha().raw().toBuffer()),
    );
    expect(actual.equals(expected!)).toBe(true);
  });

  it('draws a small SVG at the size asked for, with crisp edges', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">' +
        '<rect width="24" height="24" fill="#fff"/>' +
        '<rect width="12" height="24" fill="#000"/></svg>',
    );
    const path = join(root, 'logo.svg');
    await writeFile(path, svg);
    const hash = createHash('sha256').update(svg).digest('hex');

    const result = await createAssetVariant({
      source: { path, size: svg.length, hash, extension: 'svg', owned: true },
      familyUuid: `af-${hash}`,
      sourceType: AssetType.Image,
      settings: {
        type: 'image-transform',
        quality: 90,
        format: 'webp-lossless',
        crop: { left: 6, top: 0, width: 12, height: 12 },
        dimensions: { width: 512, height: 512 },
      },
    });

    expect(result.meta).toMatchObject({ width: 512, height: 512 });
    const { data, info } = await sharp(
      await readFile(
        THEI_SERVER.assets.filePath(result.contentHash, result.extension),
      ),
    )
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const row = data.subarray(
      256 * info.width * info.channels,
      257 * info.width * info.channels,
    );
    // The crop is centred on the edge: black on the left half, white on the
    // right. Drawn at 72 dpi and enlarged, the edge would blur over ~20 px.
    const grey = [...row].filter((value) => value > 30 && value < 225);
    expect(row[0]).toBeLessThan(30);
    expect(row[row.length - 1]).toBeGreaterThan(225);
    expect(grey.length).toBeLessThanOrEqual(4);
  });

  it('never enlarges a source smaller than the requested size', async () => {
    const source = await stagePng(100, 100);
    const result = await createAssetVariant({
      source,
      familyUuid: `af-${source.hash}`,
      sourceType: AssetType.Image,
      settings: {
        type: 'image-transform',
        quality: 90,
        dimensions: { width: 256, height: 256 },
      },
    });

    expect(result.meta).toMatchObject({ width: 100, height: 100 });
    expect(result.settingsKey).toContain(':w100:h100:');
  });

  it('turns a photo after its own orientation, then crops the turned frame', async () => {
    // Displayed as a 200x400 portrait, red on top and blue below; a quarter
    // turn clockwise lays it down with the red on the right.
    const stored = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#0000ff' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 200,
              height: 200,
              channels: 3,
              background: '#ff0000',
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .jpeg({ quality: 100 })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const path = join(root, 'turned.jpg');
    await writeFile(path, stored);
    const hash = createHash('sha256').update(stored).digest('hex');

    const result = await createAssetVariant({
      source: {
        path,
        size: stored.length,
        hash,
        extension: 'jpg',
        owned: true,
      },
      familyUuid: `af-${hash}`,
      sourceType: AssetType.Image,
      settings: {
        type: 'image-transform',
        quality: 100,
        format: 'webp',
        rotation: 90,
        crop: { left: 0, top: 0, width: 180, height: 200 },
        dimensions: { width: 180, height: 200 },
      },
    });

    expect(result.settingsKey).toBe(
      'image-transform:q100:w180:h200:rot:90:crop:0,0,180,200:fmt:webp',
    );
    expect(result.meta).toMatchObject({
      width: 180,
      height: 200,
      sourceDimensions: { width: 200, height: 400 },
    });
    const bytes = await readFile(
      THEI_SERVER.assets.filePath(result.contentHash, result.extension),
    );
    const { dominant } = await sharp(bytes).stats();
    expect(dominant.b).toBeGreaterThan(200);
    expect(dominant.r).toBeLessThan(60);
  });

  it('crops an EXIF-rotated photo where the editor showed it', async () => {
    // Landscape pixels, orientation 6: displayed as a 200x400 portrait whose
    // top half is red and bottom half blue.
    const stored = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#0000ff' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 200,
              height: 200,
              channels: 3,
              background: '#ff0000',
            },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .jpeg({ quality: 100 })
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const path = join(root, 'rotated.jpg');
    await writeFile(path, stored);
    const hash = createHash('sha256').update(stored).digest('hex');

    const result = await createAssetVariant({
      source: {
        path,
        size: stored.length,
        hash,
        extension: 'jpg',
        owned: true,
      },
      familyUuid: `af-${hash}`,
      sourceType: AssetType.Image,
      settings: {
        type: 'image-transform',
        quality: 100,
        format: 'webp',
        crop: { left: 0, top: 220, width: 200, height: 180 },
        dimensions: { width: 200, height: 180 },
      },
    });

    const bytes = await readFile(
      THEI_SERVER.assets.filePath(result.contentHash, result.extension),
    );
    const { dominant } = await sharp(bytes).stats();
    expect(result.meta).toMatchObject({ width: 200, height: 180 });
    expect(dominant.b).toBeGreaterThan(200);
    expect(dominant.r).toBeLessThan(60);
  });
});
