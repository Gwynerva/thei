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
        type: 'image-transform',
        quality: 70.4,
        dimensions: { width: 1200, height: 675 },
        resizeMode: 'cover',
        allowUpscale: true,
        ignored: true,
      }),
    );

    expect(settings).toEqual({
      type: 'image-transform',
      quality: 70,
      dimensions: { width: 1200, height: 675 },
      resizeMode: 'cover',
      allowUpscale: true,
      format: 'avif',
    });
  });

  it('accepts and canonicalizes settings carrying a stale version field', () => {
    // The version check used to reject these outright, which meant a browser
    // tab opened before an update started failing every upload. The per-field
    // validation below is the real guard, so a stray field is just dropped.
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
      allowUpscale: true,
      format: 'avif',
    });
  });

  it('rejects fractional and oversized dimensions', () => {
    expect(() =>
      parseAssetUploadSettings(
        JSON.stringify({
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
