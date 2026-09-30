import { describe, expect, it } from 'vitest';
import { oklchToHex } from '../../shared/accent-color';
import {
  blendHex,
  contrastRatio,
  ensureContrast,
  gamutMapOklch,
  hexToOklch,
  isInSrgb,
  oklchToSrgbHex,
  withAlpha,
} from '../../shared/oklch';

describe('gamut mapping', () => {
  it('leaves a colour the screen can show as it is', () => {
    const color = { l: 0.6, c: 0.1, h: 220 };
    expect(gamutMapOklch(color)).toEqual(color);
    // Inside the gamut both conversions agree.
    expect(oklchToSrgbHex(color)).toBe(oklchToHex(0.6, 0.1, 220));
  });

  it('gives up only chroma to fit, never hue or lightness', () => {
    for (let hue = 0; hue < 360; hue += 15)
      for (const l of [0.2, 0.5, 0.8]) {
        const mapped = gamutMapOklch({ l, c: 0.4, h: hue });
        expect(isInSrgb(mapped)).toBe(true);
        expect(mapped.l).toBe(l);
        expect(mapped.h).toBe(hue);
        expect(mapped.c).toBeLessThan(0.4);
        // The written colour reads back with nearly the same hue.
        const back = hexToOklch(oklchToSrgbHex(mapped));
        if (back.c > 0.03) {
          const drift = Math.abs(((back.h - hue + 540) % 360) - 180);
          expect(drift).toBeLessThan(4);
        }
      }
  });

  it('keeps more chroma for a colour that asks for more', () => {
    let previous = 0;
    for (const c of [0.05, 0.1, 0.2, 0.3, 0.37]) {
      const mapped = gamutMapOklch({ l: 0.62, c, h: 30 });
      expect(mapped.c).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = mapped.c;
    }
  });

  it('reads a hex colour back into the same OKLCH', () => {
    const color = { l: 0.55, c: 0.12, h: 145 };
    const back = hexToOklch(oklchToSrgbHex(color));
    expect(back.l).toBeCloseTo(0.55, 2);
    expect(back.c).toBeCloseTo(0.12, 2);
    expect(back.h).toBeCloseTo(145, 0);
    expect(hexToOklch('#808080').c).toBeLessThan(1e-4);
    expect(hexToOklch('#808080').h).toBe(0);
  });
});

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#ffffff', '#777777')).toBeCloseTo(4.48, 2);
  });

  it('blends a translucent colour the way a rasteriser does', () => {
    expect(blendHex('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(blendHex('#ff0000', '#0000ff', 1)).toBe('#ff0000');
    expect(blendHex('#ff0000', '#0000ff', 0)).toBe('#0000ff');
    expect(withAlpha('#123456', 0.5)).toBe('#12345680');
  });

  it('moves a colour only as far as readability needs', () => {
    const background = '#0b1a1f';
    const already = { l: 0.9, c: 0.02, h: 200 };
    expect(ensureContrast(already, background, 4.5)).toEqual(already);

    const dim = ensureContrast({ l: 0.3, c: 0.1, h: 200 }, background, 4.5);
    expect(dim.l).toBeGreaterThan(0.3);
    expect(
      contrastRatio(oklchToSrgbHex(dim), background),
    ).toBeGreaterThanOrEqual(4.5);
    // Just far enough: a little less light would not do.
    expect(
      contrastRatio(oklchToSrgbHex({ ...dim, l: dim.l - 0.02 }), background),
    ).toBeLessThan(4.5);

    const onPaper = ensureContrast({ l: 0.7, c: 0.15, h: 30 }, '#f7f4ef', 7);
    expect(onPaper.l).toBeLessThan(0.7);
    expect(
      contrastRatio(oklchToSrgbHex(onPaper), '#f7f4ef'),
    ).toBeGreaterThanOrEqual(7);
  });

  it('settles for the far end when nothing reaches the contrast', () => {
    const color = ensureContrast({ l: 0.5, c: 0, h: 0 }, '#777777', 10);
    expect([0, 1]).toContain(color.l);
  });
});
