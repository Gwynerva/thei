import { SEO_DESCRIPTION_LIMIT } from './seo-description';
import {
  CONTENT_OPENING_LENGTH,
  cutAtWord,
  openingBlocksOf,
  readerPlainText,
} from './content-opening';
import {
  contentBlockIsInPrivateSection,
  contentBlockTextParts,
  normalizedContentPrivateSectionRanges,
  type ContentOutputData,
  type PublicContentOutputData,
} from './content';

/**
 * How much of an entry stands in for the title it does not have: as much as
 * of any text that describes itself by how it begins (`content-opening.ts`).
 */
export const DIARY_LEAD_LENGTH = CONTENT_OPENING_LENGTH;

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
 * `Morning · Evening — The alarm did not go off…`. The words quoted are the
 * text without the headings already named, so none is said twice; a heading
 * of a lower level is not named and stays among them. An entry with neither
 * is its first words alone.
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
  const normalized = openingBlocksOf(parts.data, parts.privateLabel);
  const headings =
    parts.headings === false
      ? []
      : namedHeadingsOf(normalized, parts.includePrivate);
  const named = new Set(headings.map((heading) => heading.index));
  const quoted = named.size
    ? {
        ...normalized,
        blocks: normalized.blocks.filter((_, index) => !named.has(index)),
      }
    : normalized;
  const words = readerPlainText(quoted, parts);
  const names =
    parts.headings === false
      ? []
      : [
          ...headings.flatMap((heading) => heading.names),
          ...parts.excerptTitles,
        ]
          .map((name) => name.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
  const said = names.join(' · ');
  return cutAtWord(said && words ? `${said} — ${words}` : said || words, limit);
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

/**
 * The level-two headings of a text the reader may see, in text order: where
 * each block stands and its plain words.
 */
function namedHeadingsOf(
  normalized: ContentOutputData,
  includePrivate: boolean,
): { index: number; names: string[] }[] {
  const ranges = normalizedContentPrivateSectionRanges(normalized);
  return normalized.blocks.flatMap((block, index) =>
    block.type === 'header' &&
    (block.data as { level?: number }).level === 2 &&
    (includePrivate || !contentBlockIsInPrivateSection(ranges, index))
      ? [{ index, names: contentBlockTextParts(block) }]
      : [],
  );
}
