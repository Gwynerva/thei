import type { ImageAccent } from '#layers/thei/shared/accent-color';
import {
  blendHex,
  contrastRatio,
  ensureContrast,
  oklchToSrgbHex,
  relativeLuminance,
  type Oklch,
} from '#layers/thei/shared/oklch';

/**
 * The colours of a card, built from one accent.
 *
 * Four tones, each a different answer to "what does this thing look like":
 *
 * - **night** — a dark field tinted by the accent, with a glow of it in a
 *   corner; the site's own dark theme, in the same numbers `main.css` uses;
 * - **paper** — the light theme's counterpart;
 * - **vivid** — the accent itself as the field, white type on it;
 * - **duotone** — a gradient from the accent to a neighbouring hue.
 *
 * Every colour is gamut-mapped (a vivid accent keeps its hue and gives up
 * chroma) and every text colour is checked against the lightest or darkest
 * point of whatever it sits on — the background's stops, the glow, a chip —
 * and moved just far enough to be readable. The thresholds are the ones the
 * tests hold the palette to: body text 7:1 on night and paper, 4.5:1 on the
 * coloured fields, 4.5:1 for secondary text and chips, 3:1 for marks.
 */
export type OgTone = 'night' | 'paper' | 'vivid' | 'duotone';

export const OG_TONES: OgTone[] = ['night', 'paper', 'vivid', 'duotone'];

export const OG_CONTRAST = {
  text: { night: 7, paper: 7, vivid: 4.5, duotone: 4.5 },
  muted: 4.5,
  chip: 4.5,
  mark: 3,
} as const;

/** A solid field of colour with text on it: a chip, a calendar leaf. */
export interface OgPlate {
  background: string;
  /** Which way the background's gradient runs, in CSS degrees. */
  angle?: number;
  /** The opaque colours the background runs through. */
  stops: string[];
  text: string;
  muted: string;
}

export interface OgPalette {
  tone: OgTone;
  /** Whether the text is light: the field is dark. */
  dark: boolean;
  background: string;
  /** Every opaque colour the field runs through, glow included. */
  stops: string[];
  /** Drawn by the frame as a radial wash in a corner the layout picks. */
  glow: { color: string; alpha: number };
  text: string;
  muted: string;
  /** Icons, rules and other marks. */
  accent: string;
  chip: OgPlate;
  /** A quiet panel: behind artwork, the back of a stack of pictures. */
  surface: string;
  /** A field of the accent itself with white type: the calendar leaf. */
  plate: OgPlate;
  /** The avatar's ring and the top of the chart's bars. */
  ring: string;
  bars: [string, string];
}

export interface OgPaletteOptions {
  /** Which neighbour a duotone runs to: +50° or −50°. */
  duotoneDirection?: 1 | -1;
}

const WHITE = '#ffffff';

function hex(l: number, c: number, h: number) {
  return oklchToSrgbHex({ l, c, h });
}

/** The stop a text is least readable on: the lightest for light text. */
function worst(stops: string[], lightText: boolean) {
  return stops.reduce((found, stop) =>
    lightText === relativeLuminance(stop) > relativeLuminance(found)
      ? stop
      : found,
  );
}

function readable(color: Oklch, stops: string[], minimum: number) {
  const lightText = color.l > 0.5;
  let result = color;
  // Moving against one stop can only help against the others, as they all
  // sit on the same side of the text; twice settles any rounding.
  for (let pass = 0; pass < 2; pass++)
    for (const stop of stops)
      if (contrastRatio(oklchToSrgbHex(result), stop) < minimum)
        result = ensureContrast(result, worst(stops, lightText), minimum);
  return oklchToSrgbHex(result);
}

/**
 * The lightest the accent can be and still carry white text at 4.5:1 —
 * lightest, because a pale field reads as more colourful than a dark one.
 */
export function vividLightness(
  chroma: number,
  hue: number,
  over: (color: string) => string = (color) => color,
): number {
  const passes = (l: number) =>
    contrastRatio(WHITE, over(hex(l, chroma, hue))) >= 4.5;
  let low = 0.2;
  let high = 0.62;
  if (passes(high)) return high;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (passes(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/** A field of the accent for white type, as a gentle two-stop gradient. */
export function vividPlate(accent: ImageAccent, angle = 160): OgPlate {
  const chroma = Math.min(accent.chroma * 1.1, 0.2);
  const l = vividLightness(chroma, accent.hue);
  const top = hex(l, chroma, accent.hue);
  const bottom = hex(l - 0.08, chroma, accent.hue + 8);
  return {
    background: `linear-gradient(${angle}deg, ${top} 0%, ${bottom} 100%)`,
    angle,
    stops: [top, bottom],
    text: WHITE,
    muted: whiteMuted([top, bottom]),
  };
}

/** White, softened as far as it stays readable on every stop. */
function whiteMuted(stops: string[]) {
  const lightest = worst(stops, true);
  for (let alpha = 0.82; alpha < 1; alpha += 0.02) {
    const color = blendHex(WHITE, lightest, alpha);
    if (contrastRatio(color, lightest) >= OG_CONTRAST.muted) return color;
  }
  return WHITE;
}

function nightPalette(accent: ImageAccent): OgPalette {
  const { hue: h, chroma: c } = accent;
  const tint = Math.min(0.035, c * 0.25);
  const top = hex(0.17, tint, h);
  const bottom = hex(0.12, tint, h);
  const glow = { color: hex(0.52, Math.min(c, 0.14), h), alpha: 0.32 };
  const stops = [top, bottom, blendHex(glow.color, top, glow.alpha)];
  const chipBackground = hex(0.3, Math.min(c, 0.07), h);
  const chipText = readable(
    { l: 0.9, c: Math.min(c, 0.1), h },
    [chipBackground],
    OG_CONTRAST.chip,
  );
  return {
    tone: 'night',
    dark: true,
    background: `linear-gradient(160deg, ${top} 0%, ${bottom} 100%)`,
    stops,
    glow,
    text: readable({ l: 0.97, c: Math.min(c, 0.02), h }, stops, 7),
    muted: readable({ l: 0.78, c: Math.min(c, 0.04), h }, stops, 4.5),
    accent: readable({ l: 0.8, c: Math.min(c, 0.14), h }, stops, 3),
    chip: {
      background: chipBackground,
      stops: [chipBackground],
      text: chipText,
      muted: chipText,
    },
    surface: hex(0.22, Math.min(c, 0.05), h),
    plate: vividPlate(accent),
    ring: readable({ l: 0.74, c: Math.min(c, 0.16), h }, stops, 3),
    bars: [
      readable({ l: 0.74, c: Math.min(c, 0.16), h }, stops, 3),
      hex(0.45, Math.min(c, 0.14), h),
    ],
  };
}

function paperPalette(accent: ImageAccent): OgPalette {
  const { hue: h, chroma: c } = accent;
  const top = hex(0.975, Math.min(c, 0.018), h);
  const bottom = hex(0.945, Math.min(c, 0.03), h);
  const glow = { color: hex(0.86, Math.min(c, 0.09), h), alpha: 0.55 };
  const stops = [top, bottom, blendHex(glow.color, top, glow.alpha)];
  const chipBackground = hex(0.9, Math.min(c, 0.06), h);
  const chipText = readable(
    { l: 0.4, c: Math.min(c, 0.13), h },
    [chipBackground],
    OG_CONTRAST.chip,
  );
  return {
    tone: 'paper',
    dark: false,
    background: `linear-gradient(160deg, ${top} 0%, ${bottom} 100%)`,
    stops,
    glow,
    text: readable({ l: 0.22, c: Math.min(c, 0.05), h }, stops, 7),
    muted: readable({ l: 0.46, c: Math.min(c, 0.05), h }, stops, 4.5),
    accent: readable({ l: 0.52, c: Math.min(c, 0.16), h }, stops, 3),
    chip: {
      background: chipBackground,
      stops: [chipBackground],
      text: chipText,
      muted: chipText,
    },
    surface: hex(0.92, Math.min(c, 0.035), h),
    plate: vividPlate(accent),
    ring: readable({ l: 0.55, c: Math.min(c, 0.16), h }, stops, 3),
    bars: [
      readable({ l: 0.55, c: Math.min(c, 0.16), h }, stops, 3),
      hex(0.78, Math.min(c, 0.1), h),
    ],
  };
}

/**
 * The coloured fields share their furniture: white type, a chip darkened
 * rather than lightened (a lighter chip would take contrast from its label),
 * and a soft white glow.
 */
function colouredPalette(
  tone: 'vivid' | 'duotone',
  accent: ImageAccent,
  background: string,
  fields: string[],
): OgPalette {
  const { hue: h, chroma: c } = accent;
  const glow = { color: WHITE, alpha: 0.14 };
  const lightest = worst(fields, true);
  const stops = [...fields, blendHex(WHITE, lightest, glow.alpha)];
  const chipBackground = blendHex(
    hex(0.22, Math.min(c, 0.08), h),
    lightest,
    0.3,
  );
  return {
    tone,
    dark: true,
    background,
    stops,
    glow,
    text: WHITE,
    muted: whiteMuted(stops),
    accent: readable({ l: 0.96, c: Math.min(c, 0.05), h }, stops, 3),
    chip: {
      background: chipBackground,
      stops: [chipBackground],
      text: WHITE,
      muted: whiteMuted([chipBackground]),
    },
    surface: blendHex('#000000', lightest, 0.16),
    plate: {
      background: chipBackground,
      stops: [chipBackground],
      text: WHITE,
      muted: whiteMuted([chipBackground]),
    },
    ring: WHITE,
    bars: [WHITE, blendHex(WHITE, lightest, 0.45)],
  };
}

function vividPalette(accent: ImageAccent): OgPalette {
  const { hue: h } = accent;
  const chroma = Math.min(accent.chroma * 1.1, 0.2);
  // Solved with the glow laid over it, the lightest the field ever gets.
  const l = vividLightness(chroma, h, (color) => blendHex(WHITE, color, 0.14));
  const top = hex(l, chroma, h);
  const bottom = hex(l - 0.08, chroma, h + 8);
  return colouredPalette(
    'vivid',
    accent,
    `linear-gradient(135deg, ${top} 0%, ${bottom} 100%)`,
    [top, bottom],
  );
}

function duotonePalette(accent: ImageAccent, direction: 1 | -1): OgPalette {
  const chroma = Math.min(accent.chroma * 1.1, 0.18);
  const stop = (hue: number) =>
    hex(
      vividLightness(chroma, hue, (color) => blendHex(WHITE, color, 0.14)),
      chroma,
      hue,
    );
  const first = stop(accent.hue);
  const second = stop(accent.hue + direction * 50);
  return colouredPalette(
    'duotone',
    accent,
    `linear-gradient(125deg, ${first} 0%, ${second} 100%)`,
    [first, second],
  );
}

export function ogPalette(
  accent: ImageAccent,
  tone: OgTone,
  options: OgPaletteOptions = {},
): OgPalette {
  switch (tone) {
    case 'night':
      return nightPalette(accent);
    case 'paper':
      return paperPalette(accent);
    case 'vivid':
      return vividPalette(accent);
    case 'duotone':
      return duotonePalette(accent, options.duotoneDirection ?? 1);
  }
}

/**
 * A grey of the given relative luminance: what an image looks like, for
 * contrast, at a point that bright.
 */
function greyOfLuminance(luminance: number) {
  const encoded =
    luminance <= 0.0031308
      ? 12.92 * luminance
      : 1.055 * luminance ** (1 / 2.4) - 0.055;
  const channel = Math.round(Math.min(1, Math.max(0, encoded)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${channel}${channel}${channel}`;
}

/**
 * How dark the veil over a picture has to be for white type laid over it.
 *
 * The picture's brightest tenth under the text decides: the veil — a deep
 * shade of the accent — is laid at the least opacity that keeps white text
 * and its softened secondary text readable there, never below `minimum`
 * and never so much that the picture is gone. `field` is the veil over that
 * brightest point: the worst case anything drawn on the veil is checked
 * against.
 */
export function coverScrim(
  accent: ImageAccent,
  brightLuminance: number,
  minimum = 0.35,
): { color: string; alpha: number; muted: string; field: string } {
  const color = hex(0.16, Math.min(accent.chroma, 0.06), accent.hue);
  const under = greyOfLuminance(brightLuminance);
  let alpha = minimum;
  for (; alpha < 0.96; alpha += 0.01) {
    const field = blendHex(color, under, alpha);
    if (
      contrastRatio(WHITE, field) >= 4.5 &&
      contrastRatio(whiteMuted([field]), field) >= OG_CONTRAST.muted
    )
      break;
  }
  alpha = Math.min(0.96, Math.round(alpha * 100) / 100);
  const field = blendHex(color, under, alpha);
  return { color, alpha, muted: whiteMuted([field]), field };
}

/**
 * A tag's own chip in a cloud of them: a tint of the tag's colour, with its
 * title readable on it.
 */
export function tagPlate(accent: ImageAccent, dark: boolean): OgPlate {
  const { hue: h, chroma: c } = accent;
  const background = dark
    ? hex(0.3, Math.min(c, 0.08), h)
    : hex(0.9, Math.min(c, 0.07), h);
  const text = readable(
    { l: dark ? 0.92 : 0.32, c: Math.min(c, 0.1), h },
    [background],
    OG_CONTRAST.chip,
  );
  const muted = readable(
    { l: dark ? 0.78 : 0.45, c: Math.min(c, 0.06), h },
    [background],
    OG_CONTRAST.muted,
  );
  return { background, stops: [background], text, muted };
}

/**
 * The field behind a picture drawn whole rather than cropped, or behind a
 * tile of a collection: the picture's own accent, quiet.
 */
export function pictureField(accent: ImageAccent, dark: boolean) {
  return dark
    ? hex(0.3, Math.min(accent.chroma, 0.08), accent.hue)
    : hex(0.88, Math.min(accent.chroma, 0.06), accent.hue);
}
