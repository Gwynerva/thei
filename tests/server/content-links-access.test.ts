import { describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { canResolveProjectContentLink } from '../../server/thei/content-links/access';

describe('content link project access', () => {
  it.each([
    [ProjectEventAccessLevel.Public, false, true],
    [ProjectEventAccessLevel.LinkOnly, false, false],
    [ProjectEventAccessLevel.Private, false, false],
    [ProjectEventAccessLevel.Public, true, true],
    [ProjectEventAccessLevel.LinkOnly, true, true],
    [ProjectEventAccessLevel.Private, true, true],
  ])('scopes %s for admin=%s', (access, isAdmin, expected) => {
    expect(canResolveProjectContentLink(access, isAdmin)).toBe(expected);
  });
});
