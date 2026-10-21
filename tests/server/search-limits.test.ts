import { beforeEach, describe, expect, it } from 'vitest';
import {
  resetSearchLimits,
  searchBudgetWait,
  spendSearchTime,
  takeSearch,
} from '../../server/thei/search/limits';

beforeEach(resetSearchLimits);

describe('the search limits', () => {
  it('give each address a bucket that refills', () => {
    const now = 1_000_000;
    for (let at = 0; at < 20; at++) expect(takeSearch('a', now)).toBe(0);
    expect(takeSearch('a', now)).toBeGreaterThan(0);
    // Another address has its own.
    expect(takeSearch('b', now)).toBe(0);
    // Two a second come back.
    expect(takeSearch('a', now + 1000)).toBe(0);
  });

  it('let strangers keep the server busy only a share of the time', () => {
    const now = 1_000_000;
    expect(searchBudgetWait({}, now)).toBe(0);
    spendSearchTime(400, now);
    // Past the ceiling of a search typed, under that of a page rendered.
    expect(searchBudgetWait({}, now)).toBeGreaterThan(0);
    expect(searchBudgetWait({ rendering: true }, now)).toBe(0);
    // The debt drains at the share: 400 ms owed is under 300 a second on.
    expect(searchBudgetWait({}, now + 1000)).toBe(0);
  });

  it('carry no more than a few seconds of debt forward', () => {
    const now = 1_000_000;
    spendSearchTime(60_000, now);
    const wait = searchBudgetWait({}, now);
    expect(wait).toBeLessThanOrEqual(9);
    // Drained in about ten seconds, whatever was spent.
    expect(searchBudgetWait({}, now + 10_000)).toBe(0);
  });
});
