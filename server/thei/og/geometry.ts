/**
 * The card's measurements.
 *
 * 1200×630 is the size every previewer asks for, but not what every one
 * shows: X crops to 2:1, VK to about 2.24:1 — some 47 pixels off the top and
 * the bottom — and WhatsApp may show a square from the middle. Everything a
 * card cannot do without stays inside the safe area; artwork, glows and
 * watermarks may bleed past it, since losing an edge of them loses nothing.
 */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export const SAFE = {
  left: 64,
  top: 60,
  right: 1136,
  bottom: 570,
  width: 1072,
  height: 510,
} as const;

/** The type scale every layout shares, in pixels. */
export const TYPE = {
  chip: 24,
  meta: 25,
  tag: 23,
  signature: 24,
  parent: 26,
  status: 24,
  summary: 27,
  quote: [36, 32, 29, 27],
} as const;

export const ROW = {
  chip: 48,
  meta: 36,
  related: 36,
  tag: 32,
  signature: 40,
  parent: 40,
  status: 44,
  stat: 44,
} as const;

export interface OgBox {
  left: number;
  top: number;
  width: number;
  height: number;
}
