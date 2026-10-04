import { describe, expect, it } from 'vitest';
import {
  createdAndUpdatedTimelineItems,
  publicDetailSummary,
  sortPublicDetailTimelineItems,
} from '#layers/thei/app/components/public/public-detail';
import { emptyPublicReferences } from '#layers/thei/shared/public-references';

describe('publicDetailSummary', () => {
  const labels = { links: 'Links', files: 'Files' };
  const summary = (data: Parameters<typeof publicDetailSummary>[0]) =>
    publicDetailSummary(data, labels).map(({ label, value }) => [label, value]);

  it('counts the lists of the panel in the order the panel shows them', () => {
    const references = emptyPublicReferences();
    references.links.manual.push({} as never);
    references.links.content.push({} as never, {} as never);
    references.files.shared.push({} as never);
    expect(summary({ references })).toEqual([
      ['Links', 3],
      ['Files', 1],
    ]);
  });

  it('leaves out empty lists and whatever is not a list worth opening', () => {
    const references = emptyPublicReferences();
    references.files.content.push({} as never);
    expect(
      summary({
        contents: [{} as never, {} as never],
        chronology: [{ icon: 'plus', label: 'Created', date: '2024-05-12' }],
        periods: [
          {
            startDate: '2024-05-12',
            endDate: '2024-05-13',
            precision: 'exact',
            precisionNote: '',
            label: 'Trip',
          },
        ],
        tags: [{} as never, {} as never, {} as never],
        references,
      }),
    ).toEqual([['Files', 1]]);
  });

  it('says nothing for a panel without lists', () => {
    expect(summary({ references: emptyPublicReferences() })).toEqual([]);
  });
});

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

describe('createdAndUpdatedTimelineItems', () => {
  const labels = { created: 'Created', updated: 'Updated' };

  it('lists the creation and a later edit', () => {
    expect(
      createdAndUpdatedTimelineItems(
        { createdAt: '2024-05-12', updatedAt: '2024-07-02' },
        labels,
      ),
    ).toEqual([
      { icon: 'history', label: 'Updated', date: '2024-07-02' },
      { icon: 'plus', label: 'Created', date: '2024-05-12' },
    ]);
  });

  it('is one line when the chronology holds no later edit', () => {
    expect(
      createdAndUpdatedTimelineItems({ createdAt: '2024-05-12' }, labels),
    ).toEqual([{ icon: 'plus', label: 'Created', date: '2024-05-12' }]);
  });
});
