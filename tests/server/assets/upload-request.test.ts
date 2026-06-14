import { describe, expect, it } from 'vitest';
import {
  ASSET_UPLOAD_MAX_DIMENSION,
  parseAcceptedExtensions,
  parseAssetUploadSettings,
  validateUploadContentLength,
} from '../../../server/thei/assets/upload-request';

describe('asset upload request parsing', () => {
  it('canonicalizes image transform settings', () => {
    const settings = parseAssetUploadSettings(
      JSON.stringify({
        version: 5,
        type: 'image-transform',
        quality: 70.4,
        dimensions: { width: 1200, height: 675 },
        resizeMode: 'cover',
        allowUpscale: true,
        ignored: true,
      }),
    );

    expect(settings).toEqual({
      version: 5,
      type: 'image-transform',
      quality: 70,
      dimensions: { width: 1200, height: 675 },
      resizeMode: 'cover',
      allowUpscale: true,
    });
  });

  it('rejects fractional and oversized dimensions', () => {
    expect(() =>
      parseAssetUploadSettings(
        JSON.stringify({
          version: 5,
          type: 'image-transform',
          quality: 70,
          dimensions: { width: 1200.5 },
          resizeMode: 'inside',
          allowUpscale: false,
        }),
      ),
    ).toThrow('Invalid upload settings');

    expect(() =>
      parseAssetUploadSettings(
        JSON.stringify({
          version: 5,
          type: 'video-transform',
          quality: 70,
          dimensions: { width: ASSET_UPLOAD_MAX_DIMENSION + 1 },
          resizeMode: 'inside',
          allowUpscale: false,
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
