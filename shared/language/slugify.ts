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
