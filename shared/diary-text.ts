import {
  contentPlainText,
  publicContentPlainText,
  type ContentOutputData,
} from './content';

/**
 * How much of an entry stands in for the title it does not have.
 *
 * Four lines is what a card can hold before the text stops being a glance and
 * starts being the entry itself; the limit is in characters because a card's
 * width is not known here, and it is generous enough that the clamp in CSS,
 * not this number, is usually what ends the text.
 */
export const DIARY_EXCERPT_LENGTH = 240;

/**
 * The opening of an entry, cut at a word.
 *
 * Cutting mid-word reads as damage rather than as an excerpt, so the cut
 * retreats to the last space before the limit when there is one close enough.
 */
export function diaryExcerpt(
  text: string,
  limit = DIARY_EXCERPT_LENGTH,
): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/**
 * The excerpt of an entry's body as a given reader may see it.
 *
 * A private section inside a public entry stays private in its excerpt too:
 * a stranger's card is cut from the public text only, never from the whole.
 */
export function diaryContentExcerpt(
  data: ContentOutputData | null | undefined,
  includePrivate: boolean,
): string {
  return diaryExcerpt(
    includePrivate ? contentPlainText(data) : publicContentPlainText(data),
  );
}
