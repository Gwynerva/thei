import type Database from 'better-sqlite3';
import { wordsFilter } from '#layers/thei/shared/search/match';

/** The SQL function that finds a query's words in a text: `thei_words(text, query)`. */
export const WORDS_SQL = 'thei_words';

const given = new WeakSet<Database.Database>();

/**
 * Gives a connection the site's own reading of words in SQL, once — SQLite's
 * lower() knows only Latin letters. Words are found as words, each at the
 * start of a word or in another of its forms (`wordsFilter`): «кошка диван»
 * finds «кошка спит на диване», never «кот» inside «скот». Asked row after
 * row with the same few queries, so each is read once.
 */
export function useWordsSql(rawDb: Database.Database) {
  if (given.has(rawDb)) return;
  // One statement may ask several queries row after row — the file library
  // asks each word it reads as a filter on its own — so a few are kept.
  const filters = new Map<string, ReturnType<typeof wordsFilter>>();
  rawDb.function(WORDS_SQL, { deterministic: true }, (text, query) => {
    if (typeof text !== 'string' || typeof query !== 'string') return 0;
    let matches = filters.get(query);
    if (!matches) {
      if (filters.size >= 16) filters.delete(filters.keys().next().value!);
      matches = wordsFilter(query);
      filters.set(query, matches);
    }
    return matches([text]) ? 1 : 0;
  });
  given.add(rawDb);
}
