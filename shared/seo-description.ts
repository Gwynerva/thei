/** Search engines show roughly this many characters of a description. */
export const SEO_DESCRIPTION_LIMIT = 160;

/**
 * Joins description parts into one line that fits the snippet length, cut at
 * a word boundary with an ellipsis instead of mid-word.
 */
export function buildSeoDescription(
  parts: (string | null | undefined)[],
  limit = SEO_DESCRIPTION_LIMIT,
): string {
  const sentences = parts
    .map((part) => part?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
    .map((part, index, all) =>
      index < all.length - 1 && !/[.!?…:;]$/u.test(part) ? `${part}.` : part,
    );
  const text = sentences.join(' ');
  const characters = Array.from(text);
  if (characters.length <= limit) return text;

  const cut = characters.slice(0, limit - 1).join('');
  const boundary = cut.search(/\s+\S*$/u);
  const head = (boundary > limit / 2 ? cut.slice(0, boundary) : cut).replace(
    /[\s.,;:!?…—–-]+$/u,
    '',
  );
  return `${head}…`;
}
