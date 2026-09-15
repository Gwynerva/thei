import { describe, expect, it } from 'vitest';
import {
  buildAssetSettingsKey,
  createFileZipSettings,
  createImageTransformSettings,
  createOriginalAssetSettings,
  createVideoTransformSettings,
} from '../../../shared/asset-upload-settings';
import {
  evenDimensions,
  getAvailableAssetSizePresets,
  resizeDimensionsByLongSide,
} from '../../../shared/asset-upload-dimensions';
import {
  videoDisplayQualityToEffectiveQuality,
  videoQualityToVp9Crf,
} from '../../../shared/asset-upload-quality';
import { canZipAssetExtension } from '../../../shared/asset-upload-zip';
import { getAssetUploadProfileConfig } from '../../../shared/asset-upload-profiles';
import type { OtherAssetMeta } from '../../../shared/asset';

describe('asset upload settings', () => {
  it('builds image transform keys with resize behavior', () => {
    const settings = createImageTransformSettings(
      80,
      { width: 256, height: 256 },
      { resizeMode: 'cover', allowUpscale: true },
    );

    expect(settings).toMatchObject({
      type: 'image-transform',
      quality: 80,
      resizeMode: 'cover',
      allowUpscale: true,
    });
    expect(buildAssetSettingsKey(settings)).toBe(
      'image-transform:q80:w256:h256:fit:cover:up:1:fmt:avif',
    );
  });

  it('treats the image output format as a requested parameter', () => {
    // Two formats are two genuinely different derivations, so the format
    // belongs in the key. Unlike a version prefix, it describes what the
    // caller asked for rather than which build produced it.
    const asWebp = createImageTransformSettings(
      80,
      { width: 256, height: 256 },
      { resizeMode: 'cover', allowUpscale: true, format: 'webp' },
    );

    expect(asWebp.format).toBe('webp');
    expect(buildAssetSettingsKey(asWebp)).toBe(
      'image-transform:q80:w256:h256:fit:cover:up:1:fmt:webp',
    );
  });

  it('picks WebP for small images, where AVIF is bigger, and AVIF above', () => {
    // Measured on this project's own media: AVIF is 1.0-1.3x the WebP size at
    // 48px and only pulls ahead from roughly 128px. Choosing by size keeps
    // each asset on whichever encoder is actually smaller for it.
    const formatAt = (width: number, height: number) =>
      createImageTransformSettings(80, { width, height }).format;

    expect(formatAt(48, 48)).toBe('webp');
    expect(formatAt(127, 64)).toBe('webp');
    expect(formatAt(128, 128)).toBe('avif');
    expect(formatAt(1200, 675)).toBe('avif');
    // A transform with no bound keeps the source size, which is the case AVIF
    // was adopted for.
    expect(createImageTransformSettings(80, {}).format).toBe('avif');
    // An explicit request always wins over the size rule.
    expect(formatAt(1200, 675)).toBe('avif');
    expect(
      createImageTransformSettings(80, { width: 1200 }, { format: 'webp' })
        .format,
    ).toBe('webp');
  });

  it('uses boolean video options in settings keys', () => {
    const settings = createVideoTransformSettings(
      70,
      { width: 1200, height: 674 },
      {
        resizeMode: 'cover',
        allowUpscale: true,
        stripAudio: true,
        fastConversion: false,
      },
    );

    expect(settings.stripAudio).toBe(true);
    expect(settings.fastConversion).toBe(false);
    expect(buildAssetSettingsKey(settings)).toBe(
      'video-transform:q70:w1200:h674:fit:cover:up:1:strip:1:fast:0',
    );
  });

  it('keeps every engine generation counter out of the settings key', () => {
    // A settings key describes the requested parameters and nothing else. A
    // version prefix here would split byte-identical outputs into duplicate
    // rows after any bump, and nothing would ever reconcile the two halves.
    const keys = [
      buildAssetSettingsKey(createOriginalAssetSettings()),
      buildAssetSettingsKey(createFileZipSettings()),
      buildAssetSettingsKey(
        createImageTransformSettings(80, { width: 256, height: 256 }),
      ),
      buildAssetSettingsKey(
        createVideoTransformSettings(
          70,
          { width: 1200, height: 674 },
          { stripAudio: true, fastConversion: false },
        ),
      ),
    ];

    for (const key of keys) expect(key).not.toMatch(/^v\d+:/);
  });

  it('builds a stable file zip settings key', () => {
    expect(buildAssetSettingsKey(createFileZipSettings())).toBe('file-zip');
  });
});

describe('asset upload video quality', () => {
  it('maps displayed 10-100 quality into an effective 10-55 range', () => {
    expect(videoDisplayQualityToEffectiveQuality(10)).toBe(10);
    expect(videoDisplayQualityToEffectiveQuality(100)).toBe(55);
    expect(videoQualityToVp9Crf(100)).toBe(30);
  });
});

describe('asset upload dimensions', () => {
  it('keeps long-side presets at or below the original long side', () => {
    expect(getAvailableAssetSizePresets({ width: 1000, height: 600 })).toEqual([
      360, 720,
    ]);
  });

  it('resizes by long side while preserving aspect ratio', () => {
    expect(
      resizeDimensionsByLongSide({ width: 1600, height: 900 }, 720),
    ).toEqual({ width: 720, height: 405 });
  });

  it('normalizes video dimensions to even values', () => {
    expect(evenDimensions({ width: 1201, height: 675 })).toEqual({
      width: 1200,
      height: 674,
    });
  });
});

describe('asset upload profiles', () => {
  it('uses the standard tag icon settings', () => {
    expect(getAssetUploadProfileConfig('tag-icon')).toEqual({
      dimensions: { width: 128, height: 128 },
      resizeMode: 'cover',
      allowUpscale: true,
      imageQuality: 80,
      videoQuality: 80,
      stripAudio: true,
    });
  });
});

describe('asset zip eligibility', () => {
  it('allows plain unsqueezed other file extensions', () => {
    expect(canZipAssetExtension('txt')).toBe(true);
    expect(canZipAssetExtension('.json')).toBe(true);
  });

  it('rejects archives, documents, and media-like extensions', () => {
    for (const extension of [
      'zip',
      'rar',
      'pdf',
      'docx',
      'png',
      'mp4',
      'mp3',
    ]) {
      expect(canZipAssetExtension(extension)).toBe(false);
    }
  });

  it('stores archived original metadata separately from archive size', () => {
    const archiveSize = 42;
    const meta: OtherAssetMeta = {
      archivedOriginal: {
        extension: 'txt',
        size: 120,
        name: 'notes.txt',
      },
    };

    expect(archiveSize).not.toBe(meta.archivedOriginal?.size);
    expect(meta.archivedOriginal).toMatchObject({
      extension: 'txt',
      size: 120,
      name: 'notes.txt',
    });
  });
});
