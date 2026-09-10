import { describe, expect, it } from 'vitest';
import {
  decodeLifeCursor,
  encodeLifeCursor,
  selectLatestContentLifePoints,
} from '../../server/thei/public/life';

describe('Life cursor', () => {
  it('round-trips through an opaque transport value', () => {
    const cursor = encodeLifeCursor('2026-08-22');
    expect(cursor).not.toBe('2026-08-22');
    expect(cursor).not.toContain('/');
    expect(decodeLifeCursor(cursor)).toBe('2026-08-22');
  });

  it('filters profile history before limiting latest content points', () => {
    const points = [
      { entityKind: 'profile-status' as const, id: 'status' },
      { entityKind: 'profile-avatar' as const, id: 'avatar' },
      { entityKind: 'page' as const, id: 'page' },
      { entityKind: 'project' as const, id: 'project' },
    ];

    expect(selectLatestContentLifePoints(points, 1)).toEqual([points[2]]);
    expect(selectLatestContentLifePoints(points, 3)).toEqual([
      points[2],
      points[3],
    ]);
  });
});
