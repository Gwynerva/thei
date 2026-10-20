import { describe, expect, it } from 'vitest';
import {
  addToSearchHistory,
  createSearchHistory,
  parseSearchHistory,
  SEARCH_HISTORY_SIZE,
  searchHistoryKey,
  type SearchHistoryStorage,
} from '../../../app/composables/search-history';
import { SEARCH_QUERY_MAX_LENGTH } from '../../../shared/search/tokens';

function memoryStorage(): SearchHistoryStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    read: (key) => values.get(key) ?? null,
    write: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

describe('search history', () => {
  it('puts the newest first and keeps a dozen', () => {
    let list: string[] = [];
    for (let at = 1; at <= SEARCH_HISTORY_SIZE + 3; at++)
      list = addToSearchHistory(list, `query ${at}`);
    expect(list).toHaveLength(SEARCH_HISTORY_SIZE);
    expect(list[0]).toBe(`query ${SEARCH_HISTORY_SIZE + 3}`);
    expect(list.at(-1)).toBe('query 4');
  });

  it('keeps one query once, as last typed, moved to the top', () => {
    let list = addToSearchHistory([], 'Маяк');
    list = addToSearchHistory(list, 'Териберка');
    list = addToSearchHistory(list, '  маяк   ');
    expect(list).toEqual(['маяк', 'Териберка']);
    expect(addToSearchHistory(list, 'где  я\tбыла')).toEqual([
      'где я была',
      'маяк',
      'Териберка',
    ]);
  });

  it('takes nothing empty, and nothing longer than a query is read', () => {
    expect(addToSearchHistory(['eva'], '   ')).toEqual(['eva']);
    const long = 'слово '.repeat(60);
    expect(addToSearchHistory([], long)[0]).toHaveLength(
      SEARCH_QUERY_MAX_LENGTH,
    );
  });

  it('reads anything but a list of words as none', () => {
    expect(parseSearchHistory(null)).toEqual([]);
    expect(parseSearchHistory('{')).toEqual([]);
    expect(parseSearchHistory('{"a":1}')).toEqual([]);
    expect(parseSearchHistory('["eva", 3, "", " маяк "]')).toEqual([
      'eva',
      'маяк',
    ]);
  });

  it('keeps the owner apart from a visitor, per site', () => {
    const storage = memoryStorage();
    const owner = createSearchHistory(storage, searchHistoryKey('/', 'owner'));
    const visitor = createSearchHistory(
      storage,
      searchHistoryKey('/', 'visitor'),
    );
    owner.remember('черновик');
    visitor.remember('маяк');
    expect(owner.read()).toEqual(['черновик']);
    expect(visitor.read()).toEqual(['маяк']);
    expect(searchHistoryKey('/blog/', 'visitor')).not.toBe(
      searchHistoryKey('/', 'visitor'),
    );
  });

  it('forgets the whole list when cleared', () => {
    const storage = memoryStorage();
    const key = searchHistoryKey('/', 'visitor');
    const history = createSearchHistory(storage, key);
    history.remember('маяк');
    expect(history.clear()).toEqual([]);
    expect(storage.values.has(key)).toBe(false);
  });

  it('goes on without a storage that refuses', () => {
    const history = createSearchHistory(
      {
        read: () => null,
        write: () => {},
        remove: () => {},
      },
      searchHistoryKey('/', 'visitor'),
    );
    expect(history.remember('маяк')).toEqual(['маяк']);
    expect(history.read()).toEqual([]);
  });
});
