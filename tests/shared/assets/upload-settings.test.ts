import { describe, expect, it } from 'vitest';
import {
  ASSET_UPLOAD_SETTINGS_VERSION,
  buildAssetSettingsKey,
  createFileZipSettings,
  createImageTransformSettings,
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
import type { OtherAssetMeta } from '../../../shared/asset';

describe('asset upload settings v5', () => {
  it('builds image transform keys with resize behavior', () => {
    const settings = createImageTransformSettings(
      80,
      { width: 256, height: 256 },
      { resizeMode: 'cover', allowUpscale: true },
    );

    expect(ASSET_UPLOAD_SETTINGS_VERSION).toBe(5);
    expect(settings).toMatchObject({
      version: 5,
      type: 'image-transform',
      quality: 80,
      resizeMode: 'cover',
      allowUpscale: true,
    });
    expect(buildAssetSettingsKey(settings)).toBe(
      'v5:image-transform:q80:w256:h256:fit:cover:up:1',
    );
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
      'v5:video-transform:q70:w1200:h674:fit:cover:up:1:strip:1:fast:0',
    );
  });

  it('builds a stable file zip settings key', () => {
    expect(buildAssetSettingsKey(createFileZipSettings())).toBe('v5:file-zip');
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
