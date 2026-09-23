import { describe, expect, it } from 'vitest';
import { profileAge } from '../../shared/profile';
import { canAppendEmptyStatus } from '../../shared/status';

describe('profile helpers', () => {
  it('only permits an empty status after a regular one', () => {
    expect(canAppendEmptyStatus()).toBe(false);
    expect(canAppendEmptyStatus('empty')).toBe(false);
    expect(canAppendEmptyStatus('regular')).toBe(true);
  });

  it('calculates age at the birthday boundary and rejects future dates', () => {
    expect(profileAge('2000-09-09', new Date('2026-09-08T23:59:59Z'))).toBe(25);
    expect(profileAge('2000-09-09', new Date('2026-09-09T00:00:00Z'))).toBe(26);
    expect(
      profileAge('2027-01-01', new Date('2026-09-09T00:00:00Z')),
    ).toBeUndefined();
  });
});
