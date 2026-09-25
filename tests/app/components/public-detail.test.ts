import { describe, expect, it } from 'vitest';
import {
  createdAndUpdatedTimelineItems,
  diaryTimelineItems,
  firstAndLastTimelineItems,
  sortPublicDetailTimelineItems,
  sortPublicEntityReferencesByRelationType,
} from '#layers/thei/app/components/public/public-detail';

describe('sortPublicDetailTimelineItems', () => {
  it('orders chronology from newest to oldest', () => {
    const items = [
      { icon: 'plus' as const, label: 'Создание', date: '2024-01-10' },
      { icon: 'history' as const, label: 'Обновление', date: '2026-08-01' },
      { icon: 'event' as const, label: 'Этап', date: '2025-04-03' },
    ];

    expect(
      sortPublicDetailTimelineItems(items).map((item) => item.label),
    ).toEqual(['Обновление', 'Этап', 'Создание']);
  });

  it('preserves the source order when dates match', () => {
    const items = [
      { icon: 'plus' as const, label: 'Первый', date: '2026-08-01' },
      { icon: 'history' as const, label: 'Второй', date: '2026-08-01' },
    ];

    expect(
      sortPublicDetailTimelineItems(items).map((item) => item.label),
    ).toEqual(['Первый', 'Второй']);
  });
});

describe('sortPublicEntityReferencesByRelationType', () => {
  it('groups relation types while preserving the admin order inside a type', () => {
    const project = (
      title: string,
      relationType: 'related' | 'influencing' | 'dependent',
    ) => ({
      title,
      summary: title,
      href: `/${title}`,
      iconMedia: { kind: 'image' as const, src: `/${title}.webp` },
      relationType,
    });
    const projects = [
      project('dependent-one', 'dependent'),
      project('related-one', 'related'),
      project('influencing-one', 'influencing'),
      project('related-two', 'related'),
      project('dependent-two', 'dependent'),
    ];

    expect(
      sortPublicEntityReferencesByRelationType(projects).map(
        (item) => item.title,
      ),
    ).toEqual([
      'related-one',
      'related-two',
      'influencing-one',
      'dependent-one',
      'dependent-two',
    ]);
  });
});

describe('firstAndLastTimelineItems', () => {
  const labels = {
    icon: 'calendar' as const,
    first: 'First',
    last: 'Last',
    only: 'Only',
  };
  const pick = (item: { date: string; href: string }) => item;

  it('names the earliest and the latest of several', () => {
    expect(
      firstAndLastTimelineItems(
        [
          { date: '2025-03-01', href: '/b/' },
          { date: '2024-01-01', href: '/a/' },
          { date: '2026-05-01', href: '/c/' },
        ],
        pick,
        labels,
      ),
    ).toEqual([
      { icon: 'calendar', label: 'First', date: '2024-01-01', href: '/a/' },
      { icon: 'calendar', label: 'Last', date: '2026-05-01', href: '/c/' },
    ]);
  });

  it('collapses a single item into one line under the plain name', () => {
    expect(
      firstAndLastTimelineItems(
        [{ date: '2024-01-01', href: '/a/' }],
        pick,
        labels,
      ),
    ).toEqual([
      { icon: 'calendar', label: 'Only', date: '2024-01-01', href: '/a/' },
    ]);
  });

  it('collapses two marks that land on the same day and page', () => {
    expect(
      firstAndLastTimelineItems(
        [
          { date: '2024-01-01', href: '#statuses' },
          { date: '2024-01-01', href: '#statuses' },
        ],
        pick,
        labels,
      ),
    ).toHaveLength(1);
  });

  it('says nothing when there is nothing', () => {
    expect(firstAndLastTimelineItems([], pick, labels)).toEqual([]);
  });
});

describe('createdAndUpdatedTimelineItems', () => {
  const labels = { created: 'Created', updated: 'Updated' };

  it('lists the creation and a later edit', () => {
    expect(
      createdAndUpdatedTimelineItems(
        { createdAt: '2024-05-12', updatedAt: '2024-07-02' },
        labels,
      ),
    ).toEqual([
      { icon: 'plus', label: 'Created', date: '2024-05-12' },
      { icon: 'history', label: 'Updated', date: '2024-07-02' },
    ]);
  });

  it('is one line when the chronology holds no later edit', () => {
    expect(
      createdAndUpdatedTimelineItems({ createdAt: '2024-05-12' }, labels),
    ).toEqual([{ icon: 'plus', label: 'Created', date: '2024-05-12' }]);
  });
});

describe('diaryTimelineItems', () => {
  const labels = { day: 'Day', created: 'Created', updated: 'Updated' };
  /** The lines as the timeline shows them, newest first. */
  const items = (date: string, createdAt: string, updatedAt?: string) =>
    sortPublicDetailTimelineItems(
      diaryTimelineItems(
        { date, chronology: { createdAt, updatedAt }, href: '/life/' },
        labels,
      ),
    ).map(({ label, date, href }) => ({ label, date, href }));

  it('shows the day, the writing and the edit apart when all differ', () => {
    expect(items('2024-05-12', '2024-06-01', '2024-07-02')).toEqual([
      { label: 'Updated', date: '2024-07-02', href: undefined },
      { label: 'Created', date: '2024-06-01', href: undefined },
      { label: 'Day', date: '2024-05-12', href: '/life/' },
    ]);
  });

  it('lets the writing stand for the day it was written on', () => {
    expect(items('2024-05-12', '2024-05-12', '2024-07-02')).toEqual([
      { label: 'Updated', date: '2024-07-02', href: undefined },
      { label: 'Created', date: '2024-05-12', href: '/life/' },
    ]);
  });

  it('never lets an edit stand for the day, even one made on it', () => {
    expect(items('2024-05-12', '2024-05-01', '2024-05-12')).toEqual([
      { label: 'Updated', date: '2024-05-12', href: undefined },
      { label: 'Day', date: '2024-05-12', href: '/life/' },
      { label: 'Created', date: '2024-05-01', href: undefined },
    ]);
  });

  it('places the day of an entry written ahead after its edits', () => {
    expect(items('2024-05-12', '2024-05-01', '2024-05-05')).toEqual([
      { label: 'Day', date: '2024-05-12', href: '/life/' },
      { label: 'Updated', date: '2024-05-05', href: undefined },
      { label: 'Created', date: '2024-05-01', href: undefined },
    ]);
  });

  it('collapses into one line when everything happened on the day', () => {
    expect(items('2024-05-12', '2024-05-12')).toEqual([
      { label: 'Created', date: '2024-05-12', href: '/life/' },
    ]);
    expect(items('2024-05-12', '2024-05-12', '2024-05-12')).toHaveLength(1);
  });

  it('keeps a backdated entry to two lines when it was never edited later', () => {
    expect(items('2024-05-12', '2024-06-01')).toEqual([
      { label: 'Created', date: '2024-06-01', href: undefined },
      { label: 'Day', date: '2024-05-12', href: '/life/' },
    ]);
    expect(items('2024-05-12', '2024-06-01', '2024-06-01')).toHaveLength(2);
  });
});
