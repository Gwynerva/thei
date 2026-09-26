/** Converts Latin text into a lowercase, URL-safe readable slug. */
export function slugify(value: string): string {
  let result = '';

  for (const character of value.toLowerCase()) {
    for (const normalizedCharacter of character.normalize('NFKD')) {
      if (/^[a-z0-9]$/.test(normalizedCharacter)) result += normalizedCharacter;
      else if (!/^[\u0300-\u036f]$/.test(normalizedCharacter)) result += '-';
    }
  }

  return result.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ы: 'y',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ъ: '',
  ь: '',
};

/** Transliterates Cyrillic characters before language-neutral slugification. */
export function transliterateCyrillic(value: string): string {
  return [...value.toLowerCase()]
    .map((character) => CYRILLIC_TO_LATIN[character] ?? character)
    .join('');
}

/**
 * Cleans one readable segment of a URL — a page slug, the readable part of a
 * project or event address, a tag slug — without forcing it into Latin.
 *
 * Unlike `slugify`, which transliterates a title into an ASCII slug, this only
 * removes what a URL cannot carry unambiguously. Letters of any alphabet and
 * digits are kept as they are typed; separators become a single hyphen; and
 * everything that would end a path, start a query or a fragment, or need
 * percent-encoding to survive is dropped.
 */
export function normalizeUrlSegment(value: unknown): string {
  if (typeof value !== 'string') return '';

  let result = '';
  for (const character of value.toLowerCase().normalize('NFC')) {
    if (/[\p{L}\p{N}]/u.test(character)) result += character;
    else if (URL_SEGMENT_SEPARATORS.test(character)) result += '-';
    // Anything else is dropped rather than replaced: a stray quote inside a
    // word should close the gap, not split the word in two.
  }

  return result.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** What a person types to mean "a gap here", all of it becoming one hyphen. */
const URL_SEGMENT_SEPARATORS = /[\s\-_./\|+~]/u;

/**
 * `normalizeUrlSegment` for a field that is still being typed in: a gap at
 * the very end stays as a hyphen, so the next word can follow it. The field
 * is normalized for good once it is left.
 */
export function normalizeUrlSegmentDraft(value: unknown): string {
  const normalized = normalizeUrlSegment(value);
  if (!normalized || typeof value !== 'string') return normalized;
  const last = [...value].at(-1) ?? '';
  return URL_SEGMENT_SEPARATORS.test(last) ? `${normalized}-` : normalized;
}

export function urlSegmentIsValid(value: unknown): value is string {
  return typeof value === 'string' && normalizeUrlSegment(value) === value;
}
