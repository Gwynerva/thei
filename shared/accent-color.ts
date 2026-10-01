import { linearToHex, oklchToLinearSrgb } from './oklch';

/** Image-derived OKLCH color. Lightness is supplied by the active theme. */
export interface ImageAccent {
  hue: number;
  chroma: number;
}

export function normalizeImageAccent(value: unknown): ImageAccent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { hue, chroma } = value as Partial<ImageAccent>;
  if (
    typeof hue !== 'number' ||
    !Number.isFinite(hue) ||
    hue < 0 ||
    hue >= 360 ||
    typeof chroma !== 'number' ||
    !Number.isFinite(chroma) ||
    chroma < 0 ||
    chroma > 0.5
  )
    return undefined;
  return { hue: chroma === 0 ? 0 : hue, chroma };
}

export function imageAccentCssColor(
  accent: ImageAccent | undefined,
  fallback = 'oklch(var(--lightness-accent) 0 0)',
  alpha?: number,
) {
  if (!accent) return fallback;
  const alphaChannel = alpha === undefined ? '' : ` / ${alpha}`;
  return `oklch(var(--lightness-accent) min(var(--chroma-accent), ${accent.chroma}) ${accent.hue}${alphaChannel})`;
}

export function accentHueCssColor(
  hue: number | undefined,
  fallback: string,
  alpha?: number,
) {
  if (hue === undefined) return fallback;
  const alphaChannel = alpha === undefined ? '' : ` / ${alpha}`;
  return `oklch(var(--lightness-accent) var(--chroma-accent) ${hue}${alphaChannel})`;
}

/**
 * An OKLCH colour as hex, each channel clipped where it leaves the screen —
 * what a browser does with an `oklch()` it cannot show, and what the site's
 * generated icons are drawn with.
 */
export function oklchToHex(lightness: number, chroma: number, hue: number) {
  return linearToHex(oklchToLinearSrgb({ l: lightness, c: chroma, h: hue }));
}
