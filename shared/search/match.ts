import { createSearchAnalyzer, type SearchAnalyzer } from '../language/search';
import { normalizeTermText, type TextTerms } from '../text-terms';
import {
  answersQueryWord,
  parseSearchQuery,
  searchTokens,
  type SearchQueryWord,
  type SearchToken,
} from './tokens';

/**
 * The light ways of matching, for what is searched without the index: a
 * short list filtered as it is typed, a name picked from a few, the words of
 * a text weighed against others. Every word is read by the language packs
 * (`shared/language/search/`), as the index reads it, so a picker and the
 * search agree: «дня» finds «День рождения», «ева» finds «EVA», «cafe»
 * finds «Café», and «кот» never finds «скот».
 *
 * - `searchKey`: a value as compared — normalized, spaces folded, a Latin
 *   word's accents dropped. For ids, addresses, file names. Never stored:
 *   what is stored is an identity key (`shared/identity-key.ts`).
 * - `nameTier`: how a typed query stands in a name — whole, at its start, its
 *   words in the order typed or in any order, or as a piece of it — a
 *   picker's last resort; a list's filter takes words only (`wordsFilter`).
 * - `wordsFilter`: whether a query's words all stand in some texts as words.
 * - `textTerms`: the terms of a text, to weigh it against others.
 */

let fallback: SearchAnalyzer | undefined;
/**
 * Reads both scripts whatever the site speaks: enough for names, and the
 * same on the server and in the page.
 */
function nameAnalyzer(): SearchAnalyzer {
  fallback ??= createSearchAnalyzer('en');
  return fallback;
}

export function searchKey(value: string): string {
  return foldText(value).replace(/\s+/gu, ' ').trim();
}

/** A text normalized, a Latin word's accents dropped: «Café» is «cafe». */
function foldText(value: string): string {
  return normalizeTermText(value)
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC');
}

/** A typed query read once, to be stood against many names. */
export interface NameQuery {
  key: string;
  /** Its words, each the start of a word as much as a word. */
  words: SearchQueryWord[];
}

export function prepareNameQuery(
  query: string,
  analyzer: SearchAnalyzer = nameAnalyzer(),
): NameQuery {
  return {
    key: searchKey(query),
    words: parseSearchQuery(query, analyzer, { typing: true }).words.map(
      (word) => ({ ...word, prefix: true }),
    ),
  };
}

/**
 * How a query stands in a name, best first: the whole name; its start; every
 * word of the query in a word of the name, in the order typed or in any
 * order; the query as a piece of the name, «пле» in «Косплей», below all.
 */
const NAME_TIERS = ['exact', 'start', 'ordered', 'words', 'inside'] as const;
export type NameTier = (typeof NAME_TIERS)[number];

/** Where a name stands in a list, by how it was found and what it is. */
export const NAME_RANKS = {
  /** A title, or a name it is known by first. */
  title: { exact: 0, start: 1, ordered: 1.4, words: 1.7, inside: 2 },
  /** Another name the owner gave it: whole, just below a whole title. */
  synonym: { exact: 0.5, start: 3, ordered: 3.4, words: 3.7, inside: 4 },
} as const satisfies Record<string, Record<NameTier, number>>;

/**
 * How a prepared query stands in a name; undefined when it does not. The
 * words are matched by the packs: each word of the query begins a word of
 * the name or is the same word in another form or script, each word of the
 * name answering one word of the query.
 */
export function nameTier(
  query: NameQuery,
  name: string,
  analyzer: SearchAnalyzer = nameAnalyzer(),
): NameTier | undefined {
  if (!query.key || !name) return undefined;
  const key = searchKey(name);
  if (key === query.key) return 'exact';
  if (key.startsWith(query.key)) return 'start';
  const match = matchWords(query.words, searchTokens(name, analyzer));
  if (match) return match.ordered ? 'ordered' : 'words';
  return key.includes(query.key) ? 'inside' : undefined;
}

/** How an identifier — an address, an id — stands: whole, its start, in it. */
export function keyTier(
  query: NameQuery,
  value: string | undefined,
): 'exact' | 'start' | 'inside' | undefined {
  if (!query.key || !value) return undefined;
  const key = searchKey(value);
  if (key === query.key) return 'exact';
  if (key.startsWith(query.key)) return 'start';
  return key.includes(query.key) ? 'inside' : undefined;
}

/**
 * Whether every query word answers its own word of a name; `ordered` when
 * they stand in the order typed. In the order typed first, each after the
 * one before it — the earliest word each time leaves the most room for the
 * rest; then in any order, tried every way, so «ко» does not take «кот» from
 * «кот кофе кот» when another would do.
 */
function matchWords(
  words: readonly SearchQueryWord[],
  tokens: readonly SearchToken[],
): { ordered: boolean } | undefined {
  if (!words.length) return undefined;
  let from = 0;
  let ordered = true;
  for (const word of words) {
    const index = tokens.findIndex(
      (token, at) => at >= from && answersQueryWord(token, word),
    );
    if (index === -1) {
      ordered = false;
      break;
    }
    from = index + 1;
  }
  if (ordered) return { ordered: true };
  const used = tokens.map(() => false);
  const place = (at: number): boolean => {
    if (at === words.length) return true;
    for (const [index, token] of tokens.entries()) {
      if (used[index] || !answersQueryWord(token, words[at]!)) continue;
      used[index] = true;
      if (place(at + 1)) return true;
      used[index] = false;
    }
    return false;
  };
  return place(0) ? { ordered: false } : undefined;
}

interface NameMatch {
  /** The words stand in the order typed. */
  ordered: boolean;
  /** The query is the whole name. */
  exact: boolean;
}

/**
 * How a typed query stands among the words of a name, by its words only:
 * undefined when a word of the query stands nowhere in it.
 */
export function matchName(
  query: string,
  name: string,
  analyzer: SearchAnalyzer = nameAnalyzer(),
): NameMatch | undefined {
  const prepared = prepareNameQuery(query, analyzer);
  const match = matchWords(prepared.words, searchTokens(name, analyzer));
  return match && { ...match, exact: searchKey(name) === prepared.key };
}

const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * A filter of a list, which only keeps or drops: whether every word of a
 * typed query stands in the texts as a word — one it begins, or the same
 * word in another form or script — never inside another word, as «кот»
 * stands in «который». Made once for a query, asked of many rows.
 *
 * A long text is read by a pattern for the words that begin as the query
 * word or its term does, and a Cyrillic word also looks at the Latin ones,
 * which may be written its way (`fromLatin`): only those are read.
 */
export function wordsFilter(
  query: string,
  analyzer: SearchAnalyzer = nameAnalyzer(),
): (texts: readonly string[]) => boolean {
  const patterns = prepareNameQuery(query, analyzer).words.map((word) => {
    let head = 0;
    while (
      head < Math.min(word.term.length, word.word.length) &&
      word.term[head] === word.word[head]
    )
      head++;
    // A letter short of where the word and its term part: a vowel that
    // drops out — «день», «дня» — stands just there.
    head = Math.max(1, head - 1);
    const start = word.word
      .slice(0, head)
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const latin = CYRILLIC.test(word.word) ? '|[a-z]' : '';
    return {
      word,
      pattern: new RegExp(
        `(?<![\\p{L}\\p{N}])(?:${start}${latin})[\\p{L}\\p{N}'’]*`,
        'gu',
      ),
    };
  });
  // A word met again, in this row or the next, is read once.
  const tokens = new Map<string, Pick<SearchToken, 'word' | 'term' | 'alt'>>();
  const tokenOf = (found: string) => {
    let token = tokens.get(found);
    if (!token) {
      if (tokens.size > 50_000) tokens.clear();
      token = {
        word: found,
        term: analyzer.read(found).term,
        alt: analyzer.fromLatin(found),
      };
      tokens.set(found, token);
    }
    return token;
  };
  return (texts) => {
    if (!patterns.length) return false;
    const read = texts.map(foldText);
    return patterns.every(({ word, pattern }) =>
      read.some((text) => {
        for (const [found] of text.matchAll(pattern)) {
          if (answersQueryWord(tokenOf(found), word)) return true;
        }
        return false;
      }),
    );
  };
}

/** The words of a text as the packs read them: each as written and its term. */
export function textWords(
  text: string,
  analyzer: SearchAnalyzer = nameAnalyzer(),
): { word: string; term: string }[] {
  return searchTokens(text, analyzer, 'query').map(({ word, term }) => ({
    word,
    term,
  }));
}

/** The term a single word is compared by. */
export function wordTerm(
  word: string,
  analyzer: SearchAnalyzer = nameAnalyzer(),
): string {
  return analyzer.read(normalizeTermText(word)).term;
}

/**
 * The terms of a text, to weigh it against others (`termVector`). A title
 * says more about a text than any sentence in it, so its words count
 * `titleWeight` times.
 */
export function textTerms(
  { title, text }: { title: string; text: string },
  titleWeight = 2,
  analyzer: SearchAnalyzer = nameAnalyzer(),
): TextTerms {
  const counts = new Map<string, number>();
  const surfaces = new Map<string, string>();
  const add = (source: string, weight: number) => {
    for (const { word, term } of textWords(source, analyzer)) {
      counts.set(term, (counts.get(term) ?? 0) + weight);
      if (!surfaces.has(term)) surfaces.set(term, word);
    }
  };
  add(title, titleWeight);
  add(text, 1);
  return { counts, surfaces };
}

/** Shorter words say little on their own: prepositions, pronouns. */
const MIN_MEANINGFUL_LENGTH = 4;

/**
 * A normalized word too short or too common in any text to say what a text
 * is about: a keyword, a word a tag is recognized by (`vagueWords`).
 */
export function saysLittle(
  word: string,
  analyzer: SearchAnalyzer = nameAnalyzer(),
): boolean {
  return word.length < MIN_MEANINGFUL_LENGTH || analyzer.vague(word);
}
