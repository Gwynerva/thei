import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAssetVariant } from '../../../server/thei/assets/create-variant';
import { probeMedia } from '../../../server/thei/assets/probe';
import { AssetType } from '../../../shared/asset';
import {
  ASSET_QUALITY_LEVEL_QUALITY,
  ASSET_QUALITY_LEVELS,
} from '../../../shared/asset-quality-levels';
import { AUDIO_WAVEFORM_PEAKS } from '../../../shared/audio';
import { openAssetStore, type AssetStore } from '../../helpers/asset-store';
import {
  compareImages,
  makeClip,
  makePhoto,
  makeRecording,
  type MediaFile,
} from '../../helpers/media';

/**
 * The pipeline on what a camera and a phone actually hand in: a 24-megapixel
 * photo, 1080p video, a minute of sound. The small fixtures of the other
 * tests show that each step is right; these show that the steps hold at the
 * sizes that matter, with the real encoders and the pinned ffmpeg.
 */
let root = '';
let store: AssetStore;
let photo: MediaFile;

const LONG = 180_000;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-high-res-'));
  store = openAssetStore(root);
  photo = await makePhoto(join(root, 'photo.jpg'), {
    width: 6000,
    height: 4000,
  });
}, LONG);

afterAll(async () => {
  store?.close();
  await rm(root, { recursive: true, force: true });
});

const image = (
  source: MediaFile,
  settings: Record<string, unknown>,
  family = `af-${source.hash}`,
) =>
  createAssetVariant({
    source,
    familyUuid: family,
    sourceType: AssetType.Image,
    settings: { type: 'image-transform', ...settings } as never,
  });

const scratch = () => join(root, 'scratch');

describe('a 24-megapixel photo', () => {
  it(
    'encodes to AVIF at every level, each level larger than the one below, close to the source',
    async () => {
      const sizes: number[] = [];
      for (const level of ASSET_QUALITY_LEVELS) {
        const result = await image(photo, {
          quality: ASSET_QUALITY_LEVEL_QUALITY[level],
          dimensions: { width: 6000, height: 4000 },
        });
        expect(result.extension).toBe('avif');
        expect(result.meta).toMatchObject({ width: 6000, height: 4000 });
        sizes.push(result.size);
        if (level === 'medium') {
          const { ssim } = await compareImages(
            photo.path,
            store.filePath(result.contentHash, result.extension),
            { side: 1500, scratch: scratch() },
          );
          expect(ssim).toBeGreaterThan(0.9);
        }
      }
      for (let index = 1; index < sizes.length; index++) {
        expect(sizes[index]).toBeGreaterThan(sizes[index - 1]!);
      }
    },
    LONG,
  );

  it(
    'encodes to WebP, lossy at full size and lossless at a crop, every pixel kept',
    async () => {
      const lossy = await image(photo, {
        quality: 75,
        format: 'webp',
        dimensions: { width: 6000, height: 4000 },
      });
      expect(lossy.extension).toBe('webp');
      expect(lossy.meta).toMatchObject({ width: 6000, height: 4000 });

      const crop = { left: 1000, top: 800, width: 2400, height: 1600 };
      const lossless = await image(photo, {
        quality: 100,
        format: 'webp-lossless',
        crop,
        dimensions: { width: 2400, height: 1600 },
      });
      expect(lossless.extension).toBe('webp');
      const reference = await sharp(photo.path).extract(crop).raw().toBuffer();
      const made = await sharp(
        store.filePath(lossless.contentHash, lossless.extension),
      )
        .raw()
        .toBuffer();
      expect(made.equals(reference)).toBe(true);
    },
    LONG,
  );

  it(
    'crops and turns the full picture the way the plain order would',
    async () => {
      const crop = { left: 300, top: 500, width: 3000, height: 4000 };
      const result = await image(photo, {
        quality: 75,
        rotation: 90,
        crop,
        dimensions: { width: 1200, height: 1600 },
      });
      expect(result.meta).toMatchObject({ width: 1200, height: 1600 });
      // The plain order — turn, cut, then shrink — as a reference.
      const plain = await sharp(photo.path)
        .rotate(90)
        .extract(crop)
        .resize(1200, 1600, { fit: 'fill' })
        .png()
        .toBuffer();
      const { ssim } = await compareImages(
        plain,
        store.filePath(result.contentHash, result.extension),
        { scratch: scratch() },
      );
      expect(ssim).toBeGreaterThan(0.95);
    },
    LONG,
  );

  it(
    'honours a phone photo’s orientation before the crop, like the plain order',
    async () => {
      const upright = await makePhoto(join(root, 'upright.jpg'), {
        width: 6000,
        height: 4000,
        orientation: 6,
      });
      // Displayed 4000 wide and 6000 tall; the crop is in that frame.
      const crop = { left: 200, top: 1000, width: 3600, height: 2400 };
      const result = await image(upright, {
        quality: 75,
        crop,
        dimensions: { width: 1800, height: 1200 },
      });
      expect(result.meta).toMatchObject({ width: 1800, height: 1200 });
      const plain = await sharp(upright.path)
        .autoOrient()
        .extract(crop)
        .resize(1800, 1200, { fit: 'fill' })
        .png()
        .toBuffer();
      const { ssim } = await compareImages(
        plain,
        store.filePath(result.contentHash, result.extension),
        { scratch: scratch() },
      );
      expect(ssim).toBeGreaterThan(0.95);
    },
    LONG,
  );

  it(
    'gets a 720-pixel preview with an accent, and is never enlarged past itself',
    async () => {
      const result = await image(photo, {
        quality: 60,
        dimensions: { width: 8192, height: 5461 },
      });
      // Larger than the source is the source's own size.
      expect(result.meta).toMatchObject({ width: 6000, height: 4000 });
      expect(result.meta).toHaveProperty('accent');
      const preview = store.previewOf(result.assetUuid);
      expect(preview?.meta).toMatchObject({ width: 720, height: 480 });
      expect(preview?.extension).toBe('avif');
    },
    LONG,
  );
});

describe('1080p video', () => {
  const video = (
    source: MediaFile,
    settings: Record<string, unknown>,
    family = `af-${source.hash}`,
  ) =>
    createAssetVariant({
      source,
      familyUuid: family,
      sourceType: AssetType.Video,
      settings: {
        type: 'video-transform',
        quality: 75,
        stripAudio: false,
        ...settings,
      } as never,
    });

  let clip: MediaFile;
  beforeAll(async () => {
    clip = await makeClip(join(root, 'clip.mp4'), { seconds: 3 });
  }, LONG);

  it(
    'converts to VP9 with Opus in WebM at even sides, with a preview frame',
    async () => {
      const result = await video(clip, {
        dimensions: { width: 1280, height: 720 },
      });
      expect(result.extension).toBe('webm');
      const made = await probeMedia(
        store.filePath(result.contentHash, result.extension),
      );
      expect(made).toMatchObject({
        width: 1280,
        height: 720,
        codec: 'vp9',
        audioCodec: 'opus',
        hasAudio: true,
        pixelFormat: 'yuv420p',
      });
      expect(made.duration).toBeGreaterThan(2.9);
      expect(made.duration).toBeLessThan(3.1);
      expect(result.meta).toMatchObject({ hasAudio: true, width: 1280 });
      expect(result.meta).toHaveProperty('previewAt');
      expect(result.meta).toHaveProperty('bitrate');
      const preview = store.previewOf(result.assetUuid);
      expect(preview?.meta).toMatchObject({ width: 720, height: 405 });
    },
    LONG,
  );

  it(
    'drops the sound when asked and rounds an odd crop to even sides',
    async () => {
      const result = await video(clip, {
        stripAudio: true,
        crop: { left: 101, top: 51, width: 1001, height: 601 },
        dimensions: { width: 1001, height: 601 },
      });
      const made = await probeMedia(
        store.filePath(result.contentHash, result.extension),
      );
      expect(made.hasAudio).toBe(false);
      expect(made.width! % 2).toBe(0);
      expect(made.height! % 2).toBe(0);
      expect(result.meta).toMatchObject({ hasAudio: false });
    },
    LONG,
  );

  it(
    'brings a ten-bit HDR recording down to BT.709 SDR and says so in the file',
    async () => {
      const hdr = await makeClip(join(root, 'hdr.mp4'), {
        seconds: 2,
        hdr: true,
        audio: false,
      });
      const source = await probeMedia(hdr.path);
      expect(source).toMatchObject({
        pixelFormat: 'yuv420p10le',
        colorTransfer: 'arib-std-b67',
        colorPrimaries: 'bt2020',
      });
      const result = await video(hdr, {
        dimensions: { width: 960, height: 540 },
      });
      const file = store.filePath(result.contentHash, result.extension);
      const made = await probeMedia(file);
      expect(made).toMatchObject({
        width: 960,
        height: 540,
        pixelFormat: 'yuv420p',
        colorTransfer: 'bt709',
        colorPrimaries: 'bt709',
        colorSpace: 'bt709',
      });
      // The frames came through the mapping as a picture, not as black or
      // white: the preview has a middling brightness and some colour.
      const preview = store.previewOf(result.assetUuid);
      const stats = await sharp(
        store.filePath(preview!.contentHash, preview!.extension),
      ).stats();
      const means = stats.channels.slice(0, 3).map((channel) => channel.mean);
      expect(Math.max(...means)).toBeLessThan(235);
      expect(Math.min(...means)).toBeGreaterThan(15);
      expect(Math.max(...means) - Math.min(...means)).toBeGreaterThan(5);
    },
    LONG,
  );
});

describe('a minute of sound', () => {
  it(
    'converts to Opus with a waveform and its exact length',
    async () => {
      const recording = await makeRecording(join(root, 'voice.wav'), {
        seconds: 60,
      });
      expect((await stat(recording.path)).size).toBeGreaterThan(10_000_000);
      const result = await createAssetVariant({
        source: recording,
        familyUuid: `af-${recording.hash}`,
        sourceType: AssetType.Audio,
        settings: { type: 'audio-transform', quality: 75, mono: false },
      });
      expect(result.extension).toBe('weba');
      expect(result.meta).toMatchObject({ channels: 2 });
      const meta = result.meta as { duration: number; peaks: number[] };
      expect(meta.duration).toBeGreaterThan(59.9);
      expect(meta.duration).toBeLessThan(60.1);
      expect(meta.peaks).toHaveLength(AUDIO_WAVEFORM_PEAKS);
      expect(Math.max(...meta.peaks)).toBe(100);
    },
    LONG,
  );
});
