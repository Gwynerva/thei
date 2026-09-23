import { describe, expect, it } from 'vitest';
import { cloudOutlinePath } from '../../shared/cloud-outline';

describe('Cloud outline', () => {
  it('draws the same cloud for the same card', () => {
    expect(cloudOutlinePath(320, 160, '2026-09-23')).toBe(
      cloudOutlinePath(320, 160, '2026-09-23'),
    );
    expect(cloudOutlinePath(320, 160, '2026-09-23')).not.toBe(
      cloudOutlinePath(320, 160, '2026-09-24'),
    );
  });

  it('is a closed chain of outward arcs that stays inside the box', () => {
    const path = cloudOutlinePath(320, 160, 'seed');
    expect(path.startsWith('M11 11')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    const arcs = [...path.matchAll(/A(\S+) \S+ 0 0 1 (\S+) (\S+)/g)];
    expect(arcs.length).toBeGreaterThanOrEqual(8);
    for (const [, , x, y] of arcs) {
      expect(Number(x)).toBeGreaterThanOrEqual(11);
      expect(Number(x)).toBeLessThanOrEqual(309);
      expect(Number(y)).toBeGreaterThanOrEqual(11);
      expect(Number(y)).toBeLessThanOrEqual(149);
    }
    // The last arc lands back on the start.
    expect(arcs.at(-1)!.slice(2)).toEqual(['11', '11']);
  });

  it('draws nothing for a box too small to hold a bump', () => {
    expect(cloudOutlinePath(20, 20, 'seed')).toBe('');
  });
});
