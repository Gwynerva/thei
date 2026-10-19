/**
 * Texts compared as wholes: a text as a vector of its terms, how alike two
 * are, a phrase standing whole in a text. The terms themselves are read by
 * the language packs (`textTerms`, `shared/search/match.ts`).
 */

/**
 * Case, compatibility forms and «ё» set aside, for comparing: never stored —
 * the keys the database keeps are `shared/identity-key.ts`'s. Lower case by
 * Unicode's own rules, never the server's locale.
 */
export function normalizeTermText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replaceAll('ё', 'е');
}

/** How often each term occurs. */
export type TermCounts = Map<string, number>;

export type TextTerms = {
  counts: TermCounts;
  /** The first word each term was met as, to show a person what matched. */
  surfaces: Map<string, string>;
};

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
