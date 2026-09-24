import { describe, expect, it } from 'vitest';
import {
  estimateImageSize,
  estimateVideoSize,
  IMAGE_SIZE_RATIO_BY_LEVEL,
} from '../../shared/asset-size-estimate';
import {
  VIDEO_MIN_BITRATE,
  videoAudioBitrate,
  videoTargetBitrate,
} from '../../shared/asset-upload-quality';
import type { AssetVideoTransformSettings } from '../../shared/asset-upload-settings';

const fullHd = { width: 1920, height: 1080 };

describe('video target bitrate', () => {
  it('spends 3.5 Mbit/s on 1080p30 at medium', () => {
    expect(videoTargetBitrate(75, fullHd, { ...fullHd, fps: 30 })).toBe(
      3_500_000,
    );
    expect(videoTargetBitrate(75, fullHd, fullHd)).toBe(3_500_000);
  });

  it('follows the level table', () => {
    expect(videoTargetBitrate(40, fullHd, fullHd)).toBe(1_050_000);
    expect(videoTargetBitrate(90, fullHd, fullHd)).toBe(5_950_000);
    expect(videoTargetBitrate(95, fullHd, fullHd)).toBe(9_800_000);
  });

  it('scales a little under the pixels and the frame rate', () => {
    const hd = { width: 1280, height: 720 };
    const at720 = videoTargetBitrate(75, hd, hd);
    // Half the pixels cost more than half the bits.
    expect(at720).toBeGreaterThan((3_500_000 * (1280 * 720)) / (1920 * 1080));
    expect(at720).toBeLessThan(3_500_000 * 0.6);
    const at60 = videoTargetBitrate(75, fullHd, { ...fullHd, fps: 60 });
    expect(at60).toBeGreaterThan(3_500_000 * 1.4);
    expect(at60).toBeLessThan(3_500_000 * 1.6);
  });

  it('never asks for more than the source had for the same pixels', () => {
    // A 1080p source at 1.2 Mbit/s: high and maximum collapse onto it.
    const source = { ...fullHd, bitrate: 1_200_000 };
    expect(videoTargetBitrate(90, fullHd, source)).toBe(1_200_000);
    expect(videoTargetBitrate(95, fullHd, source)).toBe(1_200_000);
    // Downscaled to 720p, the cap is rescaled with the pixels.
    const at720 = videoTargetBitrate(95, { width: 1280, height: 720 }, source);
    expect(at720).toBeLessThan(1_200_000);
    expect(at720).toBeGreaterThan(400_000);
  });

  it('keeps a floor for tiny outputs', () => {
    expect(
      videoTargetBitrate(40, { width: 64, height: 64 }, { ...fullHd }),
    ).toBe(VIDEO_MIN_BITRATE);
  });

  it('gives the sound less at the low levels', () => {
    expect(videoAudioBitrate(40)).toBe(64_000);
    expect(videoAudioBitrate(60)).toBe(96_000);
    expect(videoAudioBitrate(75)).toBe(128_000);
    expect(videoAudioBitrate(85)).toBe(128_000);
  });
});

describe('video size estimate', () => {
  const settings: AssetVideoTransformSettings = {
    type: 'video-transform',
    quality: 75,
    dimensions: fullHd,
    stripAudio: false,
    fastConversion: false,
  };

  it('multiplies the target bitrate by the duration', () => {
    const estimate = estimateVideoSize(settings, {
      ...fullHd,
      duration: 60,
      hasAudio: false,
    });
    expect(estimate?.videoBitrate).toBe(3_500_000);
    expect(estimate?.audioBitrate).toBe(0);
    // 60 s × 3.5 Mbit/s = 26.25 MB, less what the encoder leaves on the
    // table, plus the container's percent.
    expect(estimate?.bytes).toBeGreaterThan(26_250_000 * 0.95);
    expect(estimate?.bytes).toBeLessThan(26_250_000 * 0.98);
  });

  it('adds the sound unless it is missing or removed', () => {
    const source = { ...fullHd, duration: 10, hasAudio: true };
    const withSound = estimateVideoSize(settings, source)!;
    const removed = estimateVideoSize(
      { ...settings, stripAudio: true },
      source,
    )!;
    const silent = estimateVideoSize(settings, {
      ...source,
      hasAudio: false,
    })!;
    expect(withSound.audioBitrate).toBe(128_000);
    expect(withSound.bytes - removed.bytes).toBeCloseTo(
      (128_000 * 10 * 1.01) / 8,
      -2,
    );
    expect(silent.bytes).toBe(removed.bytes);
  });

  it('has nothing to say without a duration', () => {
    expect(estimateVideoSize(settings, fullHd)).toBeUndefined();
  });
});

describe('image size estimate', () => {
  it('is exact for a stop that was rendered', () => {
    expect(estimateImageSize('avif', 'high', { high: 12_000 })).toEqual({
      bytes: 12_000,
      approximate: false,
    });
  });

  it('scales from the nearest rendered level', () => {
    const ratios = IMAGE_SIZE_RATIO_BY_LEVEL.avif;
    const estimate = estimateImageSize('avif', 'low', {
      high: 14_500,
      maximum: 23_000,
    });
    expect(estimate?.approximate).toBe(true);
    expect(estimate?.bytes).toBe(
      Math.round((14_500 * ratios.low) / ratios.high),
    );
  });

  it('reads the source when nothing is rendered yet', () => {
    const fallback = {
      sourceBytes: 600_000,
      sourcePixels: 2_000_000,
      outputPixels: 500_000,
      sourceLossless: false,
    };
    const medium = estimateImageSize('webp', 'medium', {}, fallback)!;
    const high = estimateImageSize('webp', 'high', {}, fallback)!;
    expect(medium.approximate).toBe(true);
    expect(high.bytes).toBeGreaterThan(medium.bytes);
    expect(estimateImageSize('webp', 'medium', {})).toBeUndefined();
  });

  it('guesses lossless from a PNG source, and per pixel otherwise', () => {
    const png = {
      sourceBytes: 100_000,
      sourcePixels: 65_536,
      outputPixels: 65_536,
      sourceLossless: true,
    };
    expect(estimateImageSize('webp', 'lossless', {}, png)?.bytes).toBe(50_000);
    expect(
      estimateImageSize(
        'webp',
        'lossless',
        {},
        { ...png, sourceLossless: false },
      )?.bytes,
    ).toBe(57_344);
    expect(estimateImageSize('webp', 'lossless', { lossless: 70_000 })).toEqual(
      { bytes: 70_000, approximate: false },
    );
  });
});
