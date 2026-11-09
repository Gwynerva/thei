import { SEO_DESCRIPTION_LIMIT } from './seo-description';
import {
  contentBlockIsInPrivateSection,
  contentBlockTextParts,
  contentPlainText,
  normalizeContentData,
  normalizedContentPrivateSectionRanges,
  publicContentPlainText,
  type ContentOutputBlock,
  type ContentOutputData,
  type PublicContentOutputData,
} from './content';

/**
 * How much of an entry stands in for the title it does not have.
 *
 * Four lines is what a card can hold before the text stops being a glance and
 * starts being the entry itself; the limit is in characters because a card's
 * width is not known here, and it is generous enough that the clamp in CSS,
 * not this number, is usually what ends the text.
 */
export const DIARY_LEAD_LENGTH = 240;

/** What a lead is built from: the day's text and the names of its excerpts. */
export type DiaryLeadParts = {
  /** The entry's body, as stored or as its public page received it. */
  data: ContentOutputData | PublicContentOutputData | null | undefined;
  /** The titles of the entry's excerpts the reader may see, in their order. */
  excerptTitles: readonly string[];
  /** Whether the reader is on the private side of the entry. */
  includePrivate: boolean;
  /** What stands where a private part of the text is kept from the reader. */
  privateLabel: string;
  /** `false` gives the first words alone, without the day's headings. */
  headings?: boolean;
};

/**
 * The lead of an entry: what stands in for the title it does not have.
 *
 * An entry with headings, or with excerpts, is about several things, and its
 * first words say only the first of them: the lead names them all first —
 * the level-two headings of its text in order, then its excerpts, which its
 * page shows as headings after the text — and then quotes how it begins:
 * `Morning · Evening — The alarm did not go off…`. An entry with neither is
 * its first words alone.
 *
 * Only what the reader may see is there. A heading inside a private part is
 * not named to a visitor, and the words quoted are the public ones with
 * `[privateLabel]` where a private part stood, so the text around it does not
 * read as one run-on thought; a reader on the private side gets the whole.
 * The lead is cut at a word, so a name is never cut through without the
 * ellipsis saying so.
 */
export function diaryLead(
  parts: DiaryLeadParts,
  limit = DIARY_LEAD_LENGTH,
): string {
  const normalized = normalizeContentData(storedBlocksOf(parts));
  const words = parts.includePrivate
    ? contentPlainText(normalized)
    : publicContentPlainText(normalized, 'all', {
        privatePlaceholder: parts.privateLabel,
      });
  const names =
    parts.headings === false
      ? []
      : [
          ...headingsOf(normalized, parts.includePrivate),
          ...parts.excerptTitles,
        ]
          .map((name) => name.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
  const named = names.join(' · ');
  return cutAtWord(
    named && words ? `${named} — ${words}` : named || words,
    limit,
  );
}

/** An excerpt as an entry's description names it: by what it is about. */
export type DiaryDescriptionExcerpt = {
  title: string;
  /** The name of what it is about; none once that is deleted. */
  subject?: string;
};

/**
 * What a search engine shows under an entry's day. An entry with excerpts
 * says first what it is about, each subject once with its excerpts' titles,
 * in the order the excerpts come — `Kayak: The stringers; Varnish. Barn
 * roof: Measured.` — then quotes how its own text begins, as far as the room
 * goes. One about nothing any more is named by its title alone. An entry
 * without excerpts is described by its lead.
 */
export function diaryDescription(
  parts: Omit<DiaryLeadParts, 'excerptTitles' | 'headings'> & {
    excerpts: readonly DiaryDescriptionExcerpt[];
  },
  limit = SEO_DESCRIPTION_LIMIT,
): string {
  const groups = new Map<string, string[]>();
  for (const excerpt of parts.excerpts) {
    const title = oneLine(excerpt.title);
    if (!title) continue;
    const subject = oneLine(excerpt.subject ?? '');
    groups.set(subject, [...(groups.get(subject) ?? []), title]);
  }
  if (!groups.size) return diaryLead({ ...parts, excerptTitles: [] }, limit);
  const said = [...groups]
    .map(([subject, titles]) =>
      endSentence(`${subject ? `${subject}: ` : ''}${titles.join('; ')}`),
    )
    .join(' ');
  const words = diaryLead(
    { ...parts, excerptTitles: [], headings: false },
    Number.POSITIVE_INFINITY,
  );
  return cutAtWord(words ? `${said} ${words}` : said, limit);
}

function oneLine(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

/** A sentence ended as written, or with a full stop where it has no mark. */
function endSentence(text: string) {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** The level-two headings of a text, as plain words, in text order. */
function headingsOf(
  normalized: ContentOutputData,
  includePrivate: boolean,
): string[] {
  const ranges = normalizedContentPrivateSectionRanges(normalized);
  return normalized.blocks.flatMap((block, index) =>
    block.type === 'header' &&
    (block.data as { level?: number }).level === 2 &&
    (includePrivate || !contentBlockIsInPrivateSection(ranges, index))
      ? contentBlockTextParts(block)
      : [],
  );
}

/**
 * The body as stored. A public page receives its private parts already
 * decided — opened whole for the reader on the private side, or stood in for
 * by a placeholder that holds nothing to quote — so each goes back into a
 * private section of its own: an opened part with its blocks, a placeholder
 * with the label it would show, which `includePrivate` then quotes or marks.
 */
function storedBlocksOf({
  data,
  privateLabel,
}: Pick<DiaryLeadParts, 'data' | 'privateLabel'>): ContentOutputData {
  const boundary = (sectionId: string, edge: 'start' | 'end') =>
    ({
      type: 'privateSectionBoundary',
      data: { sectionId, edge },
    }) as unknown as ContentOutputBlock;
  return {
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
  };
}

/**
 * The opening of a text, cut at a word and marked as cut.
 *
 * Cutting mid-word reads as damage rather than as a quotation, so the cut
 * retreats to the last space before the limit when there is one close enough.
 * An ellipsis ends whatever was cut: without it, an opening shorter than the
 * clamp of its card reads as if the entry itself stopped there. It takes the
 * place of a comma, a dash or a full stop the cut would leave hanging.
 */
function cutAtWord(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  const kept = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${kept.replace(/[\s,;:.·–—-]+$/, '')}…`;
}
