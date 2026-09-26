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

/** Case, compatibility forms and «ё» set aside. */
export function normalizeTermText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replaceAll('ё', 'е');
}

let segmenter: Intl.Segmenter | undefined;

/** The words of a text, normalized, in order. */
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
        ? stemRussian(word)
        : LATIN_WORD.test(word)
          ? stemEnglish(word)
          : word;
  if (stems.size >= STEM_CACHE_LIMIT) stems.clear();
  stems.set(token, stem);
  return stem;
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
