import { describe, expect, it } from 'vitest';
import { recommendImageFormat } from '../../../shared/asset-image-format-auto';

describe('automatic image format', () => {
  it('picks whichever format came out smallest', () => {
    expect(
      recommendImageFormat({
        avif: 63_000,
        webp: 118_000,
        'webp-lossless': 710_000,
      }),
    ).toEqual({ format: 'avif', reason: 'smallest' });
    expect(
      recommendImageFormat({ avif: 322, webp: 134, 'webp-lossless': 184 }),
    ).toEqual({ format: 'webp', reason: 'smallest' });
  });

  it('takes lossless when it is also the smallest', () => {
    expect(
      recommendImageFormat({ avif: 900, webp: 1200, 'webp-lossless': 700 }),
    ).toEqual({ format: 'webp-lossless', reason: 'smallest' });
  });

  it('stands in with AVIF until both lossy sizes are known', () => {
    expect(recommendImageFormat({})).toEqual({ format: 'avif' });
    expect(recommendImageFormat({ avif: 900 })).toEqual({ format: 'avif' });
    expect(recommendImageFormat({ webp: 100, 'webp-lossless': 50 })).toEqual({
      format: 'avif',
    });
  });

  it('decides by the two lossy formats without waiting for lossless', () => {
    expect(recommendImageFormat({ avif: 900, webp: 100 })).toEqual({
      format: 'webp',
      reason: 'smallest',
    });
    expect(recommendImageFormat({ avif: 100, webp: 900 })).toEqual({
      format: 'avif',
      reason: 'smallest',
    });
  });

  it('keeps a vector a vector', () => {
    expect(recommendImageFormat({ avif: 10 }, { isVector: true })).toEqual({
      format: 'svg',
      reason: 'vector',
    });
  });

  it('gives a photograph AVIF at once, whatever was measured', () => {
    expect(recommendImageFormat({}, { photographic: true })).toEqual({
      format: 'avif',
      reason: 'photo',
    });
    expect(
      recommendImageFormat(
        { avif: 900, webp: 100, 'webp-lossless': 50 },
        { photographic: true },
      ),
    ).toEqual({ format: 'avif', reason: 'photo' });
  });
});
