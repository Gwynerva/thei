import { describe, expect, it } from 'vitest';
import {
  ASSET_UPLOAD_MAX_DIMENSION,
  parseAcceptedExtensions,
  parseAssetUploadSettings,
  validateUploadContentLength,
} from '../../../server/thei/assets/upload-request';

describe('asset upload request parsing', () => {
  it('reads an image transform request with a crop', () => {
    const settings = parseAssetUploadSettings(
      JSON.stringify({
        type: 'image-transform',
        quality: 70,
        crop: { left: 10, top: 20, width: 1600, height: 900 },
        dimensions: { width: 1200, height: 675 },
        format: 'webp',
        ignored: true,
      }),
    );

    expect(settings).toEqual({
      type: 'image-transform',
      quality: 70,
      crop: { left: 10, top: 20, width: 1600, height: 900 },
      dimensions: { width: 1200, height: 675 },
      format: 'webp',
    });
  });

  it('still reads the resize fields of a page built before crops', () => {
    // A tab opened before an update keeps sending these until it reloads. The
    // fit is kept so the request can be resolved; the upscale flag is dropped,
    // because nothing is enlarged any more.
    expect(
      parseAssetUploadSettings(
        JSON.stringify({
          version: 4,
          type: 'image-transform',
          quality: 70,
          dimensions: { width: 1200, height: 675 },
          resizeMode: 'cover',
          allowUpscale: true,
        }),
      ),
    ).toEqual({
      type: 'image-transform',
      quality: 70,
      dimensions: { width: 1200, height: 675 },
      resizeMode: 'cover',
    });
  });

  it('reads a quarter turn and rejects any other angle', () => {
    const request = (rotation: unknown) =>
      JSON.stringify({
        type: 'video-transform',
        quality: 80,
        stripAudio: false,
        fastConversion: false,
        rotation,
        dimensions: {},
      });

    expect(parseAssetUploadSettings(request(270))).toMatchObject({
      rotation: 270,
    });
    expect(parseAssetUploadSettings(request(0))).not.toHaveProperty('rotation');
    for (const rotation of [45, -90, '90', 360]) {
      expect(() => parseAssetUploadSettings(request(rotation))).toThrow(
        'Invalid upload settings',
      );
    }
  });

  it('reads unlinked sides and rejects a stretch that is not a flag', () => {
    const request = (stretch: unknown) =>
      JSON.stringify({
        type: 'image-transform',
        quality: 80,
        dimensions: { width: 100, height: 300 },
        stretch,
      });

    expect(parseAssetUploadSettings(request(true))).toMatchObject({
      stretch: true,
    });
    expect(parseAssetUploadSettings(request(false))).not.toHaveProperty(
      'stretch',
    );
    expect(() => parseAssetUploadSettings(request('yes'))).toThrow(
      'Invalid upload settings',
    );
  });

  it('rejects malformed crops', () => {
    for (const crop of [
      { left: -1, top: 0, width: 10, height: 10 },
      { left: 0, top: 0, width: 0, height: 10 },
      { left: 0.5, top: 0, width: 10, height: 10 },
      { left: 0, top: 0, width: 10 },
    ]) {
      expect(() =>
        parseAssetUploadSettings(
          JSON.stringify({
            type: 'image-transform',
            quality: 70,
            crop,
            dimensions: {},
          }),
        ),
      ).toThrow('Invalid upload settings');
    }
  });

  it('rejects fractional and oversized dimensions', () => {
    expect(() =>
      parseAssetUploadSettings(
        JSON.stringify({
          type: 'image-transform',
          quality: 70,
          dimensions: { width: 1200.5 },
        }),
      ),
    ).toThrow('Invalid upload settings');

    expect(() =>
      parseAssetUploadSettings(
        JSON.stringify({
          type: 'video-transform',
          quality: 70,
          dimensions: { width: ASSET_UPLOAD_MAX_DIMENSION + 1 },
          stripAudio: false,
          fastConversion: false,
        }),
      ),
    ).toThrow('Invalid upload settings');
  });
  it('normalizes accepted extensions', () => {
    expect(parseAcceptedExtensions(JSON.stringify(['.JPG', 'webp']))).toEqual([
      'jpg',
      'webp',
    ]);
    expect(parseAcceptedExtensions('*')).toBe('*');
  });

  it('rejects oversized content-length before multipart parsing', () => {
    expect(() =>
      validateUploadContentLength(String(600 * 1024 * 1024)),
    ).toThrow('File exceeds the maximum allowed size');
  });
});
