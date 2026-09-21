/**
 * Language-agnostic first-pass normalization applied by all language modules.
 * Converts common ASCII shorthand to proper Unicode typography.
 *
 * Everything here is display-only: it runs on the way out, over a copy, and
 * never touches what was stored.
 */
export function generalNormalize(text: string): string {
  return (
    text
      // Three dots → ellipsis character
      .replace(/\.\.\./g, '…')
      // Double hyphen → em dash
      .replace(/--/g, '—')
      // A dash must never start a line, so it holds on to the word before it.
      .replace(/(\S) +([–—])(?= )/g, '$1 $2')
  );
}

export const NON_BREAKING_SPACE = ' ';

/**
 * Ties short words to whatever follows them, so a line never ends on a
 * preposition. Which words those are is a language's own business; the
 * mechanics are not.
 */
export function bindShortWords(text: string, words: readonly string[]): string {
  if (!words.length) return text;
  const alternatives = words
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  // A lookbehind rather than a captured separator: consuming the space before
  // a word would hide the next word's own separator, and a run of short words
  // ("in the park") would only ever bind its first pair.
  const pattern = new RegExp(
    `(?<=^|[\\s(«“—–])(${alternatives}) +(?=\\S)`,
    'giu',
  );
  return text.replace(pattern, `$1${NON_BREAKING_SPACE}`);
}

/**
 * Runs a normalizer over the text of an inline-markup string without ever
 * looking inside a tag. Attributes — a `href` above all — must survive
 * typography untouched, or the link stops working.
 */
export function normalizeInlineMarkup(
  html: string,
  normalize: (text: string) => string,
): string {
  return html.replace(/[^<]+|<[^>]*>/g, (chunk) =>
    chunk.startsWith('<') ? chunk : normalize(chunk),
  );
}
