import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAssetVariant } from '../../../server/thei/assets/create-variant';
import { probeMedia } from '../../../server/thei/assets/probe';
import { extractVideoThumbnail } from '../../../server/thei/assets/video-thumbnail';
import { AssetType } from '../../../shared/asset';
import { openAssetStore, type AssetStore } from '../../helpers/asset-store';
import { makeClip, type MediaFile } from '../../helpers/media';

/**
 * An HDR recording tagged by its transfer alone — PQ, with the primaries and
 * the matrix unspecified — goes through the pipeline with the real ffmpeg:
 * kept as is with a still, and encoded down to SDR.
 */
let root = '';
let store: AssetStore;
let clip: MediaFile;

const LONG = 120_000;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'thei-video-colour-'));
  store = openAssetStore(root);
  clip = await makeClip(join(root, 'pq.mp4'), {
    width: 320,
    height: 180,
    seconds: 2,
    audio: false,
    hdr: 'pq-transfer-only',
  });
}, LONG);

afterAll(async () => {
  store?.close();
  await rm(root, { recursive: true, force: true });
});

/** A still that came through the mapping as a picture, not black or white. */
async function expectPicture(image: Buffer | string) {
  const { channels } = await sharp(image).stats();
  const means = channels.slice(0, 3).map((channel) => channel.mean);
  expect(Math.max(...means)).toBeLessThan(235);
  expect(Math.min(...means)).toBeGreaterThan(15);
}

describe('an HDR video tagged by its transfer alone', () => {
  it('is what the clip is made as', async () => {
    const source = await probeMedia(clip.path);
    expect(source).toMatchObject({
      pixelFormat: 'yuv420p10le',
      colorTransfer: 'smpte2084',
    });
    expect(source.colorPrimaries).toBeUndefined();
    expect(source.colorSpace).toBeUndefined();
  });

  it(
    'yields a still, mapped to SDR',
    async () => {
      const { frame } = await extractVideoThumbnail(clip);
      await expectPicture(frame);
      // Made small first, at the even sides zscale needs: 101 would not do.
      const small = await extractVideoThumbnail(clip, { maxSide: 101 });
      const { width, height } = await sharp(small.frame).metadata();
      expect({ width, height }).toEqual({ width: 100, height: 56 });
      await expectPicture(small.frame);
    },
    LONG,
  );

  it(
    'is kept as is, with a preview',
    async () => {
      const result = await createAssetVariant({
        source: clip,
        familyUuid: `af-${clip.hash}`,
        sourceType: AssetType.Video,
        settings: { type: 'original' },
      });
      const preview = store.previewOf(result.assetUuid);
      expect(preview).toBeDefined();
      await expectPicture(
        store.filePath(preview!.contentHash, preview!.extension),
      );
    },
    LONG,
  );

  it(
    'is encoded down to BT.709',
    async () => {
      const result = await createAssetVariant({
        source: clip,
        familyUuid: `af-${clip.hash}`,
        sourceType: AssetType.Video,
        settings: {
          type: 'video-transform',
          quality: 50,
          stripAudio: false,
          dimensions: { width: 320, height: 180 },
        },
      });
      const made = await probeMedia(
        store.filePath(result.contentHash, result.extension),
      );
      expect(made).toMatchObject({
        pixelFormat: 'yuv420p',
        colorTransfer: 'bt709',
        colorPrimaries: 'bt709',
        colorSpace: 'bt709',
      });
    },
    LONG,
  );
});
