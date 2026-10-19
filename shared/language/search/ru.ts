import { stemRussian } from '../stemmers/russian';
import type { SearchLanguagePack } from './types';

/**
 * Stems Snowball leaves apart because a vowel drops out of the word as it
 * changes — «день, дня», «сон, сна», «любовь, любви» — and the rule below
 * does not reach: too short, or not at the end.
 */
const ROOTS: Record<string, string> = {
  ден: 'дн',
  сон: 'сн',
  рот: 'рт',
  лед: 'льд',
  лоб: 'лб',
  мох: 'мх',
  пес: 'пс',
  любов: 'любв',
  церков: 'церкв',
  ветер: 'ветр',
  костер: 'костр',
};

/**
 * The Russian stem a word is searched by.
 *
 * Snowball first. Then whatever vowels it left at the end go, since it keeps
 * one in some forms of a word and not in others — «косплей» is «коспл»,
 * «косплея» is «коспле». Then the vowel that drops out before a final
 * «к», «ц» or «н» goes too — «заметок, заметка», «конец, конца», «уровень,
 * уровня» — in every form, so both meet whether the word has it or not; and
 * «шёл» meets «шла». Measured on two archives this joins what belongs
 * together and almost nothing else; «р» is left out, where it joined «двор»
 * and «дверь».
 */
/** Latin letters as Russian writes them, the longest first. */
const FROM_LATIN: [string, string][] = [
  ['shch', 'щ'],
  ['sch', 'щ'],
  ['sh', 'ш'],
  ['ch', 'ч'],
  ['zh', 'ж'],
  ['kh', 'х'],
  ['ts', 'ц'],
  ['ya', 'я'],
  ['yu', 'ю'],
  ['yo', 'ё'],
  ['ye', 'е'],
  ['ph', 'ф'],
  ['th', 'т'],
  ['ck', 'к'],
  ['oo', 'у'],
  ['ee', 'и'],
  ['a', 'а'],
  ['b', 'б'],
  ['c', 'к'],
  ['d', 'д'],
  ['e', 'е'],
  ['f', 'ф'],
  ['g', 'г'],
  ['h', 'х'],
  ['i', 'и'],
  ['j', 'дж'],
  ['k', 'к'],
  ['l', 'л'],
  ['m', 'м'],
  ['n', 'н'],
  ['o', 'о'],
  ['p', 'п'],
  ['q', 'к'],
  ['r', 'р'],
  ['s', 'с'],
  ['t', 'т'],
  ['u', 'у'],
  ['v', 'в'],
  ['w', 'в'],
  ['x', 'кс'],
  ['y', 'и'],
  ['z', 'з'],
];

/** A normalized Latin word in Russian letters, as it is said. */
function fromLatin(word: string): string {
  let out = '';
  let at = 0;
  while (at < word.length) {
    const pair = FROM_LATIN.find(([latin]) => word.startsWith(latin, at));
    if (pair) {
      out += pair[1];
      at += pair[0].length;
    } else {
      out += word[at];
      at += 1;
    }
  }
  return out;
}

function stemRussianWord(word: string): string {
  const snowball = stemRussian(word);
  const trimmed = snowball.replace(/[аеиоуыэюяйь]+$/u, '');
  const stem = trimmed.length >= 2 ? trimmed : snowball;
  const root = ROOTS[stem];
  if (root) return root;
  if (stem.endsWith('шел')) return `${stem.slice(0, -2)}л`;
  const fleeting = /^(.*[^аеиоуыэюя])[ео]([кцн])$/u.exec(stem);
  return fleeting && fleeting[1]!.length >= 2
    ? `${fleeting[1]}${fleeting[2]}`
    : stem;
}

export const russianSearch: SearchLanguagePack = {
  script: 'cyrillic',
  stem: (word) => (word.length < 3 ? word : stemRussianWord(word)),
  fromLatin,
  stopWords: new Set(
    (
      'и в во не что он на я с со как а то все она так его но да ты к у же ' +
      'вы за бы по только ее мне было вот от меня еще нет о об из ему ' +
      'теперь когда даже ну вдруг ли если уже или ни быть был него до вас ' +
      'нибудь опять уж вам ведь там потом себя ничего ей может они тут где ' +
      'есть надо ней для мы тебя их чем была сам чтоб без будто чего тоже ' +
      'себе под будет ж тогда кто этот того потому этого какой ним здесь ' +
      'этом почти мой тем чтобы нее были куда зачем всех при хоть над тот ' +
      'через эти нас про всего них какая разве эту моя свою этой перед ' +
      'том им всю между ко то-то это эта'
    ).split(' '),
  ),
  keyboard: 'ёйцукенгшщзхъфывапролджэячсмитьбю',
};
