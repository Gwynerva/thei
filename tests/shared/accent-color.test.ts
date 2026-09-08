import { describe, expect, it } from 'vitest';
import {
  accentHueCssColor,
  imageAccentCssColor,
  normalizeImageAccent,
  oklchToHex,
} from '../../shared/accent-color';

describe('accent colors', () => {
  it('preserves image chroma and explicit neutral colors with alpha', () => {
    expect(imageAccentCssColor({ hue: 230, chroma: 0.03 }, 'red', 0.32)).toBe(
      'oklch(var(--lightness-accent) min(var(--chroma-accent), 0.03) 230 / 0.32)',
    );
    expect(imageAccentCssColor({ hue: 0, chroma: 0 }, 'red')).toBe(
      'oklch(var(--lightness-accent) min(var(--chroma-accent), 0) 0)',
    );
    expect(imageAccentCssColor(undefined)).toBe(
      'oklch(var(--lightness-accent) 0 0)',
    );
  });

  it('validates complete image colors and canonicalizes neutral hues', () => {
    expect(normalizeImageAccent({ hue: 42, chroma: 0 })).toEqual({
      hue: 0,
      chroma: 0,
    });
    expect(normalizeImageAccent({ hue: 42, chroma: 0.02 })).toEqual({
      hue: 42,
      chroma: 0.02,
    });
    for (const value of [
      null,
      42,
      {},
      { hue: 0 },
      { hue: 0, chroma: -1 },
      { hue: 0, chroma: NaN },
      { hue: 360, chroma: 0.1 },
    ])
      expect(normalizeImageAccent(value)).toBeUndefined();
  });
  it('uses one OKLCH representation for component colors and alpha', () => {
    expect(accentHueCssColor(64, 'transparent')).toBe(
      'oklch(var(--lightness-accent) var(--chroma-accent) 64)',
    );
    expect(accentHueCssColor(64, 'transparent', 0.32)).toBe(
      'oklch(var(--lightness-accent) var(--chroma-accent) 64 / 0.32)',
    );
  });

  it('keeps the requested fallback when media has no accent hue', () => {
    expect(accentHueCssColor(undefined, 'var(--color-text-3)')).toBe(
      'var(--color-text-3)',
    );
  });

  it('converts OKLCH colors for generated raster icons', () => {
    expect(oklchToHex(0.62796, 0.25768, 29.23)).toBe('#ff0000');
  });
});
