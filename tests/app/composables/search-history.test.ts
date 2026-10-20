import { describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  addToSearchHistory,
  createSearchHistory,
  forgetOwnerSearchHistory,
  parseSearchHistory,
  SEARCH_HISTORY_SIZE,
  searchHistoryKey,
  useSearchHistoryAt,
} from '../../../app/composables/search-history';
import type { BrowserStorage } from '../../../app/composables/browser-storage';
import { SEARCH_QUERY_MAX_LENGTH } from '../../../shared/search/tokens';

function memoryStorage(): BrowserStorage & {
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
    // Cut by characters: a character of two halves is never cut in two.
    const kept = addToSearchHistory([], '\u{1F30A}'.repeat(300))[0]!;
    expect(kept).toBe('\u{1F30A}'.repeat(SEARCH_QUERY_MAX_LENGTH));
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

  it('reads a stored list as it would have been kept: the same query once, the newer', () => {
    expect(
      parseSearchHistory(
        JSON.stringify(['маяк', 'Териберка', '  Маяк ', 'где  я была']),
      ),
    ).toEqual(['маяк', 'Териберка', 'где я была']);
    const long = Array.from({ length: 20 }, (_, at) => `query ${at}`);
    expect(parseSearchHistory(JSON.stringify(long))).toEqual(
      long.slice(0, SEARCH_HISTORY_SIZE),
    );
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

  it('forgets the owner’s list on signing out, and leaves a visitor’s', () => {
    const storage = memoryStorage();
    createSearchHistory(storage, searchHistoryKey('/', 'owner')).remember(
      'черновик',
    );
    createSearchHistory(storage, searchHistoryKey('/', 'visitor')).remember(
      'маяк',
    );
    forgetOwnerSearchHistory('/', storage);
    expect(storage.values.has(searchHistoryKey('/', 'owner'))).toBe(false);
    expect(storage.values.has(searchHistoryKey('/', 'visitor'))).toBe(true);
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

describe('the history of whoever reads the site', () => {
  it('follows signing in and out, each reader with their own list', async () => {
    const storage = memoryStorage();
    const base = '/switching/';
    const history = useSearchHistoryAt(
      ref(searchHistoryKey(base, 'visitor')),
      storage,
    );
    const key = ref(searchHistoryKey(base, 'visitor'));
    const reading = useSearchHistoryAt(key, storage);
    reading.remember('маяк');
    expect(reading.entries.value).toEqual(['маяк']);
    // Another reader of the same list in the tab sees it at once.
    expect(history.entries.value).toEqual(['маяк']);

    key.value = searchHistoryKey(base, 'owner');
    await nextTick();
    expect(reading.entries.value).toEqual([]);
    reading.remember('черновик');
    expect(reading.entries.value).toEqual(['черновик']);

    key.value = searchHistoryKey(base, 'visitor');
    await nextTick();
    expect(reading.entries.value).toEqual(['маяк']);
  });

  it('reads and keeps nothing where there is no storage, as on the server', () => {
    const history = useSearchHistoryAt(
      ref(searchHistoryKey('/server/', 'visitor')),
      undefined,
    );
    history.remember('маяк');
    expect(history.entries.value).toEqual([]);
  });
});
