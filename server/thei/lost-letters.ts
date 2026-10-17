/** What a decoder puts where it met bytes that are no letter of UTF-8. */
const REPLACEMENT_CHARACTER = String.fromCodePoint(0xfffd);

/** Where a value holds the replacement character, as the path to it. */
function lostLettersAt(value: unknown, path: string[] = []): string[] | null {
  if (typeof value === 'string')
    return value.includes(REPLACEMENT_CHARACTER) ? path : null;
  if (!value || typeof value !== 'object') return null;
  for (const [key, item] of Object.entries(value)) {
    const found = lostLettersAt(item, [...path, key]);
    if (found) return found;
  }
  return null;
}

/**
 * Why a text an app or a model sends cannot be kept, if it holds U+FFFD: a
 * client that sends text in another code page than UTF-8 loses every letter
 * outside ASCII to it, and the archive would keep the marks for words.
 */
export function lostLettersProblem(value: unknown): string | undefined {
  const path = lostLettersAt(value);
  if (!path) return undefined;
  return `${path.join('.') || 'The text'} holds U+FFFD, the mark of letters lost to a wrong encoding: send the text again as UTF-8.`;
}
