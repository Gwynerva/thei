import { stemEnglish } from './language/stemmers/english';
import { stemRussian } from './language/stemmers/russian';

/**
 * Words as a comparison of texts sees them.
 *
 * Text is read in words, not characters, so a short word never matches inside
 * a longer one, and every word is reduced to its stem, so the forms of a word
 * count as the word. Russian and English words each go through their own
 * stemmer whatever the site's language, because a life is rarely written in
 * one language only; any other word is kept as it is.
 */

/**
 * Case, compatibility forms and «ё» set aside. Lower case by Unicode's own
 * rules, never the server's locale: a Turkish one would turn «I» into «ı» in
 * keys the database keeps (`tags.normalizedTitle`).
 */
export function normalizeTermText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replaceAll('ё', 'е');
}

let segmenter: Intl.Segmenter | undefined;

/** The words of a text, normalized, in order. */
/**
 * How a word of the dictionary is looked up: case, compatibility forms, «ё»
 * and doubled spaces set aside — the same in its window and on the server.
 */
export function termKey(display: string): string {
  return normalizeTermText(display).replace(/\s+/g, ' ').trim();
}

export function wordTokens(text: string): string[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
  const tokens: string[] = [];
  for (const { segment, isWordLike } of segmenter.segment(
    normalizeTermText(text),
  )) {
    if (isWordLike) tokens.push(segment);
  }
  return tokens;
}

const CYRILLIC_WORD = /^[а-я]+$/u;
const LATIN_WORD = /^[a-z]+$/u;
const POSSESSIVE = /['’]s?$/u;
const STEM_CACHE_LIMIT = 100_000;
const stems = new Map<string, string>();

/** The stem of a normalized word. */
export function stemTerm(token: string): string {
  const cached = stems.get(token);
  if (cached !== undefined) return cached;
  const word = token.replace(POSSESSIVE, '');
  const stem =
    word.length < 3
      ? word
      : CYRILLIC_WORD.test(word)
        ? russianStem(word)
        : LATIN_WORD.test(word)
          ? stemEnglish(word)
          : word;
  if (stems.size >= STEM_CACHE_LIMIT) stems.clear();
  stems.set(token, stem);
  return stem;
}

/**
 * Snowball leaves a vowel at the end of some stems and not of others of the
 * same word — «косплей» is «коспл», «косплея» is «коспле»; «музей», «музея»
 * likewise. Dropping what vowels remain at the end brings them together.
 */
function russianStem(word: string) {
  const stem = stemRussian(word);
  const trimmed = stem.replace(/[аеиоуыэюяйь]+$/u, '');
  return trimmed.length >= 2 ? trimmed : stem;
}

/**
 * How the words of a typed query stand among the words of a name: each word
 * of the query is the start of a word of the name or has its stem, each word
 * of the name answering one word of the query — so «косплей шедоухарт»
 * finds «Косплей на Шедоухарт», and «косплея шедо», typed halfway, too.
 * `ordered` when they stand in the order typed; undefined when a word of the
 * query stands nowhere. Both lists are normalized words (`wordTokens`).
 */
export function matchQueryWords(
  query: readonly string[],
  words: readonly string[],
): { ordered: boolean } | undefined {
  if (!query.length) return undefined;
  // In the order typed first, each word after the one before it: the
  // earliest word each time leaves the most room for the rest.
  let from = 0;
  let ordered = true;
  for (const queryWord of query) {
    const index = words.findIndex(
      (word, at) => at >= from && answersQueryWord(queryWord, word),
    );
    if (index === -1) {
      ordered = false;
      break;
    }
    from = index + 1;
  }
  if (ordered) return { ordered };
  // In any order: each query word its own word of the name, tried every way —
  // «ко» must not take «косплей» from «косплей» when «кота» would do.
  const used = words.map(() => false);
  const place = (at: number): boolean => {
    if (at === query.length) return true;
    for (const [index, word] of words.entries()) {
      if (used[index] || !answersQueryWord(query[at]!, word)) continue;
      used[index] = true;
      if (place(at + 1)) return true;
      used[index] = false;
    }
    return false;
  };
  return place(0) ? { ordered: false } : undefined;
}

/** Whether a word answers a word of a query: begins with it, or is a form of it. */
function answersQueryWord(queryWord: string, word: string) {
  return word.startsWith(queryWord) || stemTerm(word) === stemTerm(queryWord);
}

/**
 * A filter of a list, which only keeps or drops: whether every word of a
 * typed query stands in the texts as a word — one that begins with it, or
 * one of its forms (`answersQueryWord`) — never inside another word, as
 * «кот» stands in «который». The texts are normalized (`normalizeTermText`).
 *
 * Long texts are read by a pattern for the words that begin as the query
 * word or its stem does, and only those are stemmed.
 */
export function queryWordsFilter(
  query: readonly string[],
): (texts: readonly string[]) => boolean {
  const patterns = query.map((queryWord) => {
    const stem = stemTerm(queryWord);
    let head = 0;
    while (
      head < Math.min(stem.length, queryWord.length) &&
      stem[head] === queryWord[head]
    )
      head++;
    const start = (head ? queryWord.slice(0, head) : queryWord).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    return {
      queryWord,
      words: new RegExp(`(?<![\\p{L}\\p{N}])${start}[\\p{L}\\p{N}]*`, 'gu'),
    };
  });
  return (texts) =>
    patterns.length > 0 &&
    patterns.every(({ queryWord, words }) =>
      texts.some((text) => {
        for (const [word] of text.matchAll(words))
          if (answersQueryWord(queryWord, word)) return true;
        return false;
      }),
    );
}

/** How often each stem occurs. */
export type TermCounts = Map<string, number>;

export type TextTerms = {
  counts: TermCounts;
  /** The first word each stem was met as, to show a person what matched. */
  surfaces: Map<string, string>;
};

/**
 * The terms of a text. A title says more about a text than any sentence in
 * it, so its words count `titleWeight` times.
 */
export function readTerms(
  { title, text }: { title: string; text: string },
  titleWeight = 2,
): TextTerms {
  const counts: TermCounts = new Map();
  const surfaces = new Map<string, string>();
  const add = (source: string, weight: number) => {
    for (const token of wordTokens(source)) {
      const stem = stemTerm(token);
      counts.set(stem, (counts.get(stem) ?? 0) + weight);
      if (!surfaces.has(stem)) surfaces.set(stem, token);
    }
  };
  add(title, titleWeight);
  add(text, 1);
  return { counts, surfaces };
}

/** A text as a unit-length vector of TF-IDF weights. */
export type TermVector = Map<string, number>;

/**
 * Weighs each term by how often the text uses it and how rarely the rest of
 * the archive does. Single letters carry nothing and are left out.
 */
export function termVector(
  counts: TermCounts,
  idf: (term: string) => number,
): TermVector {
  const vector: TermVector = new Map();
  let length = 0;
  for (const [term, count] of counts) {
    if (term.length < 2) continue;
    const weight = (1 + Math.log(count)) * idf(term);
    vector.set(term, weight);
    length += weight * weight;
  }
  length = Math.sqrt(length);
  if (length > 0)
    for (const [term, weight] of vector) vector.set(term, weight / length);
  return vector;
}

export function cosineSimilarity(left: TermVector, right: TermVector) {
  const [small, large] =
    left.size <= right.size ? [left, right] : [right, left];
  let sum = 0;
  for (const [term, weight] of small) sum += weight * (large.get(term) ?? 0);
  return sum;
}

/** The inverse document frequency of a term over `size` documents. */
export function inverseDocumentFrequency(size: number, frequency: number) {
  return Math.log((size + 1) / (frequency + 1)) + 1;
}

/**
 * Whether a normalized phrase stands in a normalized text as a whole: not
 * glued to letters or digits on either side. This is how names made of more
 * than letters — «c++», «c#», «.net» — are found.
 */
export function containsPhrase(normalizedText: string, phrase: string) {
  if (!phrase) return false;
  let index = normalizedText.indexOf(phrase);
  while (index !== -1) {
    const before = normalizedText[index - 1];
    const after = normalizedText[index + phrase.length];
    if (!isWordCharacter(before) && !isWordCharacter(after)) return true;
    index = normalizedText.indexOf(phrase, index + 1);
  }
  return false;
}

function isWordCharacter(character: string | undefined) {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character);
}

/** Shorter words say little on their own: prepositions, pronouns. */
const MIN_MEANINGFUL_LENGTH = 4;
/**
 * Words that say nothing of what a text is about, for an archive still too
 * small for their frequency to rule them out. Stems of the normalized forms.
 */
const FUNCTION_STEMS = new Set(
  [
    'который',
    'которая',
    'которые',
    'этого',
    'этот',
    'этой',
    'этом',
    'этих',
    'было',
    'была',
    'были',
    'будет',
    'очень',
    'тоже',
    'также',
    'когда',
    'потом',
    'сейчас',
    'просто',
    'только',
    'можно',
    'нужно',
    'чтобы',
    'если',
    'даже',
    'всего',
    'всех',
    'себя',
    'меня',
    'тебя',
    'него',
    'своей',
    'свой',
    'того',
    'тому',
    'есть',
    'вообще',
    'ещё',
    'уже',
    'тогда',
    'там',
    'тут',
    'that',
    'this',
    'with',
    'from',
    'have',
    'were',
    'will',
    'would',
    'there',
    'their',
    'about',
    'which',
    'what',
    'when',
    'into',
    'than',
    'then',
    'them',
    'they',
    'been',
    'also',
    'just',
    'some',
    'more',
    'very',
    'around',
    'after',
    'before',
    'could',
    'should',
    'other',
    'these',
    'those',
    'where',
    'while',
  ].map((word) => stemTerm(normalizeTermText(word))),
);

/**
 * A normalized word too short or too common in any text to say what a text
 * is about: a keyword, a word a tag is recognized by.
 */
export function saysLittle(token: string): boolean {
  return (
    token.length < MIN_MEANINGFUL_LENGTH || FUNCTION_STEMS.has(stemTerm(token))
  );
}
