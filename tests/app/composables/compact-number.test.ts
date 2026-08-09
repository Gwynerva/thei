import { describe, expect, it } from 'vitest';
import { formatCompactNumber } from '../../../app/composables/compact-number';

describe('formatCompactNumber', () => {
  it.each([
    [999, '999'],
    [1_000, '1K'],
    [1_400, '1.4K'],
    [1_000_000, '1M'],
  ])('formats %i for English', (value, expected) => {
    expect(formatCompactNumber(value, 'en')).toBe(expected);
  });

  it.each([
    [999, '999'],
    [1_000, '1\u00a0тыс.'],
    [1_400, '1,4\u00a0тыс.'],
    [1_000_000, '1\u00a0млн'],
  ])('formats %i for Russian', (value, expected) => {
    expect(formatCompactNumber(value, 'ru')).toBe(expected);
  });
});
