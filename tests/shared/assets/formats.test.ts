import { describe, expect, it } from 'vitest';
import {
  getAssetMediaKind,
  getAssetMimeType,
  isAssetExtensionSafeInline,
  normalizeAssetExtension,
} from '../../../shared/assets/formats';

describe('asset formats', () => {
  it('normalizes extensions before classification', () => {
    expect(normalizeAssetExtension('.WEBP')).toBe('webp');
    expect(getAssetMediaKind('MOV')).toBe('video');
    expect(getAssetMediaKind('flac')).toBe('audio');
    expect(getAssetMediaKind('txt')).toBe('other');
  });

  it('keeps MIME types aligned with supported extensions', () => {
    expect(getAssetMimeType('webm')).toBe('video/webm');
    expect(getAssetMimeType('mov')).toBe('video/quicktime');
    expect(getAssetMimeType('avi')).toBe('video/x-msvideo');
    expect(getAssetMimeType('svg')).toBe('image/svg+xml');
    expect(getAssetMimeType('zip')).toBe('application/zip');
    expect(getAssetMimeType('unknown')).toBe('application/octet-stream');
  });

  it('does not serve raw SVG or unknown files inline by default', () => {
    expect(isAssetExtensionSafeInline('webp')).toBe(true);
    expect(isAssetExtensionSafeInline('mp4')).toBe(true);
    expect(isAssetExtensionSafeInline('svg')).toBe(false);
    expect(isAssetExtensionSafeInline('txt')).toBe(false);
  });
});
