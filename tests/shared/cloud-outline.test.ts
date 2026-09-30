import { describe, expect, it } from 'vitest';
import {
  CLOUD_INSET,
  CLOUD_SHAPES,
  cloudOutlinePath,
  cloudShapeOf,
} from '../../shared/cloud-outline';

/** Every arc of a path as its start, end and radius. */
function arcsOf(path: string) {
  const start = /^M(\S+) (\S+)/.exec(path)!;
  let from = [Number(start[1]), Number(start[2])] as const;
  return [...path.matchAll(/A(\S+) (\S+) (\d) (\d) (\d) (\S+) (\S+)/g)].map(
    ([, radius, radiusY, rotation, large, sweep, x, y]) => {
      const arc = {
        from,
        to: [Number(x), Number(y)] as const,
        radius: Number(radius),
        flags: [radiusY === radius, rotation, large, sweep],
      };
      from = arc.to;
      return arc;
    },
  );
}

/**
 * Points along a clockwise arc shorter than a half-circle, the way an SVG
 * renderer draws it: the centre sits inward of the chord, the bump outward.
 */
function pointsOf({ from, to, radius }: ReturnType<typeof arcsOf>[number]) {
  const chord = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const r = Math.max(radius, chord / 2);
  const along = [(to[0] - from[0]) / chord, (to[1] - from[1]) / chord];
  const outward = [along[1]!, -along[0]!];
  const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const inward = Math.sqrt(r ** 2 - (chord / 2) ** 2);
  const centre = [
    middle[0]! - outward[0]! * inward,
    middle[1]! - outward[1]! * inward,
  ];
  const start = Math.atan2(from[1] - centre[1]!, from[0] - centre[0]!);
  // Sweep 1 turns the angle forward — clockwise on screen, where y runs
  // down — which also settles a half-circle rounding has made of a bump.
  let turn = Math.atan2(to[1] - centre[1]!, to[0] - centre[0]!) - start;
  if (turn < 0) turn += 2 * Math.PI;
  return Array.from({ length: 17 }, (_, step) => {
    const angle = start + (turn * step) / 16;
    return [
      centre[0]! + r * Math.cos(angle),
      centre[1]! + r * Math.sin(angle),
    ] as const;
  });
}

const SIZES: [number, number, number][] = [
  [200, 110, 1],
  [320, 160, 1],
  [900, 180, 1],
  [60, 30, 1],
  [340, 510, 1.6],
];

describe('Cloud outline', () => {
  it('draws the same cloud for the same card', () => {
    expect(cloudOutlinePath(320, 160, '2026-09-23')).toBe(
      cloudOutlinePath(320, 160, '2026-09-23'),
    );
    expect(cloudOutlinePath(320, 160, '2026-09-23')).not.toBe(
      cloudOutlinePath(320, 160, '2026-09-24'),
    );
  });

  it('gives every shape its share of a feed', () => {
    const counts = new Map<string, number>();
    for (let day = 0; day < 500; day++) {
      const date = new Date(Date.UTC(2024, 0, 1 + day))
        .toISOString()
        .slice(0, 10);
      const shape = cloudShapeOf(date);
      counts.set(shape, (counts.get(shape) ?? 0) + 1);
    }
    for (const shape of CLOUD_SHAPES)
      expect(counts.get(shape) ?? 0).toBeGreaterThanOrEqual(60);
  });

  it('draws each shape differently', () => {
    const paths = CLOUD_SHAPES.map((shape) =>
      cloudOutlinePath(320, 160, 'seed', { shape }),
    );
    expect(new Set(paths).size).toBe(CLOUD_SHAPES.length);
  });

  it('keeps every cloud a closed chain of outward bumps inside its band', () => {
    for (const shape of CLOUD_SHAPES)
      for (const [width, height, scale] of SIZES)
        for (let seed = 0; seed < 20; seed++) {
          const inset = CLOUD_INSET * scale;
          const path = cloudOutlinePath(width, height, `${shape}-${seed}`, {
            shape,
            scale,
          });
          const where = `${shape} ${width}×${height} seed ${seed}`;
          expect(path.startsWith(`M${inset} ${inset}`), where).toBe(true);
          expect(path.endsWith('Z'), where).toBe(true);
          const arcs = arcsOf(path);
          expect(arcs.length, where).toBeGreaterThanOrEqual(8);
          // The last arc lands back on the start.
          expect(arcs.at(-1)!.to, where).toEqual([inset, inset]);
          // Round, unrotated, the short way round and bulging outward.
          expect(
            arcs.every(
              ({ flags }) => flags.join() === [true, '0', '0', '1'].join(),
            ),
            where,
          ).toBe(true);
          let outside = 0;
          let deepest = 0;
          for (const arc of arcs)
            for (const [x, y] of pointsOf(arc)) {
              outside = Math.max(outside, -x, -y, x - width, y - height);
              deepest = Math.max(
                deepest,
                Math.min(x, y, width - x, height - y),
              );
            }
          // Coordinates are rounded to a tenth of a pixel.
          expect(outside, where).toBeLessThanOrEqual(0.25);
          // Never into the padding the card's content sits in.
          expect(deepest, where).toBeLessThanOrEqual(inset + 0.25);
        }
  });

  it('draws nothing for a box too small to hold a bump', () => {
    expect(cloudOutlinePath(20, 20, 'seed')).toBe('');
    expect(cloudOutlinePath(300, 30, 'seed', { scale: 2 })).toBe('');
  });
});
