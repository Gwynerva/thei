import { describe, expect, it } from 'vitest';
import { blendHex, contrastRatio, hexToOklch } from '../../../shared/oklch';
import {
  coverScrim,
  OG_CONTRAST,
  OG_TONES,
  ogPalette,
  vividPlate,
  type OgPalette,
} from '../../../server/thei/og/palette';

const HUES = Array.from({ length: 24 }, (_, index) => index * 15);
const CHROMAS = [0, 0.02, 0.05, 0.1, 0.15, 0.25, 0.37];

function lowestContrast(color: string, stops: string[]) {
  return Math.min(...stops.map((stop) => contrastRatio(color, stop)));
}

function expectReadable(palette: OgPalette, label: string) {
  const { stops } = palette;
  expect(
    lowestContrast(palette.text, stops),
    `${label} text`,
  ).toBeGreaterThanOrEqual(OG_CONTRAST.text[palette.tone]);
  expect(
    lowestContrast(palette.muted, stops),
    `${label} muted`,
  ).toBeGreaterThanOrEqual(OG_CONTRAST.muted);
  expect(
    lowestContrast(palette.accent, stops),
    `${label} accent`,
  ).toBeGreaterThanOrEqual(OG_CONTRAST.mark);
  expect(
    lowestContrast(palette.ring, stops),
    `${label} ring`,
  ).toBeGreaterThanOrEqual(OG_CONTRAST.mark);
  expect(
    lowestContrast(palette.bars[0], stops),
    `${label} bars`,
  ).toBeGreaterThanOrEqual(OG_CONTRAST.mark);
  for (const [name, plate] of [
    ['chip', palette.chip],
    ['plate', palette.plate],
  ] as const) {
    expect(
      lowestContrast(plate.text, plate.stops),
      `${label} ${name}`,
    ).toBeGreaterThanOrEqual(OG_CONTRAST.chip);
    expect(
      lowestContrast(plate.muted, plate.stops),
      `${label} ${name} muted`,
    ).toBeGreaterThanOrEqual(OG_CONTRAST.muted);
  }
}

describe('card palettes', () => {
  it('keep every text readable, for every accent and every tone', () => {
    for (const tone of OG_TONES)
      for (const hue of HUES)
        for (const chroma of CHROMAS)
          for (const direction of [1, -1] as const)
            expectReadable(
              ogPalette({ hue, chroma }, tone, { duotoneDirection: direction }),
              `${tone} ${hue}/${chroma}/${direction}`,
            );
  });

  it('are light or dark as their tone says', () => {
    const accent = { hue: 200, chroma: 0.12 };
    expect(ogPalette(accent, 'night').dark).toBe(true);
    expect(ogPalette(accent, 'paper').dark).toBe(false);
    expect(ogPalette(accent, 'vivid').dark).toBe(true);
    expect(ogPalette(accent, 'duotone').dark).toBe(true);
  });

  it('keep the hue of the accent on a vivid field', () => {
    for (const hue of HUES) {
      const [top] = ogPalette({ hue, chroma: 0.15 }, 'vivid').stops;
      const drift = Math.abs(((hexToOklch(top!).h - hue + 540) % 360) - 180);
      expect(drift, `hue ${hue}`).toBeLessThan(6);
    }
  });

  it('run a duotone to the neighbour on either side', () => {
    const plus = ogPalette({ hue: 100, chroma: 0.15 }, 'duotone', {
      duotoneDirection: 1,
    });
    const minus = ogPalette({ hue: 100, chroma: 0.15 }, 'duotone', {
      duotoneDirection: -1,
    });
    const hueOf = (palette: OgPalette) => hexToOklch(palette.stops[1]!).h;
    expect(hueOf(plus)).toBeGreaterThan(130);
    expect(hueOf(minus)).toBeLessThan(70);
  });

  it('tell different accents apart', () => {
    const first = ogPalette({ hue: 20, chroma: 0.15 }, 'night');
    const second = ogPalette({ hue: 220, chroma: 0.15 }, 'night');
    expect(first.accent).not.toBe(second.accent);
    expect(first.stops[0]).not.toBe(second.stops[0]);
  });

  it('make a calendar leaf that carries white type', () => {
    for (const hue of HUES)
      for (const chroma of CHROMAS) {
        const plate = vividPlate({ hue, chroma });
        expect(lowestContrast(plate.text, plate.stops)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
  });
});

describe('cover scrim', () => {
  it('veils any picture just enough for white type', () => {
    for (const hue of [0, 120, 240])
      for (const brightness of [0, 0.05, 0.2, 0.5, 0.8, 1]) {
        const scrim = coverScrim({ hue, chroma: 0.15 }, brightness);
        expect(scrim.alpha).toBeGreaterThanOrEqual(0.35);
        expect(scrim.alpha).toBeLessThanOrEqual(0.96);
        const grey = Math.round(
          (brightness <= 0.0031308
            ? 12.92 * brightness
            : 1.055 * brightness ** (1 / 2.4) - 0.055) * 255,
        )
          .toString(16)
          .padStart(2, '0');
        const field = blendHex(
          scrim.color,
          `#${grey}${grey}${grey}`,
          scrim.alpha,
        );
        expect(contrastRatio('#ffffff', field)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(scrim.muted, field)).toBeGreaterThanOrEqual(4.5);
      }
  });

  it('veils a dark picture less than a bright one', () => {
    const accent = { hue: 30, chroma: 0.1 };
    expect(coverScrim(accent, 0.02).alpha).toBeLessThan(
      coverScrim(accent, 0.9).alpha,
    );
  });

  it('never veils lighter than it is told to', () => {
    const accent = { hue: 30, chroma: 0.1 };
    expect(coverScrim(accent, 0.02, 0.6).alpha).toBeGreaterThanOrEqual(0.6);
    // A picture that needs more than the least still gets what it needs.
    expect(coverScrim(accent, 1, 0.4).alpha).toBe(coverScrim(accent, 1).alpha);
  });
});
