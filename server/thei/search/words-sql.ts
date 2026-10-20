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
 * row with one query, so the query is read once.
 */
export function useWordsSql(rawDb: Database.Database) {
  if (given.has(rawDb)) return;
  let asked: string | undefined;
  let matches: ReturnType<typeof wordsFilter> = () => false;
  rawDb.function(WORDS_SQL, { deterministic: true }, (text, query) => {
    if (typeof text !== 'string' || typeof query !== 'string') return 0;
    if (query !== asked) {
      asked = query;
      matches = wordsFilter(query);
    }
    return matches([text]) ? 1 : 0;
  });
  given.add(rawDb);
}
