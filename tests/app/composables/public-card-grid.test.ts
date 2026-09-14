import { describe, expect, it } from 'vitest';
import { publicCardGridFirstItemIsWide } from '../../../app/composables/public-card-grid';

describe('publicCardGridFirstItemIsWide', () => {
  it.each([
    [1, true],
    [2, false],
    [3, true],
  ])('resolves the leading card layout for %i items', (count, expected) => {
    expect(publicCardGridFirstItemIsWide(count)).toBe(expected);
  });
});
