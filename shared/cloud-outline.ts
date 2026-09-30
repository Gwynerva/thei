import { cyrb53 } from './utils/hash';

/**
 * The outline of a thought bubble: a box whose every side is a row of round
 * bumps, a little uneven so it reads as drawn rather than stamped.
 *
 * There are several clouds — puffy, scalloped, billowing, lumpy — and the
 * seed picks one, as it picks the unevenness: one card always gets the same
 * cloud, on the server and after hydration alike, while a feed of them does
 * not repeat one shape down the page.
 *
 * The bumps stay inside the box — the path starts `inset` in from each edge
 * and bulges out towards it, never higher than that band and never as round
 * as a half-circle — so a card can use its own size and padding as they are,
 * whichever cloud it gets.
 */
export const CLOUD_SHAPES = [
  'puffs',
  'scallops',
  'billows',
  'cumulus',
  'pebbles',
] as const;

export type CloudShape = (typeof CLOUD_SHAPES)[number];

interface CloudRules {
  /** The length a bump aims for along its side, in pixels. */
  bump: number;
  /** How much bumps differ in length: their weights run 1 ± spread / 2. */
  spread: number;
  /** A bump's height as a share of its chord, from and to; below one half. */
  bulge: [number, number];
  /** Weights a big bump and a small one take in turn. */
  rhythm?: [number, number];
}

const RULES: Record<CloudShape, CloudRules> = {
  // Round bumps, a little uneven in size.
  puffs: { bump: 56, spread: 0.5, bulge: [0.28, 0.34] },
  // Small, even and almost half-round, like a scalloped edge.
  scallops: { bump: 26, spread: 0.15, bulge: [0.4, 0.44] },
  // Long, low swells.
  billows: { bump: 100, spread: 0.4, bulge: [0.13, 0.17] },
  // A big bump and a small one in turn.
  cumulus: { bump: 59, spread: 0.2, bulge: [0.3, 0.36], rhythm: [1.45, 0.55] },
  // Lengths and heights all over the place.
  pebbles: { bump: 46, spread: 1.1, bulge: [0.18, 0.4] },
};

/** How far the chords sit from the edge; the bumps rise into this band. */
export const CLOUD_INSET = 11;

export type CloudOutlineOptions = {
  /** Which cloud to draw; by default the seed picks one. */
  shape?: CloudShape;
  /** Scales the bumps and the band they rise into, for a larger drawing. */
  scale?: number;
};

/** The cloud a seed gets. */
export function cloudShapeOf(seed: string): CloudShape {
  return CLOUD_SHAPES[cyrb53(`cloud:${seed}`) % CLOUD_SHAPES.length]!;
}

export function cloudOutlinePath(
  width: number,
  height: number,
  seed: string,
  { shape = cloudShapeOf(seed), scale = 1 }: CloudOutlineOptions = {},
): string {
  const inset = CLOUD_INSET * scale;
  if (width <= inset * 2 || height <= inset * 2) return '';
  const rules = RULES[shape];
  const random = seededRandom(seed);
  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  // Clockwise, so a clockwise arc (sweep 1) always bulges outward.
  const corners: [number, number][] = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];

  let path = `M${round(left)} ${round(top)}`;
  for (let side = 0; side < 4; side++) {
    const [fromX, fromY] = corners[side]!;
    const [toX, toY] = corners[(side + 1) % 4]!;
    const length = Math.hypot(toX - fromX, toY - fromY);
    const chords = unevenChords(length, rules.bump * scale, rules, random);
    let travelled = 0;
    for (const chord of chords) {
      travelled += chord;
      const t = travelled / length;
      const [low, high] = rules.bulge;
      // Never taller than the band it rises into.
      const bulge = Math.min(inset, chord * (low + random() * (high - low)));
      const radius = ((chord / 2) ** 2 + bulge ** 2) / (2 * bulge);
      // Rounded up: a radius a hair short of half the chord would make the
      // renderer blow the arc up into a half-circle, out of the band.
      path += ` A${roundUp(radius)} ${roundUp(radius)} 0 0 1 ${round(
        fromX + (toX - fromX) * t,
      )} ${round(fromY + (toY - fromY) * t)}`;
    }
  }
  return `${path} Z`;
}

/** Splits a side into chords around `bump` long, each a little different. */
function unevenChords(
  length: number,
  bump: number,
  { spread, rhythm }: CloudRules,
  random: () => number,
) {
  const count = Math.max(2, Math.round(length / bump));
  const weights = Array.from(
    { length: count },
    (_, index) =>
      (rhythm ? rhythm[index % 2]! : 1) * (1 + (random() - 0.5) * spread),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (weight / total) * length);
}

/** mulberry32 over a djb2 hash of the seed: small, fast, and stable. */
function seededRandom(seed: string) {
  let state = 5381;
  for (let i = 0; i < seed.length; i++)
    state = ((state << 5) + state + seed.charCodeAt(i)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function roundUp(value: number) {
  return Math.ceil(value * 10) / 10;
}
