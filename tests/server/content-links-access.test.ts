import { describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { canResolveContentEntityLink } from '../../server/thei/content-links/access';

describe('content entity link access', () => {
  it.each([
    [ProjectEventAccessLevel.Public, false, true],
    [ProjectEventAccessLevel.LinkOnly, false, true],
    [ProjectEventAccessLevel.Private, false, false],
    [ProjectEventAccessLevel.Public, true, true],
    [ProjectEventAccessLevel.LinkOnly, true, true],
    [ProjectEventAccessLevel.Private, true, true],
  ])('scopes %s for admin=%s', (access, isAdmin, expected) => {
    expect(canResolveContentEntityLink(access, isAdmin)).toBe(expected);
  });
});
