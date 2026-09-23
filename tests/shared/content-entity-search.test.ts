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

describe('diary entries in the entity search', () => {
  const diary: ContentEntitySearchItem[] = [
    {
      entityType: 'diary-entry',
      entityId: 'd-1',
      title: '2024-05-12',
      summary: 'Rain all day',
      url: '/diary/2024-05-12/',
      humanReadableSlug: '2024-05-12',
      date: '2024-05-12',
      updatedAt: 1,
    },
    {
      entityType: 'diary-entry',
      entityId: 'd-2',
      title: '2024-06-03',
      summary: 'Studio day',
      url: '/diary/2024-06-03/',
      humanReadableSlug: '2024-06-03',
      date: '2024-06-03',
      updatedAt: 2,
    },
  ];

  it('finds an entry by its day, written either way round', () => {
    for (const query of ['2024.05.12', '12.05.2024', '12/05/2024', '2024-5-12'])
      expect(
        rankContentEntities(diary, query).map((item) => item.entityId),
      ).toEqual(['d-1']);
  });

  it('finds entries by part of a day', () => {
    expect(
      rankContentEntities(diary, '2024.06').map((item) => item.entityId),
    ).toEqual(['d-2']);
    expect(
      rankContentEntities(diary, '05.2024').map((item) => item.entityId),
    ).toEqual(['d-1']);
    expect(rankContentEntities(diary, '2024')).toHaveLength(2);
  });

  it('does not match an entry by words, since it has no title', () => {
    expect(rankContentEntities([...diary, ...items], 'studio')).toEqual([
      items[1],
      items[0],
    ]);
  });
});
