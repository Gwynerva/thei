import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getRouterParam,
  readBody,
  toWebHandler,
} from 'h3';
import { AssetType, type VideoAssetMeta } from '../../../shared/asset';
import { createOriginalAssetSettings } from '../../../shared/asset-upload-settings';
import type { AssetPreviewFrameResponse } from '../../../shared/api/asset';
import { freshTestDb } from '../../helpers/fresh-db';
import { findVideosWithUnscoredPreviews } from '../../../server/thei/assets/preview-refresh';
import {
  chooseVideoPreviewFrame,
  deleteStoredAsset,
  findMediaPreviewAsset,
  refreshMediaPreview,
  storeAsset,
  type StoredAssetRecord,
} from '../../../server/thei/assets/storage';
import { commitProcessedAsset } from '../../../server/thei/assets/create-variant';
import { extractVideoThumbnail } from '../../../server/thei/assets/video-thumbnail';
import { publicPreviewToken } from '../../../server/thei/assets/urls';
import { createAsset } from '../../../server/thei/assets/repository/create';
import { findAssetByIdentity } from '../../../server/thei/assets/repository/find-by-identity';
import { findAssetBySlug } from '../../../server/thei/assets/repository/find-by-slug';
import { findAssetByUuid } from '../../../server/thei/assets/repository/find-by-uuid';
import { touchAsset } from '../../../server/thei/assets/repository/touch';
import { updateAsset } from '../../../server/thei/assets/repository/update';
import { findOrphanedAssets } from '../../../server/thei/assets/repository/find-orphaned';
import { attachAssetUsage } from '../../../server/thei/assets/repository/usages/attach';
import { detachAssetUsage } from '../../../server/thei/assets/repository/usages/detach';
import { findAssetsByContainer } from '../../../server/thei/assets/repository/usages/find-by-container';

/**
 * A video's preview frame, chosen by hand: the exact frame at a moment, for
 * every video of the family, kept by a new variant, swapped for the old one
 * the cleanup then takes, and given back to the automatic pick.
 */

const forgotten = vi.hoisted(() => [] as string[]);
vi.mock('../../../server/thei/ai/sessions/files', () => ({
  forgetModelFile: (assetUuid: string) => forgotten.push(assetUuid),
}));

let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  forgotten.length = 0;
  const quiet = { log() {}, warn() {}, error() {} };
  Object.assign(context.server, {
    console: { tag: () => quiet },
    assets: {
      filePath: (contentHash: string, extension: string) =>
        join(
          context.directory,
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
      usages: {
        attach: attachAssetUsage,
        detach: detachAssetUsage,
        findByContainer: findAssetsByContainer,
      },
    },
  });
});

afterEach(async () => {
  await context.close();
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

/**
 * A blue second, then two green ones: the frame at 0.9 s is blue, while the
 * automatic pick — and ffmpeg's look over the next second — sees green.
 */
async function makeClip(name: string, side = 64) {
  const path = join(context.directory, name);
  await run([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=blue:s=${side}x${side}:r=25:d=1`,
    '-f',
    'lavfi',
    '-i',
    `color=c=green:s=${side}x${side}:r=25:d=2`,
    '-filter_complex',
    '[0:v][1:v]concat=n=2:v=1:a=0',
    '-c:v',
    'mpeg4',
    '-q:v',
    '2',
    path,
  ]);
  const bytes = await readFile(path);
  return {
    path,
    size: (await stat(path)).size,
    hash: createHash('sha256').update(bytes).digest('hex'),
    owned: true,
  };
}

async function storeClip(name: string, familyUuid = 'af-clip', side = 64) {
  const meta: VideoAssetMeta = { width: side, height: side, duration: 3 };
  const { asset } = await storeAsset({
    bytes: await makeClip(name, side),
    extension: 'mp4',
    familyUuid,
    settingsKey: name,
    settings: createOriginalAssetSettings(),
    type: AssetType.Video,
    meta,
  });
  // As an upload leaves it: its frame picked by itself.
  return await reread(await refreshMediaPreviewOf(asset));
}

async function refreshMediaPreviewOf(asset: StoredAssetRecord) {
  await refreshMediaPreview(asset);
  return asset.assetUuid;
}

async function reread(assetUuid: string) {
  return (await findAssetByUuid(assetUuid)) as StoredAssetRecord;
}

/** The preview's mean colour, red, green and blue. */
async function previewColor(asset: StoredAssetRecord) {
  const preview = (await findMediaPreviewAsset(asset))!;
  const image = await readFile(
    THEI_SERVER.assets.filePath(preview.contentHash, preview.extension),
  );
  const { channels } = await sharp(image).stats();
  return channels.slice(0, 3).map((channel) => Math.round(channel.mean));
}

function previewUsages(assetUuid: string) {
  return context.rawDb
    .prepare(
      "SELECT assetUuid FROM `asset-usages` WHERE containerType = 'asset' AND containerId = ? AND role = 'preview'",
    )
    .all(assetUuid) as { assetUuid: string }[];
}

describe('a frame taken at a moment', () => {
  it('is that frame exactly, scored, and the last frame at the very end', async () => {
    const clip = await makeClip('exact.mp4');
    const blue = await extractVideoThumbnail(clip, { at: 0.9 });
    const [red, green, bluish] = (await sharp(blue.frame).stats()).channels
      .slice(0, 3)
      .map((channel) => Math.round(channel.mean));
    expect(blue.at).toBe(0.9);
    expect(bluish).toBeGreaterThan(200);
    expect(red! + green!).toBeLessThan(80);
    expect(blue.score).toBeGreaterThan(0);

    // At 0.99 s a player still shows the last blue frame, begun at 0.96;
    // a bare seek would find the first green one, at 1.
    const [, , onScreen] = (
      await sharp(
        (await extractVideoThumbnail(clip, { at: 0.99, fps: 25 })).frame,
      ).stats()
    ).channels.map((channel) => Math.round(channel.mean));
    expect(onScreen).toBeGreaterThan(200);

    // A player paused at the end stands past the last frame.
    const end = await extractVideoThumbnail(clip, { at: 3, duration: 3 });
    const { channels } = await sharp(end.frame).stats();
    expect(end.at).toBe(3);
    expect(Math.round(channels[1]!.mean)).toBeGreaterThan(100);
    expect(Math.round(channels[2]!.mean)).toBeLessThan(40);
  }, 60_000);
});

describe('a preview frame chosen by hand', () => {
  it('swaps the preview, keeps the rest of the meta, and is idempotent', async () => {
    const video = await storeClip('video.mp4');
    const automatic = (await findMediaPreviewAsset(video))!;
    expect((await previewColor(video))[1]).toBeGreaterThan(100);
    const before = video.meta as VideoAssetMeta;
    expect(before.previewChosen).toBeUndefined();

    const [info] = await chooseVideoPreviewFrame(video, 0.9004);
    const chosen = await reread(video.assetUuid);
    const meta = chosen.meta as VideoAssetMeta;
    expect(meta).toMatchObject({
      width: 64,
      height: 64,
      duration: 3,
      previewAt: 0.9,
      previewChosen: true,
    });
    expect(meta.previewScore).toBeGreaterThan(0);
    // The accent follows the frame.
    expect(meta.accent?.hue).not.toBe(before.accent?.hue);
    expect((await previewColor(chosen))[2]).toBeGreaterThan(200);
    expect(previewUsages(video.assetUuid)).toHaveLength(1);
    const taken = (await findMediaPreviewAsset(chosen))!;
    expect(taken.assetUuid).not.toBe(automatic.assetUuid);
    expect(info!.assetUuid).toBe(video.assetUuid);
    expect(info!.meta).toEqual(meta);
    expect(info!.type === AssetType.Video && info!.media?.previewSrc).toBe(
      `/api/admin/assets/${taken.assetUuid}/content`,
    );
    // Scored: the update task's pass never takes it again.
    expect(await findVideosWithUnscoredPreviews()).toEqual([]);

    // Taken again at the same moment, nothing new is made.
    await chooseVideoPreviewFrame(chosen, 0.9);
    const again = await reread(video.assetUuid);
    expect(again.meta).toEqual(meta);
    expect(previewUsages(video.assetUuid)).toEqual([
      { assetUuid: taken.assetUuid },
    ]);

    // Remade from the file as it is, a chosen frame stays chosen.
    await refreshMediaPreview(again);
    expect((await reread(video.assetUuid)).meta).toEqual(meta);
  }, 120_000);

  it('goes back to the automatic pick and drops the mark', async () => {
    const video = await storeClip('video.mp4');
    const automatic = (await findMediaPreviewAsset(video))!;
    const automaticAt = (video.meta as VideoAssetMeta).previewAt;
    await chooseVideoPreviewFrame(video, 0.9);

    await chooseVideoPreviewFrame(await reread(video.assetUuid), null);
    const back = await reread(video.assetUuid);
    const meta = back.meta as VideoAssetMeta;
    expect(meta.previewChosen).toBeUndefined();
    expect(meta.previewAt).toBe(automaticAt);
    expect((await findMediaPreviewAsset(back))!.assetUuid).toBe(
      automatic.assetUuid,
    );
  }, 120_000);

  it('takes every video of the family from its own bytes, and a new variant takes the moment', async () => {
    const big = await storeClip('big.mp4', 'af-family', 64);
    const small = await storeClip('small.mp4', 'af-family', 32);
    const other = await storeClip('other.mp4', 'af-other', 48);

    const answer = await chooseVideoPreviewFrame(small, 0.9);
    expect(answer.map((variant) => variant.assetUuid)).toEqual([
      small.assetUuid,
      big.assetUuid,
    ]);
    for (const video of [big, small]) {
      const now = await reread(video.assetUuid);
      expect(now.meta).toMatchObject({ previewAt: 0.9, previewChosen: true });
      const preview = (await findMediaPreviewAsset(now))!;
      // Each is drawn from its own file, at its own size.
      expect(preview.meta).toMatchObject({
        width: (video.meta as VideoAssetMeta).width,
      });
      expect((await previewColor(now))[2]).toBeGreaterThan(200);
    }
    expect(
      ((await reread(other.assetUuid)).meta as VideoAssetMeta).previewChosen,
    ).toBeUndefined();

    const bytes = await makeClip('variant.mp4', 40);
    const variant = await commitProcessedAsset({
      processed: {
        bytes,
        extension: 'mp4',
        type: AssetType.Video,
        dimensions: { width: 40, height: 40 },
        video: { duration: 3 },
      },
      settings: createOriginalAssetSettings(),
      familyUuid: 'af-family',
      source: { path: bytes.path, extension: 'mp4', size: bytes.size },
    });
    const stored = await reread(variant.assetUuid);
    expect(stored.meta).toMatchObject({ previewAt: 0.9, previewChosen: true });
    expect((await previewColor(stored))[2]).toBeGreaterThan(200);
  }, 180_000);

  it('leaves the old preview to the cleanup', async () => {
    const video = await storeClip('video.mp4');
    const automatic = (await findMediaPreviewAsset(video))!;
    await chooseVideoPreviewFrame(video, 0.9);
    const taken = (await findMediaPreviewAsset(await reread(video.assetUuid)))!;

    const later = Date.now() + 1000;
    const orphans = (await findOrphanedAssets(later)).map(
      (row) => row.assetUuid,
    );
    expect(orphans).toContain(automatic.assetUuid);
    expect(orphans).not.toContain(taken.assetUuid);

    const oldFile = THEI_SERVER.assets.filePath(
      automatic.contentHash,
      automatic.extension,
    );
    expect(await deleteStoredAsset(automatic.assetUuid, later)).toBe(true);
    expect(existsSync(oldFile)).toBe(false);
    expect(
      existsSync(
        THEI_SERVER.assets.filePath(taken.contentHash, taken.extension),
      ),
    ).toBe(true);
  }, 120_000);
});

describe('the preview route', () => {
  async function handler() {
    Object.assign(globalThis, {
      defineEventHandler,
      createError,
      getRouterParam,
      readBody,
    });
    const route = (
      await import('../../../server/api/admin/assets/[assetUuid]/preview.post')
    ).default;
    return toWebHandler(
      createApp().use(
        createRouter().post('/api/admin/assets/:assetUuid/preview', route),
      ),
    );
  }

  const post = async (assetUuid: string, body: unknown) =>
    (await handler())(
      new Request(`http://localhost/api/admin/assets/${assetUuid}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  it('takes a moment of the video or null, for the family, and forgets what a model was shown', async () => {
    const video = await storeClip('video.mp4', 'af-route');
    const sibling = await storeClip('sibling.mp4', 'af-route', 32);

    for (const at of [-1, 'soon', 3.6, undefined])
      expect((await post(video.assetUuid, { at })).status).toBe(400);
    expect((await post('a-missing', { at: 1 })).status).toBe(404);
    await createAsset({
      assetUuid: 'a-picture',
      slug: 'picture',
      extension: 'png',
      familyUuid: 'af-picture',
      contentHash: 'picture',
      settingsKey: 'original',
      settings: createOriginalAssetSettings(),
      type: AssetType.Image,
      size: 1,
      touchedAt: Date.now(),
      meta: { width: 1, height: 1 },
    });
    expect((await post('a-picture', { at: 1 })).status).toBe(404);

    // A player's reading of the length may run a little past the probe's.
    const response = await post(video.assetUuid, { at: 3.2 });
    expect(response.status).toBe(200);
    const { variants } = (await response.json()) as AssetPreviewFrameResponse;
    expect(variants.map((variant) => variant.assetUuid)).toEqual([
      video.assetUuid,
      sibling.assetUuid,
    ]);
    expect(variants[0]!.meta).toMatchObject({
      previewAt: 3,
      previewChosen: true,
    });
    expect(forgotten).toEqual([video.assetUuid, sibling.assetUuid]);

    const back = await post(video.assetUuid, { at: null });
    expect(back.status).toBe(200);
    expect(
      ((await reread(video.assetUuid)).meta as VideoAssetMeta).previewChosen,
    ).toBeUndefined();
  }, 180_000);
});

describe("a public poster's address", () => {
  const asset = (type: AssetType, meta: unknown) =>
    ({ type, meta }) as StoredAssetRecord;

  it('moves with the frame: its moment, and whether it was chosen', () => {
    expect(
      publicPreviewToken(asset(AssetType.Image, { width: 1, height: 1 })),
    ).toBe('1');
    expect(publicPreviewToken(asset(AssetType.Video, { width: 1 }))).toBe('1');
    expect(publicPreviewToken(asset(AssetType.Video, { previewAt: 2.4 }))).toBe(
      '2.4',
    );
    expect(
      publicPreviewToken(
        asset(AssetType.Video, { previewAt: 2.4, previewChosen: true }),
      ),
    ).toBe('c2.4');
  });
});
