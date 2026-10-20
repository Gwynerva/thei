import { computed, ref, watch } from 'vue';
import { searchKey } from '#layers/thei/shared/search/match';
import { SEARCH_QUERY_MAX_LENGTH } from '#layers/thei/shared/search/tokens';

/**
 * What a reader searched for, kept in this browser alone: the quick search
 * offers it again while nothing is typed. The owner and a visitor each keep
 * their own, so a visitor never sees what the owner looked for.
 */

/** How many queries a reader's history keeps, the newest first. */
export const SEARCH_HISTORY_SIZE = 12;

export type SearchHistoryReader = 'owner' | 'visitor';

/** The key of a reader's history in `localStorage`, per site. */
export function searchHistoryKey(base: string, reader: SearchHistoryReader) {
  return `thei:search-history:v1:${base}:${reader}`;
}

/**
 * A query put first, as it was typed but for its spaces; an older one that
 * is the same query goes. Two are the same when search compares them so:
 * «Маяк» and «маяк  » are one.
 */
export function addToSearchHistory(list: string[], query: string): string[] {
  const value = query
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, SEARCH_QUERY_MAX_LENGTH);
  if (!value) return list;
  const key = searchKey(value);
  return [value, ...list.filter((entry) => searchKey(entry) !== key)].slice(
    0,
    SEARCH_HISTORY_SIZE,
  );
}

/** A history as stored; anything else reads as none. */
export function parseSearchHistory(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, SEARCH_HISTORY_SIZE);
  } catch {
    return [];
  }
}

export interface SearchHistoryStorage {
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
  remove: (key: string) => void;
}

/** `localStorage`, which a private window or blocked site data may refuse. */
const browserStorage: SearchHistoryStorage = {
  read: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

/** One reader's history over a storage: read, added to, cleared. */
export function createSearchHistory(
  storage: SearchHistoryStorage,
  key: string,
) {
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

/** The history of whoever reads the site in this browser now. */
export function useSearchHistory() {
  const isAdmin = useIsAdmin();
  const base = useRuntimeConfig().app.baseURL;
  const key = computed(() =>
    searchHistoryKey(base, isAdmin.value ? 'owner' : 'visitor'),
  );
  const history = computed(() =>
    createSearchHistory(browserStorage, key.value),
  );
  const entries = computed(() => lists.value[key.value] ?? []);

  function keep(list: string[]) {
    lists.value = { ...lists.value, [key.value]: list };
  }

  /** Reads it again: another tab may have added to it. */
  function refresh() {
    if (import.meta.client) keep(history.value.read());
  }
  // Signing in or out changes whose history it is.
  watch(key, refresh, { immediate: true });

  return {
    entries,
    refresh,
    remember(query: string) {
      if (import.meta.client) keep(history.value.remember(query));
    },
    clear() {
      if (import.meta.client) keep(history.value.clear());
    },
  };
}
