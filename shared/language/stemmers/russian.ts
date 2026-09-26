/**
 * The Snowball stemmer for Russian, after the algorithm published at
 * snowballstem.org/algorithms/russian/stemmer.html.
 *
 * It strips endings, not meaning: «путешествие», «путешествия» and
 * «путешествием» all become «путешеств», which is all a comparison of words
 * needs. Expects a lowercase word; «ё» is read as «е».
 */

const VOWELS = new Set('аеиоуыэюя');

/** Longest first, so the first match is the one Snowball's `among` picks. */
const byLength = (items: string[]) =>
  [...items].sort((left, right) => right.length - left.length);

const PERFECTIVE_GERUND_1 = new Set(['в', 'вши', 'вшись']);
const PERFECTIVE_GERUND = byLength([
  ...PERFECTIVE_GERUND_1,
  'ив',
  'ивши',
  'ившись',
  'ыв',
  'ывши',
  'ывшись',
]);
const ADJECTIVE = byLength([
  'ее',
  'ие',
  'ые',
  'ое',
  'ими',
  'ыми',
  'ей',
  'ий',
  'ый',
  'ой',
  'ем',
  'им',
  'ым',
  'ом',
  'его',
  'ого',
  'ему',
  'ому',
  'их',
  'ых',
  'ую',
  'юю',
  'ая',
  'яя',
  'ою',
  'ею',
]);
const PARTICIPLE_1 = new Set(['ем', 'нн', 'вш', 'ющ', 'щ']);
const PARTICIPLE = byLength([...PARTICIPLE_1, 'ивш', 'ывш', 'ующ']);
const REFLEXIVE = byLength(['ся', 'сь']);
const VERB_1 = new Set([
  'ла',
  'на',
  'ете',
  'йте',
  'ли',
  'й',
  'л',
  'ем',
  'н',
  'ло',
  'но',
  'ет',
  'ют',
  'ны',
  'ть',
  'ешь',
  'нно',
]);
const VERB = byLength([
  ...VERB_1,
  'ила',
  'ыла',
  'ена',
  'ейте',
  'уйте',
  'ите',
  'или',
  'ыли',
  'ей',
  'уй',
  'ил',
  'ыл',
  'им',
  'ым',
  'ен',
  'ило',
  'ыло',
  'ено',
  'ят',
  'ует',
  'уют',
  'ит',
  'ыт',
  'ены',
  'ить',
  'ыть',
  'ишь',
  'ую',
  'ю',
]);
const NOUN = byLength([
  'а',
  'ев',
  'ов',
  'ие',
  'ье',
  'е',
  'иями',
  'ями',
  'ами',
  'еи',
  'ии',
  'и',
  'ией',
  'ей',
  'ой',
  'ий',
  'й',
  'иям',
  'ям',
  'ием',
  'ем',
  'ам',
  'ом',
  'о',
  'у',
  'ах',
  'иях',
  'ях',
  'ы',
  'ь',
  'ию',
  'ью',
  'ю',
  'ия',
  'ья',
  'я',
]);
const SUPERLATIVE = byLength(['ейш', 'ейше']);
const DERIVATIONAL = byLength(['ост', 'ость']);

/** The longest suffix of `word` from `suffixes` lying wholly at or after `limit`. */
function findSuffix(word: string, suffixes: string[], limit: number) {
  return suffixes.find(
    (suffix) => word.length - suffix.length >= limit && word.endsWith(suffix),
  );
}

/**
 * Removes the longest matching ending. Endings of the first group only count
 * after «а» or «я», which stays; a longest match whose condition fails does
 * not fall back to a shorter one, as in Snowball.
 */
function removeEnding(
  word: string,
  suffixes: string[],
  afterAOrYa: Set<string> | undefined,
  limit: number,
): string | undefined {
  const suffix = findSuffix(word, suffixes, limit);
  if (!suffix) return undefined;
  const stem = word.slice(0, -suffix.length);
  if (afterAOrYa?.has(suffix)) {
    const previous = stem.at(-1);
    if (stem.length - 1 < limit || (previous !== 'а' && previous !== 'я'))
      return undefined;
  }
  return stem;
}

function adjectival(word: string, limit: number): string | undefined {
  const stem = removeEnding(word, ADJECTIVE, undefined, limit);
  if (stem === undefined) return undefined;
  return removeEnding(stem, PARTICIPLE, PARTICIPLE_1, limit) ?? stem;
}

/** RV starts after the first vowel; R2 after the second vowel–consonant pair. */
function regions(word: string) {
  let index = 0;
  const gopast = (vowel: boolean) => {
    while (index < word.length && VOWELS.has(word[index]!) !== vowel) index++;
    if (index < word.length) index++;
  };
  gopast(true);
  const rv = index;
  gopast(false);
  gopast(true);
  gopast(false);
  return { rv, r2: index };
}

export function stemRussian(input: string): string {
  const word = input.replaceAll('ё', 'е');
  const { rv, r2 } = regions(word);

  // Step 1: a gerund, or else a reflexive ending and then one of the rest.
  let stem = removeEnding(word, PERFECTIVE_GERUND, PERFECTIVE_GERUND_1, rv);
  if (stem === undefined) {
    const base = removeEnding(word, REFLEXIVE, undefined, rv) ?? word;
    stem =
      adjectival(base, rv) ??
      removeEnding(base, VERB, VERB_1, rv) ??
      removeEnding(base, NOUN, undefined, rv) ??
      base;
  }
  // Step 2.
  if (stem.endsWith('и') && stem.length - 1 >= rv) stem = stem.slice(0, -1);
  // Step 3: a derivational ending inside R2.
  stem = removeEnding(stem, DERIVATIONAL, undefined, Math.max(rv, r2)) ?? stem;
  // Step 4: a superlative, a doubled «н», a soft sign.
  const superlative = removeEnding(stem, SUPERLATIVE, undefined, rv);
  if (superlative !== undefined) stem = superlative;
  if (stem.endsWith('нн') && stem.length - 2 >= rv) stem = stem.slice(0, -1);
  else if (superlative === undefined && stem.endsWith('ь') && stem.length > rv)
    stem = stem.slice(0, -1);
  return stem;
}
