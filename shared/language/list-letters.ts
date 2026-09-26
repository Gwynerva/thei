/**
 * `lower-alpha` and `upper-alpha` redefined in the letters of the site's
 * language, so a lettered list in the content counts "а, б, в" on a Russian
 * site.
 *
 * These are the names the list tool stores and that the editor and the page
 * both count in. Redefining them, rather than naming styles of our own,
 * reaches both at once without teaching either of them a mapping, and nothing
 * else on the site counts in letters. A language that counts in Latin gets
 * nothing, and the browser's own styles stay.
 */
export function listLetterCounterStyles(
  letters: string | undefined,
  languageCode: string,
): string {
  if (!letters) return '';
  const symbols = (value: string) =>
    [...value].map((letter) => `'${letter}'`).join(' ');
  return [
    `@counter-style lower-alpha { system: alphabetic; symbols: ${symbols(letters)}; }`,
    `@counter-style upper-alpha { system: alphabetic; symbols: ${symbols(letters.toLocaleUpperCase(languageCode))}; }`,
  ].join('\n');
}
