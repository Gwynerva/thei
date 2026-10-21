// What the lab puts in a player's browser is what the app reads there: the
// recent searches under the key the quick search looks for, in the shape it
// parses, and a site seeded on another day told apart from today's.
import { describe, expect, it } from 'vitest';
import {
  parseSearchHistory,
  searchHistoryKey,
} from '../../app/composables/search-history';
import { staleSeed } from './archive/dates';
import { searchHistoryEntry, VARIANTS, variantCode } from './variants';

describe('a player’s browser', () => {
  it('holds recent searches where the quick search reads them', () => {
    for (const reader of ['owner', 'visitor'] as const) {
      const entry = searchHistoryEntry(reader, ['maps', 'boat']);
      expect(entry.name).toBe(searchHistoryKey('/', reader));
      expect(parseSearchHistory(entry.value)).toEqual(['maps', 'boat']);
    }
    expect(searchHistoryEntry('visitor', [], '/blog/').name).toBe(
      searchHistoryKey('/blog/', 'visitor'),
    );
  });

  it('names each variant by its screen and theme', () => {
    for (const [code, variant] of Object.entries(VARIANTS))
      expect(variantCode(variant)).toBe(code);
  });
});

describe('a seeded site', () => {
  it('is stale on any day but the one it was seeded for', () => {
    expect(staleSeed('2026-10-20', '2026-10-20')).toBeUndefined();
    expect(staleSeed('2026-10-19', '2026-10-20')).toMatch(/lab build/);
    expect(staleSeed('', '2026-10-20')).toMatch(/unknown day/);
  });
});
