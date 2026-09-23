import { describe, expect, it } from 'vitest';
import { countLifeActivityEntities } from '../../server/thei/public/life-activity';

describe('countLifeActivityEntities', () => {
  it('counts each entity once, by kind, and only what is visible', () => {
    expect(
      countLifeActivityEntities([
        { entityKind: 'project-stage', entityUuid: 's1', visible: true },
        { entityKind: 'project-stage', entityUuid: 's1', visible: true },
        { entityKind: 'project-stage', entityUuid: 's2', visible: true },
        { entityKind: 'event', entityUuid: 'e1', visible: false },
        { entityKind: 'diary-entry', entityUuid: 'd1', visible: true },
        { entityKind: 'profile-status', entityUuid: 'x', visible: true },
      ]),
    ).toEqual({ 'project-stage': 2, 'diary-entry': 1 });
  });
});
