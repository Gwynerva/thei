import { describe, expect, it } from 'vitest';
import {
  buildAssetSettingsKey,
  createFileZipSettings,
  createOriginalAssetSettings,
  resolveAssetUploadSettings,
  type AssetImageTransformRequest,
  type AssetImageTransformSettings,
  type AssetTransformSource,
} from '../../../shared/asset-upload-settings';
import { imageDisplayQualityToAvifQuality } from '../../../shared/asset-upload-quality';
import { canZipAssetExtension } from '../../../shared/asset-upload-zip';
import { getAssetUploadProfileConfig } from '../../../shared/asset-upload-profiles';
import type { OtherAssetMeta } from '../../../shared/asset';

describe('asset upload settings', () => {
  const photo = { width: 4000, height: 3000 };
  const image = (
    request: Partial<AssetImageTransformRequest>,
    source: AssetTransformSource = photo,
  ) =>
    resolveAssetUploadSettings(
      { type: 'image-transform', quality: 80, dimensions: {}, ...request },
      source,
    ) as AssetImageTransformSettings;

  it('measures the crop in the turned frame and names the turn in the key', () => {
    const settings = image({
      rotation: 90,
      crop: { left: 0, top: 500, width: 3000, height: 3000 },
      dimensions: { width: 256, height: 256 },
    });

    expect(settings).toMatchObject({
      rotation: 90,
      crop: { left: 0, top: 500, width: 3000, height: 3000 },
      dimensions: { width: 256, height: 256 },
    });
    expect(buildAssetSettingsKey(settings)).toBe(
      'image-transform:q80:w256:h256:rot:90:crop:0,500,3000,3000:fmt:avif',
    );
    // The whole turned frame is no crop, and its size follows the turn.
    const whole = image({
      rotation: 270,
      crop: { left: 0, top: 0, width: 3000, height: 4000 },
    });
    expect(whole).not.toHaveProperty('crop');
    expect(whole.dimensions).toEqual({ width: 3000, height: 4000 });
    // No turn is not written at all, so existing keys stay as they were.
    expect(image({ rotation: 0 })).not.toHaveProperty('rotation');
  });

  it('takes unlinked sides exactly, never past the crop but for a vector', () => {
    const crop = { left: 0, top: 0, width: 1600, height: 900 };
    const stretched = image({
      crop,
      dimensions: { width: 800, height: 800 },
      stretch: true,
    });
    expect(stretched).toMatchObject({
      dimensions: { width: 800, height: 800 },
      stretch: true,
    });
    // A resolved recipe resolves to itself.
    expect(image(stretched)).toEqual(stretched);
    // Each side stops at the crop's own.
    expect(
      image({ crop, dimensions: { width: 800, height: 2000 }, stretch: true })
        .dimensions,
    ).toEqual({ width: 800, height: 900 });
    // A vector has no size of its own to lose.
    expect(
      image(
        { dimensions: { width: 800, height: 2000 }, stretch: true },
        { width: 400, height: 300, isVector: true },
      ).dimensions,
    ).toEqual({ width: 800, height: 2000 });
  });

  it('drops the stretch when the sides keep the crop proportions anyway', () => {
    const settings = image({
      crop: { left: 0, top: 0, width: 1600, height: 900 },
      dimensions: { width: 1600, height: 900 },
      stretch: true,
    });
    expect(settings).not.toHaveProperty('stretch');
    expect(settings.dimensions).toEqual({ width: 1600, height: 900 });
  });

  it('keeps stretched video sides even', () => {
    const settings = resolveAssetUploadSettings(
      {
        type: 'video-transform',
        quality: 80,
        stripAudio: false,
        fastConversion: false,
        dimensions: { width: 301, height: 301 },
        stretch: true,
      },
      { width: 1280, height: 720 },
    );
    expect(settings).toMatchObject({
      dimensions: { width: 300, height: 300 },
      stretch: true,
    });
  });

  it('describes a crop and the exact output size in the key', () => {
    const settings = image({
      crop: { left: 400, top: 300, width: 3200, height: 1800 },
      dimensions: { width: 1200, height: 675 },
    });

    expect(settings).toEqual({
      type: 'image-transform',
      quality: 80,
      crop: { left: 400, top: 300, width: 3200, height: 1800 },
      dimensions: { width: 1200, height: 675 },
      format: 'avif',
    });
    expect(buildAssetSettingsKey(settings)).toBe(
      'image-transform:q80:w1200:h675:crop:400,300,3200,1800:fmt:avif',
    );
  });

  it('leaves a crop of the whole frame out of the recipe', () => {
    const settings = image({
      crop: { left: 0, top: 0, width: 4000, height: 3000 },
      dimensions: { width: 1000 },
    });

    expect(settings.crop).toBeUndefined();
    expect(settings.dimensions).toEqual({ width: 1000, height: 750 });
    expect(buildAssetSettingsKey(settings)).toBe(
      'image-transform:q80:w1000:h750:fmt:avif',
    );
  });

  it('keeps a crop inside the source', () => {
    const settings = image({
      crop: { left: 3900, top: -20, width: 500, height: 200 },
    });

    expect(settings.crop).toEqual({
      left: 3900,
      top: 0,
      width: 100,
      height: 200,
    });
  });

  it('fits a box of other proportions and never enlarges', () => {
    // A box is filled on one side only: the proportions come from the crop.
    expect(
      image({ dimensions: { width: 1200, height: 1200 } }).dimensions,
    ).toEqual({ width: 1200, height: 900 });
    // A small source is stored at its own size; the place showing it scales.
    expect(
      image(
        { dimensions: { width: 256, height: 256 } },
        { width: 100, height: 100 },
      ).dimensions,
    ).toEqual({ width: 100, height: 100 });
  });

  it('enlarges a vector source, which has no size of its own to lose', () => {
    expect(
      image(
        { dimensions: { width: 512, height: 512 } },
        { width: 24, height: 24, isVector: true },
      ).dimensions,
    ).toEqual({ width: 512, height: 512 });
  });

  it('resolves a recipe to itself', () => {
    // Rounding must not drift: a stored recipe asked for again is the same
    // output, so it has to come back with the same key.
    const source = { width: 1000, height: 331 };
    const first = image({ dimensions: { width: 300, height: 300 } }, source);
    const again = image(first, source);

    expect(first.dimensions).toEqual({ width: 300, height: 99 });
    expect(buildAssetSettingsKey(again)).toBe(buildAssetSettingsKey(first));
  });

  it('turns a legacy cover request into a centred crop', () => {
    const settings = image({
      dimensions: { width: 256, height: 256 },
      resizeMode: 'cover',
      allowUpscale: true,
    });

    expect(settings.crop).toEqual({
      left: 500,
      top: 0,
      width: 3000,
      height: 3000,
    });
    expect(settings.dimensions).toEqual({ width: 256, height: 256 });
    expect(buildAssetSettingsKey(settings)).not.toMatch(/fit:|up:/);
  });

  it('treats the image output format as a requested parameter', () => {
    // Two formats are two genuinely different derivations, so the format
    // belongs in the key. Unlike a version prefix, it describes what the
    // caller asked for rather than which build produced it.
    const asWebp = image({ dimensions: { width: 256 }, format: 'webp' });

    expect(asWebp.format).toBe('webp');
    expect(buildAssetSettingsKey(asWebp)).toBe(
      'image-transform:q80:w256:h192:fmt:webp',
    );
  });

  it('picks WebP for small outputs, where AVIF is bigger, and AVIF above', () => {
    // Measured on this project's own media: AVIF is 1.0-1.3x the WebP size at
    // 48px and only pulls ahead from roughly 128px. Choosing by size keeps
    // each asset on whichever encoder is actually smaller for it.
    const formatAt = (width: number, height: number) =>
      image({ dimensions: { width, height } }, { width, height }).format;

    expect(formatAt(48, 48)).toBe('webp');
    expect(formatAt(127, 64)).toBe('webp');
    expect(formatAt(128, 128)).toBe('avif');
    expect(formatAt(1200, 675)).toBe('avif');
    // An explicit request always wins over the size rule.
    expect(image({ dimensions: { width: 1200 }, format: 'webp' }).format).toBe(
      'webp',
    );
  });

  it('records lossless WebP with one quality, since it has none to choose', () => {
    const lossless = (quality: number) =>
      image({ quality, dimensions: { width: 256 }, format: 'webp-lossless' });

    expect(lossless(40)).toMatchObject({
      quality: 100,
      format: 'webp-lossless',
    });
    expect(buildAssetSettingsKey(lossless(40))).toBe(
      buildAssetSettingsKey(lossless(90)),
    );
    expect(buildAssetSettingsKey(lossless(40))).toBe(
      'image-transform:q100:w256:h192:fmt:webp-lossless',
    );
  });

  it('keeps video crops and sizes on even pixels', () => {
    const settings = resolveAssetUploadSettings(
      {
        type: 'video-transform',
        quality: 70,
        crop: { left: 11, top: 5, width: 1201, height: 675 },
        dimensions: { width: 1201, height: 675 },
        stripAudio: true,
        fastConversion: false,
      },
      { width: 1920, height: 1080, hasAudio: true },
    );

    expect(settings).toMatchObject({
      crop: { left: 10, top: 4, width: 1200, height: 674 },
      dimensions: { width: 1200, height: 674 },
      stripAudio: true,
    });
    expect(buildAssetSettingsKey(settings)).toBe(
      'video-transform:q70:w1200:h674:crop:10,4,1200,674:strip:1:fast:0',
    );
  });

  it('describes removing audio from a silent video as keeping it', () => {
    const silent = resolveAssetUploadSettings(
      {
        type: 'video-transform',
        quality: 70,
        dimensions: {},
        stripAudio: true,
        fastConversion: false,
      },
      { width: 640, height: 360, hasAudio: false },
    );

    expect(silent).toMatchObject({ stripAudio: false });
  });

  it('keeps every engine generation counter out of the settings key', () => {
    // A settings key describes the requested parameters and nothing else. A
    // version prefix here would split byte-identical outputs into duplicate
    // rows after any bump, and nothing would ever reconcile the two halves.
    const keys = [
      buildAssetSettingsKey(createOriginalAssetSettings()),
      buildAssetSettingsKey(createFileZipSettings()),
      buildAssetSettingsKey(image({ dimensions: { width: 256 } })),
    ];

    for (const key of keys) expect(key).not.toMatch(/^v\d+:/);
  });

  it('builds a stable file zip settings key', () => {
    expect(buildAssetSettingsKey(createFileZipSettings())).toBe('file-zip');
  });
});

describe('asset upload image quality', () => {
  it('maps the stored quality onto AVIF through the level table', () => {
    expect(imageDisplayQualityToAvifQuality(10)).toBe(30);
    expect(imageDisplayQualityToAvifQuality(40)).toBe(30);
    expect(imageDisplayQualityToAvifQuality(75)).toBe(55);
    expect(imageDisplayQualityToAvifQuality(90)).toBe(65);
    // Halfway between high (65) and maximum (72).
    expect(imageDisplayQualityToAvifQuality(92.5)).toBe(69);
    expect(imageDisplayQualityToAvifQuality(100)).toBe(72);
  });
});

describe('asset upload profiles', () => {
  it('starts a tag icon from the medium level', () => {
    expect(getAssetUploadProfileConfig('tag-icon')).toEqual({
      box: { width: 128, height: 128 },
      aspect: { width: 1, height: 1 },
      imageQuality: 75,
      videoQuality: 75,
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
