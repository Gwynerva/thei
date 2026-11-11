import {
  contentPlainText,
  normalizeContentData,
  publicContentPlainText,
  type ContentOutputBlock,
  type ContentOutputData,
  type PublicContentOutputData,
} from './content';

/**
 * How much of a text stands in for the summary it does not have.
 *
 * Four lines is what a card can hold before the text stops being a glance and
 * starts being the text itself; the limit is in characters because a card's
 * width is not known here, and it is generous enough that the clamp in CSS,
 * not this number, is usually what ends the text.
 */
export const CONTENT_OPENING_LENGTH = 240;

/**
 * How much an Open Graph card quotes: more than the lines the card gives it,
 * so the card, not this number, is what ends the text.
 */
export const OG_OPENING_LENGTH = 360;

/** A text as stored, or as its public page received it. */
export type ContentOpeningData =
  ContentOutputData | PublicContentOutputData | null | undefined;

/** Whose eyes an opening is for. */
export type ContentOpeningReader = {
  /** Whether the reader is on the private side of the text. */
  includePrivate: boolean;
  /** What stands where a private part of the text is kept from the reader. */
  privateLabel: string;
};

/**
 * How a text begins: its first words, cut at a word and marked as cut.
 *
 * Only what the reader may see is there: the public words, with
 * `[privateLabel]` where a private part stood, so the text around it does not
 * read as one run-on thought; a reader on the private side gets the whole.
 *
 * A text with no word for this reader — every part of it private — has no
 * opening: the marks alone describe nothing, and whoever asked falls back to
 * what it has for a text that says nothing.
 */
export function contentOpening(
  data: ContentOpeningData,
  reader: ContentOpeningReader,
  limit = CONTENT_OPENING_LENGTH,
): string {
  const words = readerPlainText(
    openingBlocksOf(data, reader.privateLabel),
    reader,
  );
  if (!words.replaceAll(`[${reader.privateLabel}]`, '').trim()) return '';
  return cutAtWord(words, limit);
}

/**
 * What describes an entity wherever it is described — on a card, in a link,
 * to a search engine: its summary, or else how its text begins.
 */
export function summaryOrOpening(
  summary: string,
  data: ContentOpeningData,
  reader: ContentOpeningReader,
  limit = CONTENT_OPENING_LENGTH,
): string {
  return summary.trim() || contentOpening(data, reader, limit);
}

/** The words of a normalized stored text the reader may see. */
export function readerPlainText(
  normalized: ContentOutputData,
  reader: ContentOpeningReader,
): string {
  return reader.includePrivate
    ? contentPlainText(normalized)
    : publicContentPlainText(normalized, 'all', {
        privatePlaceholder: reader.privateLabel,
      });
}

/**
 * The text as stored, normalized. A public page receives its private parts
 * already decided — opened whole for the reader on the private side, or stood
 * in for by a placeholder that holds nothing to quote — so each goes back into
 * a private section of its own: an opened part with its blocks, a placeholder
 * with the label it would show, which `includePrivate` then quotes or marks.
 */
export function openingBlocksOf(
  data: ContentOpeningData,
  privateLabel: string,
): ContentOutputData {
  const boundary = (sectionId: string, edge: 'start' | 'end') =>
    ({
      type: 'privateSectionBoundary',
      data: { sectionId, edge },
    }) as unknown as ContentOutputBlock;
  return normalizeContentData({
    ...data,
    blocks: (data?.blocks ?? []).flatMap(
      (block, index): ContentOutputBlock[] => {
        const sectionId = `lead-private-${index}`;
        if (block.type === 'privateSectionPlaceholder')
          return [
            boundary(sectionId, 'start'),
            {
              type: 'paragraph',
              data: { text: `[${privateLabel}]` },
            } as unknown as ContentOutputBlock,
            boundary(sectionId, 'end'),
          ];
        if (block.type === 'privateSectionExpanded')
          return [
            boundary(sectionId, 'start'),
            ...block.data.blocks,
            boundary(sectionId, 'end'),
          ];
        return [block];
      },
    ),
  });
}

/**
 * The opening of a text, cut at a word and marked as cut.
 *
 * Cutting mid-word reads as damage rather than as a quotation, so the cut
 * retreats to the last space before the limit when there is one close enough.
 * An ellipsis ends whatever was cut: without it, an opening shorter than the
 * clamp of its card reads as if the text itself stopped there. It takes the
 * place of a comma, a dash or a full stop the cut would leave hanging.
 */
export function cutAtWord(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  const kept = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${kept.replace(/[\s,;:.·–—-]+$/, '')}…`;
}
