/**
 * The outline of a thought bubble: a box whose every side is a row of round
 * bumps, a little uneven in size so it reads as drawn rather than stamped.
 *
 * The bumps stay inside the box — the path starts `inset` in from each edge
 * and bulges out towards it — so a card can use its own size and padding as
 * they are. The unevenness comes from `seed`, so one card always gets the
 * same cloud, on the server and after hydration alike.
 */
export type CloudOutlineOptions = {
  /** The length a bump aims for along its side, in pixels. */
  bump?: number;
  /** How far the chord sits from the edge; the bumps rise into this band. */
  inset?: number;
};

export function cloudOutlinePath(
  width: number,
  height: number,
  seed: string,
  { bump = 56, inset = 11 }: CloudOutlineOptions = {},
): string {
  if (width <= inset * 2 || height <= inset * 2) return '';
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
    const chords = unevenChords(length, bump, random);
    let travelled = 0;
    for (const chord of chords) {
      travelled += chord;
      const t = travelled / length;
      // A bump about a third of its chord high — round, but short of a
      // half-circle — and never taller than the band it rises into.
      const bulge = Math.min(inset, chord * (0.28 + random() * 0.06));
      const radius = ((chord / 2) ** 2 + bulge ** 2) / (2 * bulge);
      path += ` A${round(radius)} ${round(radius)} 0 0 1 ${round(
        fromX + (toX - fromX) * t,
      )} ${round(fromY + (toY - fromY) * t)}`;
    }
  }
  return `${path} Z`;
}

/** Splits a side into chords around `bump` long, each a little different. */
function unevenChords(length: number, bump: number, random: () => number) {
  const count = Math.max(2, Math.round(length / bump));
  const weights = Array.from({ length: count }, () => 0.75 + random() * 0.5);
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
