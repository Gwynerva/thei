import {
  createSearchAnalyzer,
  type SearchAnalyzer,
} from '../language/search';
import { normalizeTermText } from '../text-terms';
import { answersQueryWord, parseSearchQuery, searchTokens } from './tokens';

/**
 * The light ways of matching, for what is searched without the index: a
 * short list filtered as it is typed, a name picked from a few.
 *
 * - `searchKey`: a value as compared — normalized, spaces folded, a Latin
 *   word's accents dropped. For ids, addresses, file names: compare keys.
 * - `matchName`: a typed query against a name, word by word — «косплей
 *   шедо» finds «Косплей на Шедоухарт», never «кот» in «который».
 *
 * Never a substring inside a word of a text: what finds words in texts is the
 * index (`server/thei/search/`).
 */

let fallback: SearchAnalyzer | undefined;
/** Reads both scripts whatever the site speaks: enough for names. */
function defaultAnalyzer() {
  fallback ??= createSearchAnalyzer('en');
  return fallback;
}

export function searchKey(value: string): string {
  return normalizeTermText(value)
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface NameMatch {
  /** The words stand in the order typed. */
  ordered: boolean;
  /** The query is the whole name. */
  exact: boolean;
}

/**
 * How a typed query stands among the words of a name: each word of the query
 * begins a word of the name or is the same word in another form, each word of
 * the name answering one word of the query. The last word may be unfinished.
 * Undefined when a word of the query stands nowhere.
 */
export function matchName(
  query: string,
  name: string,
  analyzer: SearchAnalyzer = defaultAnalyzer(),
): NameMatch | undefined {
  const words = parseSearchQuery(query, analyzer, { typing: true }).words.map(
    (word) => ({ ...word, prefix: true }),
  );
  if (!words.length) return undefined;
  const tokens = searchTokens(name, analyzer);
  // Every way each query word may be answered, longest query words first:
  // a short word must not take the only word a longer one could have.
  const options = words.map((word) =>
    tokens.flatMap((token, at) => (answersQueryWord(token, word) ? [at] : [])),
  );
  const order = words.map((_, at) => at).sort((a, b) => words[b]!.word.length - words[a]!.word.length);
  const taken = new Array<number>(words.length);
  const used = new Set<number>();
  const place = (step: number): boolean => {
    if (step === order.length) return true;
    const index = order[step]!;
    for (const at of options[index]!) {
      if (used.has(at)) continue;
      used.add(at);
      taken[index] = at;
      if (place(step + 1)) return true;
      used.delete(at);
    }
    return false;
  };
  if (!place(0)) return undefined;
  return {
    ordered: taken.every((at, index) => index === 0 || at > taken[index - 1]!),
    exact: searchKey(query) === searchKey(name),
  };
}
