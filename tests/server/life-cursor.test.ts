import { describe, expect, it } from 'vitest';
import { decodeLifeCursor, encodeLifeCursor } from '../../server/thei/public/life';

describe('Life cursor', () => {
  it('round-trips through an opaque transport value', () => {
    const cursor = encodeLifeCursor('2026-08-22');
    expect(cursor).not.toBe('2026-08-22');
    expect(cursor).not.toContain('/');
    expect(decodeLifeCursor(cursor)).toBe('2026-08-22');
  });
});
