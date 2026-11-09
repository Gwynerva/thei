import { describe, expect, it } from 'vitest';
import {
  libraryFeedMonths,
  libraryFeedNamed,
  libraryFeedNewEntries,
} from '../../../app/composables/asset-library-feed';
import type {
  AssetLibraryEntry,
  AssetSourceType,
} from '../../../shared/asset-library';

function entry(
  assetUuid: string,
  type: AssetSourceType,
  id: string,
  date?: string,
  named?: true,
): AssetLibraryEntry {
  return {
    asset: { assetUuid } as AssetLibraryEntry['asset'],
    touchedAt: 0,
    counts: {} as AssetLibraryEntry['counts'],
    entityCount: 0,
    roles: [],
    place: {
      type,
      id,
      title: id,
      summary: '',
      updatedAt: 0,
      ...(date ? { date } : {}),
      ...(named ? { named } : {}),
    },
  };
}
const ids = (entries: AssetLibraryEntry[]) =>
  entries.map(
    (each) => `${each.place.type}:${each.place.id} ${each.asset.assetUuid}`,
  );

describe('the library run as it is shown', () => {
  it('shows a file in a place once, however the pages overlap', () => {
    const shown = [
      entry('a', 'event', 'e', '2026-11-09'),
      entry('b', 'event', 'e', '2026-11-09'),
    ];
    // An upload before the next page moved the run by one: b comes again,
    // and twice in one answer would stand twice too.
    const fetched = [
      entry('b', 'event', 'e', '2026-11-09'),
      entry('b', 'diary-entry', '2026-11-08', '2026-11-08'),
      entry('c', 'diary-entry', '2026-11-08', '2026-11-08'),
      entry('c', 'diary-entry', '2026-11-08', '2026-11-08'),
    ];
    expect(ids(libraryFeedNewEntries(shown, fetched))).toEqual([
      'diary-entry:2026-11-08 b',
      'diary-entry:2026-11-08 c',
    ]);
    expect(libraryFeedNewEntries(shown, [])).toEqual([]);
  });

  it('gives each place on each of its days a group of its own', () => {
    const months = libraryFeedMonths([
      entry('a', 'unused', 'all', '2026-11-09'),
      entry('b', 'unused', 'all', '2026-11-09'),
      entry('c', 'diary-entry', '2026-11-08', '2026-11-08'),
      entry('d', 'unused', 'all', '2026-11-07'),
      entry('e', 'unused', 'all', '2026-11-06'),
      entry('f', 'unused', 'all', '2026-10-31'),
      entry('g', 'page', 'p'),
      entry('h', 'event', 'named', '2020-01-01', true),
    ]);
    expect(
      months.map((month) => [
        month.key,
        month.count,
        month.places.map((place) => [place.id, place.entries.length]),
      ]),
    ).toEqual([
      [
        '2026-11',
        5,
        [
          ['unused:all 2026-11-09', 2],
          ['diary-entry:2026-11-08 2026-11-08', 1],
          ['unused:all 2026-11-07', 1],
          ['unused:all 2026-11-06', 1],
        ],
      ],
      ['2026-10', 1, [['unused:all 2026-10-31', 1]]],
      ['', 1, [['page:p ', 1]]],
    ]);
    // Every group of a month is told apart, though some are one place.
    for (const month of months)
      expect(new Set(month.places.map((place) => place.id)).size).toBe(
        month.places.length,
      );
    expect(months[0]!.places[2]!.key).toBe('unused:all');
  });

  it('puts the places a search names before the run, each once', () => {
    const named = libraryFeedNamed([
      entry('a', 'event', 'x', '2026-01-01', true),
      entry('b', 'project', 'y', undefined, true),
      entry('c', 'event', 'x', '2026-01-01', true),
      entry('d', 'event', 'z', '2026-01-01'),
    ]);
    expect(
      named.map((group) => [
        group.id,
        group.entries.map((each) => each.asset.assetUuid),
      ]),
    ).toEqual([
      ['event:x', ['a', 'c']],
      ['project:y', ['b']],
    ]);
  });
});
