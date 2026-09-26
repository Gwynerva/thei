/**
 * The Snowball stemmer for English ("Porter2"), after the algorithm published
 * at snowballstem.org/algorithms/english/stemmer.html.
 *
 * «travel», «travels», «travelled» and «travelling» all become «travel».
 * Expects a lowercase word of Latin letters.
 */

const VOWELS = new Set('aeiouy');
const DOUBLES = ['bb', 'dd', 'ff', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt'];
const LI_ENDINGS = new Set('cdeghkmnrt');

/** Words the rules would get wrong, and what they should become. */
const EXCEPTIONS: Record<string, string> = {
  skis: 'ski',
  skies: 'sky',
  dying: 'die',
  lying: 'lie',
  tying: 'tie',
  idly: 'idl',
  gently: 'gentl',
  ugly: 'ugli',
  early: 'earli',
  only: 'onli',
  singly: 'singl',
  sky: 'sky',
  news: 'news',
  howe: 'howe',
  atlas: 'atlas',
  cosmos: 'cosmos',
  bias: 'bias',
  andes: 'andes',
};
/** Left alone once plural endings are gone. */
const AFTER_STEP_1A = new Set([
  'inning',
  'outing',
  'canning',
  'herring',
  'earring',
  'proceed',
  'exceed',
  'succeed',
]);
const R1_PREFIXES = ['gener', 'commun', 'arsen'];

const STEP_2: Array<[string, string]> = [
  ['ization', 'ize'],
  ['ational', 'ate'],
  ['fulness', 'ful'],
  ['ousness', 'ous'],
  ['iveness', 'ive'],
  ['tional', 'tion'],
  ['biliti', 'ble'],
  ['lessli', 'less'],
  ['entli', 'ent'],
  ['ation', 'ate'],
  ['alism', 'al'],
  ['aliti', 'al'],
  ['ousli', 'ous'],
  ['iviti', 'ive'],
  ['fulli', 'ful'],
  ['enci', 'ence'],
  ['anci', 'ance'],
  ['abli', 'able'],
  ['izer', 'ize'],
  ['ator', 'ate'],
  ['alli', 'al'],
  ['bli', 'ble'],
  ['ogi', 'og'],
  ['li', ''],
];
const STEP_3: Array<[string, string]> = [
  ['ational', 'ate'],
  ['tional', 'tion'],
  ['alize', 'al'],
  ['icate', 'ic'],
  ['iciti', 'ic'],
  ['ative', ''],
  ['ical', 'ic'],
  ['ness', ''],
  ['ful', ''],
];
const STEP_4 = [
  'ement',
  'ance',
  'ence',
  'able',
  'ible',
  'ment',
  'ant',
  'ent',
  'ism',
  'ate',
  'iti',
  'ous',
  'ive',
  'ize',
  'ion',
  'al',
  'er',
  'ic',
];

const isVowel = (word: string, index: number) => VOWELS.has(word[index]!);

/** R1 starts after the first non-vowel that follows a vowel; R2 likewise in R1. */
function regionAfter(word: string, start: number) {
  for (let index = start + 1; index < word.length; index++) {
    if (!isVowel(word, index) && isVowel(word, index - 1)) return index + 1;
  }
  return word.length;
}

/**
 * A short syllable ends at `end`: a vowel followed by a non-vowel other than
 * w, x or Y and preceded by a non-vowel, or a vowel at the very start
 * followed by a non-vowel.
 */
function endsWithShortSyllable(word: string, end = word.length) {
  if (end === 2) return isVowel(word, 0) && !isVowel(word, 1);
  if (end < 3) return false;
  const last = word[end - 1]!;
  return (
    !isVowel(word, end - 3) &&
    isVowel(word, end - 2) &&
    !isVowel(word, end - 1) &&
    last !== 'w' &&
    last !== 'x' &&
    last !== 'Y'
  );
}

function containsVowel(value: string) {
  for (let index = 0; index < value.length; index++)
    if (isVowel(value, index)) return true;
  return false;
}

export function stemEnglish(input: string): string {
  let word = input.startsWith("'") ? input.slice(1) : input;
  if (EXCEPTIONS[word]) return EXCEPTIONS[word]!;
  if (word.length <= 2) return word;

  // A consonant y is kept apart from the vowel y.
  word = word.replace(/^y/, 'Y').replace(/([aeiouy])y/g, '$1Y');

  const prefix = R1_PREFIXES.find((item) => word.startsWith(item));
  const r1 = prefix ? prefix.length : regionAfter(word, 0);
  const r2 = regionAfter(word, r1);
  const inR1 = (suffix: string) => word.length - suffix.length >= r1;
  const inR2 = (suffix: string) => word.length - suffix.length >= r2;
  const replace = (suffix: string, next: string) => {
    word = word.slice(0, word.length - suffix.length) + next;
  };

  // Step 0: possessives.
  for (const suffix of ["'s'", "'s", "'"]) {
    if (word.endsWith(suffix)) {
      replace(suffix, '');
      break;
    }
  }

  // Step 1a: plurals.
  if (word.endsWith('sses')) replace('sses', 'ss');
  else if (word.endsWith('ied') || word.endsWith('ies'))
    replace(word.slice(-3), word.length > 4 ? 'i' : 'ie');
  else if (word.endsWith('us') || word.endsWith('ss')) {
    // Kept.
  } else if (word.endsWith('s') && containsVowel(word.slice(0, -2)))
    replace('s', '');

  if (AFTER_STEP_1A.has(word)) return word;

  // Step 1b: past tenses and gerunds.
  const eed = ['eedly', 'eed'].find((suffix) => word.endsWith(suffix));
  if (eed) {
    if (inR1(eed)) replace(eed, 'ee');
  } else {
    const ed = ['ingly', 'edly', 'ing', 'ed'].find((suffix) =>
      word.endsWith(suffix),
    );
    if (ed && containsVowel(word.slice(0, -ed.length))) {
      replace(ed, '');
      if (['at', 'bl', 'iz'].some((suffix) => word.endsWith(suffix)))
        word += 'e';
      else if (DOUBLES.some((suffix) => word.endsWith(suffix)))
        word = word.slice(0, -1);
      else if (word.length <= r1 && endsWithShortSyllable(word)) word += 'e';
    }
  }

  // Step 1c: y after a consonant that is not the first letter.
  if (
    (word.endsWith('y') || word.endsWith('Y')) &&
    word.length > 2 &&
    !isVowel(word, word.length - 2)
  )
    replace(word.slice(-1), 'i');

  // Step 2.
  const step2 = STEP_2.find(([suffix]) => word.endsWith(suffix));
  if (step2 && inR1(step2[0])) {
    const [suffix, next] = step2;
    const before = word[word.length - suffix.length - 1];
    if (suffix === 'ogi') {
      if (before === 'l') replace(suffix, next);
    } else if (suffix === 'li') {
      if (before && LI_ENDINGS.has(before)) replace(suffix, next);
    } else replace(suffix, next);
  }

  // Step 3.
  const step3 = STEP_3.find(([suffix]) => word.endsWith(suffix));
  if (step3 && inR1(step3[0])) {
    const [suffix, next] = step3;
    if (suffix !== 'ative' || inR2(suffix)) replace(suffix, next);
  }

  // Step 4.
  const step4 = STEP_4.find((suffix) => word.endsWith(suffix));
  if (step4 && inR2(step4)) {
    const before = word[word.length - step4.length - 1];
    if (step4 !== 'ion' || before === 's' || before === 't') replace(step4, '');
  }

  // Step 5.
  if (word.endsWith('e')) {
    if (
      inR2('e') ||
      (inR1('e') && !endsWithShortSyllable(word, word.length - 1))
    )
      replace('e', '');
  } else if (word.endsWith('ll') && inR2('l')) replace('l', '');

  return word.replaceAll('Y', 'y');
}
