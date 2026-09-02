import { describe, expect, it } from 'vitest';
import {
  sortPublicDetailTimelineItems,
  sortPublicProjectReferencesByRelationType,
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

describe('sortPublicProjectReferencesByRelationType', () => {
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
      sortPublicProjectReferencesByRelationType(projects).map(
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
