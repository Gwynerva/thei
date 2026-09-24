import { describe, expect, it } from 'vitest';
import { describeAssetRecipe } from '../../../shared/asset-recipe';
import en from '../../../shared/language/list/en';

const phrase = en.phrases;

describe('asset recipe descriptions', () => {
  it('names the crop, the source it was cut from and the output', () => {
    expect(
      describeAssetRecipe(
        {
          type: 'image-transform',
          quality: 90,
          crop: { left: 400, top: 300, width: 3200, height: 1800 },
          dimensions: { width: 1200, height: 675 },
          format: 'avif',
        },
        {
          width: 1200,
          height: 675,
          sourceDimensions: { width: 4000, height: 3000 },
        },
        phrase,
      ),
    ).toBe('Crop 3200×1800 of 4000×3000 → 1200×675 · AVIF · high quality');
  });

  it('says lossless instead of a quality that does not apply', () => {
    expect(
      describeAssetRecipe(
        {
          type: 'image-transform',
          quality: 100,
          dimensions: { width: 64, height: 64 },
          format: 'webp-lossless',
        },
        { width: 64, height: 64 },
        phrase,
      ),
    ).toBe('64×64 · WebP · lossless');
  });

  it('keeps the number of a quality that is not a level', () => {
    expect(
      describeAssetRecipe(
        {
          type: 'video-transform',
          quality: 85,
          dimensions: { width: 1280, height: 720 },
          stripAudio: true,
          fastConversion: false,
        },
        {
          width: 1280,
          height: 720,
          sourceDimensions: { width: 1920, height: 1080 },
        },
        phrase,
      ),
    ).toBe('1920×1080 → 1280×720 · WebM · quality 85 · no sound');
  });

  it('says when the proportions were not kept', () => {
    expect(
      describeAssetRecipe(
        {
          type: 'image-transform',
          quality: 90,
          dimensions: { width: 800, height: 800 },
          stretch: true,
          format: 'webp',
        },
        {
          width: 800,
          height: 800,
          sourceDimensions: { width: 1600, height: 900 },
        },
        phrase,
      ),
    ).toBe('1600×900 → 800×800 · stretched · WebP · high quality');
  });

  it('names a turn first, and the source as it was turned', () => {
    expect(
      describeAssetRecipe(
        {
          type: 'image-transform',
          quality: 90,
          rotation: 90,
          crop: { left: 0, top: 500, width: 3000, height: 3000 },
          dimensions: { width: 256, height: 256 },
          format: 'avif',
        },
        {
          width: 256,
          height: 256,
          sourceDimensions: { width: 4000, height: 3000 },
        },
        phrase,
      ),
    ).toBe(
      'Rotated 90° · Crop 3000×3000 of 3000×4000 → 256×256 · AVIF · high quality',
    );
  });

  it('names untransformed files and archives', () => {
    expect(describeAssetRecipe({ type: 'original' }, null, phrase)).toBe(
      'Stored as uploaded',
    );
    expect(describeAssetRecipe({ type: 'file-zip' }, null, phrase)).toBe(
      'ZIP archive',
    );
    expect(describeAssetRecipe(null, null, phrase)).toBeUndefined();
  });
});
