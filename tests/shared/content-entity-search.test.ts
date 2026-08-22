import { describe, expect, it } from 'vitest';
import {
  rankContentEntities,
  type ContentEntitySearchItem,
} from '../../shared/admin/content-entity-search';

const items: ContentEntitySearchItem[] = [
  {
    entityType: 'event',
    entityId: 'e-1',
    title: 'Open Studio',
    summary: 'Event',
    url: '/events/open-studio-Event42/',
    humanReadableSlug: 'open-studio',
    publicId: 'Event42',
    updatedAt: 20,
  },
  {
    entityType: 'project',
    entityId: 'p-1',
    title: 'Studio Archive',
    summary: 'Project',
    url: '/projects/studio-archive-Project7/',
    humanReadableSlug: 'studio-archive',
    publicId: 'Project7',
    updatedAt: 10,
  },
];

describe('combined content entity search', () => {
  it('returns both types and prioritizes title prefixes', () => {
    expect(
      rankContentEntities(items, 'studio').map((item) => item.entityId),
    ).toEqual(['p-1', 'e-1']);
    expect(
      rankContentEntities(items, '').map((item) => item.entityType),
    ).toEqual(['event', 'project']);
  });

  it('also searches canonical slugs and public IDs', () => {
    expect(rankContentEntities(items, 'event42')).toEqual([items[0]]);
    expect(rankContentEntities(items, 'archive')).toEqual([items[1]]);
  });
});
