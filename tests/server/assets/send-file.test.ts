import { describe, expect, it } from 'vitest';
import {
  buildAssetContentDisposition,
  parseAssetRange,
} from '../../../server/thei/assets/send-file';

describe('asset file sender helpers', () => {
  it('parses standard and suffix byte ranges', () => {
    expect(parseAssetRange('bytes=0-99', 1000)).toEqual({
      start: 0,
      end: 99,
    });
    expect(parseAssetRange('bytes=100-', 1000)).toEqual({
      start: 100,
      end: 999,
    });
    expect(parseAssetRange('bytes=-50', 1000)).toEqual({
      start: 950,
      end: 999,
    });
  });

  it('rejects invalid ranges', () => {
    expect(parseAssetRange('bytes=200-100', 1000)).toBeNull();
    expect(parseAssetRange('bytes=1000-1001', 1000)).toBeNull();
    expect(parseAssetRange('items=0-1', 1000)).toBeNull();
  });

  it('forces attachment for unsafe inline extensions', () => {
    expect(buildAssetContentDisposition('webp', 'photo.webp')).toBeUndefined();
    expect(buildAssetContentDisposition('svg', 'bad".svg')).toBe(
      'attachment; filename="bad_.svg"',
    );
    expect(buildAssetContentDisposition('txt')).toBe(
      'attachment; filename="asset.txt"',
    );
  });
});
