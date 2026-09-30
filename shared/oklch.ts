/**
 * Colour arithmetic in OKLCH, for pictures the server draws itself.
 *
 * `oklchToHex` in `accent-color.ts` clips each channel, which is what a
 * browser does with an `oklch()` it cannot show and what the site's generated
 * icons were drawn with. A card built from a vivid accent needs the opposite:
 * a colour that keeps its hue and lightness and gives up chroma until it fits
 * the screen, and a text colour that is provably readable on it. Both live
 * here, apart from the old function, so the icons already drawn keep their
 * colours.
 */
export interface Oklch {
  /** Perceived lightness, 0–1. */
  l: number;
  /** Colourfulness, 0 to about 0.37 inside sRGB. */
  c: number;
  /** Hue angle in degrees. */
  h: number;
}

export function oklchToLinearSrgb({
  l,
  c,
  h,
}: Oklch): [number, number, number] {
  const radians = h * (Math.PI / 180);
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const lCube = lRoot ** 3;
  const mCube = mRoot ** 3;
  const sCube = sRoot ** 3;
  return [
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  ];
}

export function linearSrgbToOklch(
  red: number,
  green: number,
  blue: number,
): Oklch {
  const lCube = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const mCube = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const sCube = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(lCube);
  const mRoot = Math.cbrt(mCube);
  const sRoot = Math.cbrt(sCube);
  const l = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const b = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const c = Math.hypot(a, b);
  // A grey has no hue; 0 is the canonical one, as in `normalizeImageAccent`.
  const h = c < 1e-6 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l, c, h };
}

/** One sRGB channel, 0–255, to its linear light. */
export function srgbChannelToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbChannel(value: number): number {
  const encoded =
    value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}

const GAMUT_EPSILON = 1e-4;

export function isInSrgb(color: Oklch): boolean {
  return oklchToLinearSrgb(color).every(
    (channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON,
  );
}

/**
 * The same colour with as much chroma as the screen can show.
 *
 * Lightness and hue are what a reader recognises a colour by, so those stay;
 * chroma is bisected down until the colour fits. Lightness itself is clamped
 * to the ends, where no chroma at all survives.
 */
export function gamutMapOklch(color: Oklch): Oklch {
  const l = Math.min(1, Math.max(0, color.l));
  const h = ((color.h % 360) + 360) % 360;
  const c = Math.max(0, color.c);
  if (isInSrgb({ l, c, h })) return { l, c, h };
  let low = 0;
  let high = c;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (isInSrgb({ l, c: middle, h })) low = middle;
    else high = middle;
  }
  return { l, c: low, h };
}

export function oklchToSrgbHex(color: Oklch): string {
  return linearToHex(oklchToLinearSrgb(gamutMapOklch(color)));
}

function linearToHex(channels: [number, number, number]): string {
  return `#${channels
    .map((channel) =>
      linearToSrgbChannel(channel).toString(16).padStart(2, '0'),
    )
    .join('')}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? [...value].map((character) => character + character).join('')
      : value.slice(0, 6);
  return [0, 2, 4].map((offset) =>
    Number.parseInt(full.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

export function hexToOklch(hex: string): Oklch {
  const [red, green, blue] = hexToRgb(hex).map(srgbChannelToLinear) as [
    number,
    number,
    number,
  ];
  return linearSrgbToOklch(red, green, blue);
}

/** WCAG 2 relative luminance of an opaque colour. */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex).map(srgbChannelToLinear) as [
    number,
    number,
    number,
  ];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2 contrast ratio, 1–21, whichever colour is lighter. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * What a translucent colour looks like laid over an opaque one, blended the
 * way a rasteriser does it: in the encoded sRGB values.
 */
export function blendHex(
  foreground: string,
  background: string,
  alpha: number,
): string {
  const top = hexToRgb(foreground);
  const bottom = hexToRgb(background);
  return `#${top
    .map((channel, index) =>
      Math.round(channel * alpha + bottom[index]! * (1 - alpha))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** A colour with an alpha channel, as eight hex digits. */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex.slice(0, 7)}${Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/**
 * The colour, moved in lightness just far enough to be readable on the
 * background.
 *
 * It moves away from the background — lighter on a dark one, darker on a
 * light one — so the result keeps its hue and as much of its character as
 * the contrast allows. If even the far end is not enough, the far end is
 * what comes back: white or black always reaches the most there is.
 */
export function ensureContrast(
  color: Oklch,
  background: string,
  minimum: number,
): Oklch {
  if (contrastRatio(oklchToSrgbHex(color), background) >= minimum)
    return gamutMapOklch(color);
  const lighter = relativeLuminance(background) < 0.18;
  const target = lighter ? 1 : 0;
  let near = color.l;
  let far = target;
  if (contrastRatio(oklchToSrgbHex({ ...color, l: far }), background) < minimum)
    return gamutMapOklch({ ...color, l: far });
  for (let step = 0; step < 24; step++) {
    const middle = (near + far) / 2;
    if (
      contrastRatio(oklchToSrgbHex({ ...color, l: middle }), background) >=
      minimum
    )
      far = middle;
    else near = middle;
  }
  return gamutMapOklch({ ...color, l: far });
}
