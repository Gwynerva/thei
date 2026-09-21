import { describe, expect, it } from 'vitest';
import { lifeActivityDayTotal, lifeActivityLevel } from '../../shared/life';

describe('lifeActivityDayTotal', () => {
  it('counts every kind of point on the day', () => {
    expect(lifeActivityDayTotal({ event: 2, 'project-stage': 1 })).toBe(3);
    expect(lifeActivityDayTotal(undefined)).toBe(0);
    expect(lifeActivityDayTotal({})).toBe(0);
  });
});

describe('lifeActivityLevel', () => {
  it('scales shades against the busiest day of the year', () => {
    expect(lifeActivityLevel(0, 8)).toBe(0);
    expect(lifeActivityLevel(1, 8)).toBe(1);
    expect(lifeActivityLevel(4, 8)).toBe(2);
    expect(lifeActivityLevel(6, 8)).toBe(3);
    expect(lifeActivityLevel(8, 8)).toBe(4);
  });

  it('gives a year with one thing per day the full shade', () => {
    expect(lifeActivityLevel(1, 1)).toBe(4);
  });
});
