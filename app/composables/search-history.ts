import { computed, ref, watch, type Ref } from 'vue';
import { searchKey } from '#layers/thei/shared/search/match';
import { SEARCH_QUERY_MAX_LENGTH } from '#layers/thei/shared/search/tokens';
import { browserStorage, type BrowserStorage } from './browser-storage';

/**
 * What a reader searched for, kept in this browser alone: the quick search
 * offers it again while nothing is typed. The owner and a visitor each keep
 * their own, so a visitor never sees what the owner looked for.
 */

/** How many queries a reader's history keeps, the newest first. */
export const SEARCH_HISTORY_SIZE = 12;

type SearchHistoryReader = 'owner' | 'visitor';

/** The key of a reader's history in `localStorage`, per site. */
export function searchHistoryKey(base: string, reader: SearchHistoryReader) {
  return `thei:search-history:v1:${base}:${reader}`;
}

/**
 * A query put first, as it was typed but for its spaces; an older one that
 * is the same query goes. Two are the same when search compares them so:
 * «Маяк» and «маяк  » are one. A query longer than search reads is cut by
 * its characters, never inside one.
 */
export function addToSearchHistory(list: string[], query: string): string[] {
  const value = Array.from(query.replace(/\s+/gu, ' ').trim())
    .slice(0, SEARCH_QUERY_MAX_LENGTH)
    .join('')
    .trim();
  if (!value) return list;
  const key = searchKey(value);
  return [value, ...list.filter((entry) => searchKey(entry) !== key)].slice(
    0,
    SEARCH_HISTORY_SIZE,
  );
}

/**
 * A history as stored, read as if each query were added again from the
 * oldest: the same query twice is kept once, the newer. Anything else reads
 * as none.
 */
export function parseSearchHistory(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .reduceRight<string[]>(addToSearchHistory, []);
  } catch {
    return [];
  }
}

/** One reader's history over a storage: read, added to, cleared. */
export function createSearchHistory(storage: BrowserStorage, key: string) {
  const read = () => parseSearchHistory(storage.read(key));
  function save(list: string[]) {
    if (list.length) storage.write(key, JSON.stringify(list));
    else storage.remove(key);
    return list;
  }
  return {
    read,
    remember: (query: string) => save(addToSearchHistory(read(), query)),
    clear: () => save([]),
  };
}

/**
 * The lists this tab has read, by their key: the quick search and the search
 * page show and add to the same one.
 */
const lists = ref<Record<string, string[]>>({});

/**
 * The history kept under `key`, which changes with whoever reads the site,
 * in `storage` — none while a page is rendered on the server.
 */
export function useSearchHistoryAt(
  key: Readonly<Ref<string>>,
  storage: BrowserStorage | undefined,
) {
  const history = computed(
    () => storage && createSearchHistory(storage, key.value),
  );
  const entries = computed(() => lists.value[key.value] ?? []);

  function keep(list: string[] | undefined) {
    if (list) lists.value = { ...lists.value, [key.value]: list };
  }

  /** Reads it again: another tab may have added to it. */
  function refresh() {
    keep(history.value?.read());
  }
  // Signing in or out changes whose history it is.
  watch(key, refresh, { immediate: true });

  return {
    entries,
    refresh,
    remember(query: string) {
      keep(history.value?.remember(query));
    },
    clear() {
      keep(history.value?.clear());
    },
  };
}

/** The history of whoever reads the site in this browser now. */
export function useSearchHistory() {
  const isAdmin = useIsAdmin();
  const { base } = useSiteUrl();
  return useSearchHistoryAt(
    computed(() => searchHistoryKey(base, isAdmin.value ? 'owner' : 'visitor')),
    import.meta.client ? browserStorage : undefined,
  );
}

/**
 * Forgets what the owner searched for in this browser, as signing out does:
 * whoever uses it next is not shown the owner's queries.
 */
export function forgetOwnerSearchHistory(
  base: string,
  storage: BrowserStorage = browserStorage,
) {
  const key = searchHistoryKey(base, 'owner');
  lists.value = {
    ...lists.value,
    [key]: createSearchHistory(storage, key).clear(),
  };
}
