import { describe, expect, it } from 'vitest';
import { accentHueCssColor, oklchToHex } from '../../shared/accent-color';

describe('accent colors', () => {
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
