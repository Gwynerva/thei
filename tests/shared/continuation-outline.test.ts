import { describe, expect, it } from 'vitest';
import { continuationOutlinePath } from '../../shared/continuation-outline';

/** Every point a path passes through or bends towards, as numbers. */
function coordinates(path: string) {
  const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return numbers;
}

describe('continuationOutlinePath', () => {
  it('ripples the top of a start and keeps it inside the box', () => {
    const path = continuationOutlinePath(300, 120, 'up', 8);
    expect(path.startsWith('M0 4')).toBe(true);
    // A whole number of waves: the ripple ends where it began, at the right.
    expect(path).toContain('300 4V112');
    const ys = [...path.matchAll(/Q[\d.]+ ([\d.]+) [\d.]+ ([\d.]+)/g)].flatMap(
      (match) => [Number(match[1]), Number(match[2])],
    );
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(8);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('ripples the bottom of an end, with round corners at the top', () => {
    const path = continuationOutlinePath(300, 120, 'down', 8);
    expect(path.startsWith('M0 8A8 8 0 0 1 8 0H292')).toBe(true);
    expect(path).toContain('V116');
    const values = coordinates(path);
    expect(Math.max(...values)).toBe(300);
    expect(Math.min(...values)).toBe(0);
  });

  it('draws nothing for a box too small to hold the ripple', () => {
    expect(continuationOutlinePath(0, 100, 'up', 8)).toBe('');
    expect(continuationOutlinePath(100, 6, 'down', 8)).toBe('');
  });
});
