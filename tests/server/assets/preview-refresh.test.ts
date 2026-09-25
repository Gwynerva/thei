import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import { AssetType, type VideoAssetMeta } from '../../../shared/asset';
import { createOriginalAssetSettings } from '../../../shared/asset-upload-settings';
import {
  findVideosWithFirstFramePreviews,
  refreshFirstFramePreviews,
} from '../../../server/thei/assets/preview-refresh';
import { storeAsset } from '../../../server/thei/assets/storage';
import { createAsset } from '../../../server/thei/assets/repository/create';
import { findAssetByIdentity } from '../../../server/thei/assets/repository/find-by-identity';
import { findAssetBySlug } from '../../../server/thei/assets/repository/find-by-slug';
import { findAssetByUuid } from '../../../server/thei/assets/repository/find-by-uuid';
import { touchAsset } from '../../../server/thei/assets/repository/touch';
import { updateAsset } from '../../../server/thei/assets/repository/update';
import {
  countAssetPlacements,
  countAssetPlacementsByUuids,
} from '../../../server/thei/assets/repository/usage-count';
import { attachAssetUsage } from '../../../server/thei/assets/repository/usages/attach';
import { detachAssetUsage } from '../../../server/thei/assets/repository/usages/detach';
import { findAssetsByContainer } from '../../../server/thei/assets/repository/usages/find-by-container';
import { schema } from '../../../server/thei/db/schema';

let root = '';
let rawDb: Database.Database;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-preview-refresh-'));
  rawDb = new Database(':memory:');
  const db = drizzle(rawDb, { schema });
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
  const quiet = { log() {}, warn() {}, error() {} };
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ db, schema }),
    console: { tag: () => quiet },
    assets: {
      filePath: (contentHash: string, extension: string) =>
        join(
          root,
          'assets',
          contentHash.slice(0, 2),
          `${contentHash}.${extension}`,
        ),
      create: createAsset,
      update: updateAsset,
      findByIdentity: findAssetByIdentity,
      findByUuid: findAssetByUuid,
      findBySlug: findAssetBySlug,
      touch: touchAsset,
      countPlacements: countAssetPlacements,
      countPlacementsByUuids: countAssetPlacementsByUuids,
      usages: {
        attach: attachAssetUsage,
        detach: detachAssetUsage,
        findByContainer: findAssetsByContainer,
      },
    },
  };
});

afterEach(async () => {
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
  await rm(root, { recursive: true, force: true });
});

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegInstaller.path, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}

/** A clip that opens on a black second and then shows red, stored as a video. */
async function storeClip(name: string) {
  const path = join(root, name);
  await run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=64x64:r=25:d=1',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=64x64:r=25:d=3',
    '-filter_complex',
    '[0:v][1:v]concat=n=2:v=1:a=0',
    '-c:v',
    'mpeg4',
    '-q:v',
    '2',
    path,
  ]);
  const bytes = await readFile(path);
  const meta: VideoAssetMeta = { width: 64, height: 64, duration: 4 };
  const { asset } = await storeAsset({
    bytes: {
      path,
      size: (await stat(path)).size,
      hash: createHash('sha256').update(bytes).digest('hex'),
      owned: true,
    },
    extension: 'mp4',
    familyUuid: `af-${name}`,
    settingsKey: 'original',
    settings: createOriginalAssetSettings(),
    type: AssetType.Video,
    meta,
  });
  return asset;
}

describe('first-frame preview refresh', () => {
  it('remakes the previews of videos that still have none chosen, once', async () => {
    const stored = await storeClip('fade.mp4');
    expect(
      (await findVideosWithFirstFramePreviews()).map((row) => row.assetUuid),
    ).toEqual([stored.assetUuid]);

    const reported: [number, number][] = [];
    const result = await refreshFirstFramePreviews({
      onProgress: (done, total) => {
        reported.push([done, total]);
      },
    });

    expect(result).toEqual({ total: 1, failed: 0 });
    expect(reported).toEqual([
      [0, 1],
      [1, 1],
    ]);

    const video = (await findAssetByUuid(stored.assetUuid))!;
    const meta = video.meta as VideoAssetMeta;
    expect(meta.previewAt).toBeGreaterThan(0);
    expect(meta.accent?.chroma).toBeGreaterThan(0);

    const preview = (
      await findAssetsByContainer('asset', stored.assetUuid)
    ).find((usage) => usage.role === 'preview')?.asset;
    expect(preview).toBeDefined();
    const image = await readFile(
      THEI_SERVER.assets.filePath(preview!.contentHash, preview!.extension),
    );
    const { channels } = await sharp(image).stats();
    expect(Math.round(channels[0]!.mean)).toBeGreaterThan(200);
    expect(Math.round(channels[2]!.mean)).toBeLessThan(40);

    // Dealt with: the next pass has nothing to do.
    expect(await findVideosWithFirstFramePreviews()).toEqual([]);
    expect(await refreshFirstFramePreviews()).toMatchObject({ total: 0 });
  }, 60_000);

  it('skips a video it cannot read and reports it', async () => {
    await createAsset({
      assetUuid: 'a-broken',
      slug: 'broken',
      extension: 'mp4',
      familyUuid: 'af-broken',
      contentHash: 'deadbeef',
      settingsKey: 'original',
      settings: createOriginalAssetSettings(),
      type: AssetType.Video,
      size: 10,
      touchedAt: Date.now(),
      meta: { width: 64, height: 64 },
    });

    const result = await refreshFirstFramePreviews();

    expect(result).toEqual({ total: 1, failed: 1 });
    // Still without a chosen frame: it keeps its old preview, and the file
    // card in the library can remake it by hand.
    expect(await findVideosWithFirstFramePreviews()).toHaveLength(1);
  }, 60_000);
});
