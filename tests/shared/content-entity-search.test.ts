import { describe, expect, it } from 'vitest';
import {
  pickContentEntities,
  rankContentEntities,
  suggestContentEntities,
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

  it('finds an entry by a day with its month written as a word', () => {
    for (const query of ['12 мая 2024', 'May 12', '12 мая', 'мая 2024'])
      expect(
        rankContentEntities(diary, query).map((item) => item.entityId),
        query,
      ).toEqual(['d-1']);
    expect(
      rankContentEntities(diary, 'июнь').map((item) => item.entityId),
    ).toEqual(['d-2']);
  });

  it('puts the newest of the days found equally well first', () => {
    expect(
      rankContentEntities(diary, '2024').map((item) => item.entityId),
    ).toEqual(['d-2', 'd-1']);
  });

  it('puts a whole day before a project only found in part', () => {
    const project = { ...items[1]!, title: 'Notes 2024-05-12 trip' };
    expect(
      rankContentEntities([project, ...diary], '2024-05-12').map(
        (item) => item.entityId,
      ),
    ).toEqual(['d-1', 'p-1']);
  });

  it('does not match an entry by words, since it has no title', () => {
    expect(rankContentEntities([...diary, ...items], 'studio')).toEqual([
      items[1],
      items[0],
    ]);
  });
});

describe('suggestions from the words a link is made over', () => {
  let id = 0;
  function entity(
    title: string,
    updatedAt: number,
    extra: Partial<ContentEntitySearchItem> = {},
  ): ContentEntitySearchItem {
    id += 1;
    return {
      entityType: 'project',
      entityId: `s-${id}`,
      title,
      summary: '',
      url: `/projects/s-${id}/`,
      humanReadableSlug: `s-${id}`,
      updatedAt,
      ...extra,
    };
  }
  /** Ten recent entities that share nothing with the texts below. */
  function fillers() {
    return Array.from({ length: 10 }, (_, index) =>
      entity(`Filler ${String.fromCharCode(97 + index)}`, 100 + index),
    );
  }
  const ids = (items: ContentEntitySearchItem[]) =>
    items.map((item) => item.title);

  it('puts what the words name first, then the most recent, five in all', () => {
    const target = entity('Lantern Harbor', 1);
    const items = [...fillers(), target];
    const suggested = suggestContentEntities(
      items,
      'We sailed to Lantern Harbor',
    );
    expect(ids(suggested)).toEqual([
      'Lantern Harbor',
      'Filler j',
      'Filler i',
      'Filler h',
      'Filler g',
    ]);
  });

  it('matches any one of the words, in any of its forms', () => {
    const museum = entity('Музей космонавтики', 1);
    const trip = entity('Поездка на море', 2);
    const items = [...fillers(), museum, trip];
    const top = suggestContentEntities(items, 'зашли в музея после поездки');
    expect(new Set(top.slice(0, 2))).toEqual(new Set([museum, trip]));
  });

  it('counts short words, so a name like «2B» is found', () => {
    const character = entity('2B', 1, { entityType: 'tag' });
    const items = [...fillers(), character];
    expect(suggestContentEntities(items, 'косплей на 2B')[0]).toBe(character);
  });

  it('matches a short word only whole, and a longer one also at a word start', () => {
    const bike = entity('Велосипед', 1);
    const harbor = entity('Harborfront', 2);
    const items = [...fillers(), bike, harbor];
    const suggested = suggestContentEntities(items, 'в Harbor');
    expect(suggested[0]).toBe(harbor);
    expect(suggested).not.toContain(bike);
  });

  it('lets no word common to the archive match on its own', () => {
    const items = Array.from({ length: 9 }, (_, index) =>
      entity(`Поход ${index + 1}`, index + 1),
    );
    const rare = entity('Поход на Эльбрус', 0);
    const suggested = suggestContentEntities([...items, rare], 'поход');
    expect(suggested).toEqual(rankContentEntities([...items, rare], '', 5));
    expect(suggestContentEntities([...items, rare], 'поход Эльбрус')[0]).toBe(
      rare,
    );
  });

  it('prefers a title found whole over words found apart', () => {
    const scattered = entity('Studio Open Day Archive', 2);
    const whole = entity('Open Studio', 1);
    const items = [...fillers(), scattered, whole];
    expect(suggestContentEntities(items, 'the open studio night')[0]).toBe(
      whole,
    );
  });

  it('prefers a title matched in full over a long one sharing a word', () => {
    const long = entity('Garden notes from the northern valley trip', 2);
    const short = entity('Garden', 1);
    const items = [...fillers(), long, short];
    expect(suggestContentEntities(items, 'garden')[0]).toBe(short);
  });

  it('finds a diary entry by the words of its text, never by its day', () => {
    const entry = entity('2024-05-12', 1, {
      entityType: 'diary-entry',
      date: '2024-05-12',
      summary: 'Весь день шёл дождь над заливом',
    });
    const items = [...fillers(), entry];
    expect(suggestContentEntities(items, 'дождь')[0]).toBe(entry);
    expect(suggestContentEntities(items, '2024-05-12')[0]).not.toBe(entry);
  });

  it('still matches in a small archive', () => {
    const one = entity('Lantern Harbor', 1);
    const two = entity('Quiet Valley', 2);
    expect(ids(suggestContentEntities([one, two], 'harbor'))).toEqual([
      'Lantern Harbor',
      'Quiet Valley',
    ]);
  });

  it('offers the most recent when the words name nothing', () => {
    const items = fillers();
    expect(suggestContentEntities(items, 'nothing here')).toEqual(
      rankContentEntities(items, '', 5),
    );
    expect(suggestContentEntities(items, '   ')).toEqual(
      rankContentEntities(items, '', 5),
    );
  });
});

describe('entities a text links to, picked by their keys', () => {
  function entity(
    entityId: string,
    updatedAt: number,
    entityType: ContentEntitySearchItem['entityType'] = 'project',
  ): ContentEntitySearchItem {
    return {
      entityType,
      entityId,
      title: entityId,
      summary: '',
      url: `/${entityId}/`,
      humanReadableSlug: entityId,
      updatedAt,
    };
  }
  const all = [
    entity('old', 1),
    entity('older', 0),
    entity('recent', 9),
    entity('day', 5, 'diary-entry'),
    entity('meet', 7, 'event'),
  ];
  const ids = (list: ContentEntitySearchItem[]) =>
    list.map((item) => item.entityId);

  it('keeps the order of the keys, whatever was updated last', () => {
    expect(
      ids(
        pickContentEntities(
          all,
          ['diary-entry:day', 'project:older', 'event:meet'],
          5,
        ),
      ),
    ).toEqual(['day', 'older', 'meet']);
  });

  it('skips what is not on offer, and names nothing twice', () => {
    expect(
      ids(
        pickContentEntities(
          all,
          ['project:gone', 'event:meet', 'event:meet', 'project:day'],
          5,
        ),
      ),
    ).toEqual(['meet']);
  });

  it('gives no more than its limit', () => {
    const keys = all.map((item) => `${item.entityType}:${item.entityId}`);
    expect(ids(pickContentEntities(all, keys, 2))).toEqual(['old', 'older']);
  });

  it('gives nothing for no keys', () => {
    expect(pickContentEntities(all, [], 5)).toEqual([]);
  });
});
