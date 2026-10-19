import type { SearchAnalyzer } from '../language/search';
import { normalizeTermText } from '../text-terms';

/** The longest query read, in characters; the rest is dropped. */
export const SEARCH_QUERY_MAX_LENGTH = 200;
/** The most words a query is read for. */
export const SEARCH_QUERY_MAX_WORDS = 8;
/** The shortest last word read as the start of a word still being typed. */
export const SEARCH_PREFIX_MIN_LENGTH = 2;

/** A word of a text, where it stands in it, and how search reads it. */
export interface SearchToken {
  /** The word as written, normalized. */
  word: string;
  term: string;
  stop: boolean;
  /** Where it stands in the text as given, so a snippet can mark it. */
  start: number;
  end: number;
}

let segmenter: Intl.Segmenter | undefined;

/** Signs that belong to a name: «C++», «C#», «F#». */
const NAME_SIGNS = /^(\+\+|#)(?![\p{L}\p{N}])/u;
const SHORT_LATIN = /^[a-z]{1,2}$/iu;
/** What joins the parts of one written word: «Vue.js», «NieR:Automata», «U.S». */
const INNER_JOINS = /[.:]/u;
const PARTS = /[\p{L}\p{N}]+/gu;
const ABBREVIATION = /^[\p{Lu}\p{N}]{2,6}$/u;

/**
 * How a text is read: `index` for what is searched in, `query` for what is
 * searched for. They differ only where a written word has parts, so that each
 * side meets the other however the word was written:
 *
 * - «Vue.js», «NieR:Automata»: a text gives the whole word and each part; a
 *   query asks for the parts, so «vue» finds «Vue.js» and «vue.js» finds
 *   «Vue и JS».
 * - «e-mail», «Wi-Fi», «USB-C»: a text gives each part and the parts written
 *   together; a query asks for them written together, so «email» and
 *   «e-mail» find each other.
 */
export type SearchTokensMode = 'index' | 'query';

/**
 * The words of a text, read the way search reads them, with their places in
 * the text as given. Each word is normalized on its own, so the places stay
 * true however normalizing would have moved the rest of the text. «C++»,
 * «C#» and «.NET» stay whole. A short name — «2B», «9S», «JS», «МГУ» — is a
 * word like any other and is read as written: too short to have an ending.
 */
export function searchTokens(
  text: string,
  analyzer: SearchAnalyzer,
  mode: SearchTokensMode = 'index',
): SearchToken[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
  const segments = [...segmenter.segment(text)];
  const tokens: SearchToken[] = [];
  const make = (start: number, end: number, written = text.slice(start, end)) => {
    const word = normalizeTermText(written);
    // Written in capitals, it is a name and has no ending: «МГУ», «IT», «2B».
    if (ABBREVIATION.test(written) && /\p{Lu}/u.test(written))
      return { word, term: word, stop: false, start, end };
    return { word, ...analyzer.read(word), start, end };
  };
  for (let at = 0; at < segments.length; at++) {
    const { segment, index, isWordLike } = segments[at]!;
    if (!isWordLike) continue;
    let start = index;
    let end = index + segment.length;
    if (SHORT_LATIN.test(segment)) {
      const sign = NAME_SIGNS.exec(text.slice(end));
      if (sign) end += sign[0].length;
    }
    if (
      segments[at - 1]?.segment === '.' &&
      /^net$/iu.test(segment) &&
      (at < 2 || /\s$/u.test(segments[at - 2]!.segment))
    )
      start -= 1;

    // Words joined by hyphens, with nothing else between them.
    const group = [{ start, end }];
    while (
      segments[at + 1]?.segment === '-' &&
      segments[at + 2]?.isWordLike
    ) {
      const next = segments[at + 2]!;
      group.push({ start: next.index, end: next.index + next.segment.length });
      at += 2;
    }
    if (group.length > 1) {
      const joined = make(
        group[0]!.start,
        group.at(-1)!.end,
        group.map((part) => text.slice(part.start, part.end)).join(''),
      );
      if (mode === 'query') tokens.push(joined);
      else tokens.push(...group.map((part) => make(part.start, part.end)), joined);
      continue;
    }

    const whole = text.slice(start, end);
    if (INNER_JOINS.test(whole.slice(1, -1))) {
      const parts = [...whole.matchAll(PARTS)].map((part) =>
        make(start + part.index, start + part.index + part[0].length),
      );
      if (mode === 'index') tokens.push(make(start, end));
      tokens.push(...parts);
      continue;
    }
    tokens.push(make(start, end));
  }
  return tokens;
}

export interface SearchQueryWord {
  word: string;
  term: string;
  /**
   * Every term the word may stand for in a text: its stem, and the word as
   * typed — a text keeps a name in both (`searchIndexTerms`), so «Годо»
   * finds «Годо» above the many «года», and «мгу» finds «МГУ», whose
   * capitals kept it whole.
   */
  terms: string[];
  stop: boolean;
  /** The last word, still being typed: whatever it begins counts. */
  prefix: boolean;
}

export interface SearchQuery {
  /** The query as read: trimmed, cut to its length. */
  text: string;
  words: SearchQueryWord[];
  /** Phrases in double quotes, each the terms that must stand in a row. */
  phrases: string[][];
}

/**
 * A typed query, as search reads it: words, and phrases in double quotes.
 * `typing` reads the last word as unfinished — the start of a word, unless
 * the query ends with a space.
 */
export function parseSearchQuery(
  value: string,
  analyzer: SearchAnalyzer,
  { typing = false }: { typing?: boolean } = {},
): SearchQuery {
  const text = value.slice(0, SEARCH_QUERY_MAX_LENGTH);
  const phrases: string[][] = [];
  const loose = text.replace(/"([^"]*)"/gu, (_, inner: string) => {
    const terms = searchTokens(inner, analyzer, 'query').map(
      (token) => token.term,
    );
    if (terms.length) phrases.push(terms);
    return ' ';
  });
  const tokens = searchTokens(loose, analyzer, 'query').slice(
    0,
    SEARCH_QUERY_MAX_WORDS,
  );
  const open = typing && !/[\s"]$/u.test(text);
  const words = tokens.map(
    (token, at): SearchQueryWord => ({
      word: token.word,
      term: token.term,
      terms: [...new Set([token.term, analyzer.read(token.word).term, token.word])],
      stop: token.stop,
      prefix:
        open &&
        at === tokens.length - 1 &&
        token.end === loose.trimEnd().length &&
        token.word.length >= SEARCH_PREFIX_MIN_LENGTH,
    }),
  );
  return { text: text.trim(), words, phrases };
}

/** The words a query insists on: all of them when they are all stop words. */
export function requiredQueryWords(query: SearchQuery): SearchQueryWord[] {
  const meaningful = query.words.filter((word) => !word.stop || word.prefix);
  return meaningful.length ? meaningful : query.words;
}

/** Whether a word of a text answers a word of a query. */
export function answersQueryWord(
  token: Pick<SearchToken, 'word' | 'term'>,
  queryWord: SearchQueryWord,
): boolean {
  return (
    queryWord.terms.includes(token.term) ||
    (queryWord.prefix && token.word.startsWith(queryWord.word))
  );
}

/**
 * The terms a text gives the index for one of its words: the stem, and for a
 * word written with a capital — a name, most of the time — the word as
 * written too, so a query for the name as typed ranks it above the other
 * words that share its stem.
 */
export function searchIndexTerms(text: string, token: SearchToken): string[] {
  const first = text.charAt(token.start);
  return token.word !== token.term && first !== first.toLowerCase()
    ? [token.term, token.word]
    : [token.term];
}
