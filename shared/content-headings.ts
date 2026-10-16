import { decodeLinkFragment } from './content-link';
import { richTextToPlainText } from './rich-text';
import {
  PROJECT_DESCRIPTION_ANCHOR,
  PROJECT_SECTIONS_ANCHOR,
} from './project-url';

/**
 * The anchors of a text's headings: what a link to a place in an entity
 * names after its `#`, what the page gives its `<h2>`/`<h3>` and its list of
 * contents.
 *
 * An anchor is the heading's words made a slug in the site's language, with
 * `-2`, `-3` after a repeat. Headings outside private sections are numbered
 * first and those inside after them, so a reader who never sees the private
 * ones gets the same anchors as the owner who does — and learns nothing of
 * them from a skipped number.
 *
 * The page's own places keep their names: a heading named like one of them
 * takes the next free one instead.
 */

/** The anchor of a page's block of related entities, in its contents. */
export const PUBLIC_RELATED_SECTION_ID = 'related-entities';

/** Places the pages themselves name, never taken by a heading. */
export const RESERVED_CONTENT_ANCHORS: readonly string[] = [
  PROJECT_DESCRIPTION_ANCHOR,
  PROJECT_SECTIONS_ANCHOR,
  PUBLIC_RELATED_SECTION_ID,
];

/**
 * Whether a link's `#…` names a place other than a heading: one the page
 * always has, or a passage of text (`:~:text=…`). Such a place is never
 * gone because no heading has it.
 */
export function isFixedContentPlace(fragment: string): boolean {
  return (
    fragment.startsWith(':~:') || RESERVED_CONTENT_ANCHORS.includes(fragment)
  );
}

/** How such a place, or an anchor no heading has, reads to the owner. */
export function contentPlaceLabel(fragment: string): string {
  // `text=[prefix-,]start[,end][,-suffix]`: the passage is from start to end.
  const text = /^:~:text=([^&]*)/.exec(fragment)?.[1];
  if (!text) return decodeLinkFragment(fragment);
  const passage = text
    .split(',')
    .filter((part) => !part.endsWith('-') && !part.startsWith('-'))
    .map(decodeLinkFragment);
  return `«${passage.join(' … ')}»`;
}

export type ContentHeadingLevel = 2 | 3;

export interface ContentAnchorHeading {
  /** The heading's words, plain. */
  title: string;
  level: ContentHeadingLevel;
  /** Its anchor, without `#`. */
  id: string;
  /** Where its block is: indexes into the blocks, nested ones joined by dots. */
  path: string;
  /** Inside a private section: only the owner sees it. */
  private: boolean;
}

type AnyBlock = { type: string; data?: unknown };

export function contentBlockPath(prefix: string, index: number): string {
  return prefix ? `${prefix}.${index}` : String(index);
}

/**
 * The headings of a text with their anchors, in the order they stand. It
 * reads either form of a text: as stored, with a private section between a
 * pair of `privateSectionBoundary` blocks, and as served, with one expanded
 * (`privateSectionExpanded`) or folded away (`privateSectionPlaceholder`).
 */
export function contentHeadingAnchors(
  data: { blocks: readonly AnyBlock[] } | null | undefined,
  slugify: (value: string) => string,
): ContentAnchorHeading[] {
  if (!data) return [];
  const found: Omit<ContentAnchorHeading, 'id'>[] = [];

  function visit(blocks: readonly AnyBlock[], prefix: string, inside: boolean) {
    let open = inside;
    blocks.forEach((block, index) => {
      const path = contentBlockPath(prefix, index);
      const data = (block.data ?? {}) as Record<string, unknown>;
      if (block.type === 'privateSectionBoundary') {
        open = data.edge === 'start' ? true : inside;
      } else if (block.type === 'privateSectionExpanded') {
        visit((data.blocks as AnyBlock[]) ?? [], path, true);
      } else if (block.type === 'header') {
        found.push({
          title: richTextToPlainText(String(data.text ?? '')),
          level: data.level === 3 ? 3 : 2,
          path,
          private: open,
        });
      }
    });
  }
  visit(data.blocks, '', false);

  const used = new Set(RESERVED_CONTENT_ANCHORS);
  const ids = new Map<(typeof found)[number], string>();
  function take(heading: (typeof found)[number]) {
    const base = slugify(heading.title) || 'heading';
    let id = base;
    for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`;
    used.add(id);
    ids.set(heading, id);
  }
  for (const heading of found) if (!heading.private) take(heading);
  for (const heading of found) if (heading.private) take(heading);
  return found.map((heading) => ({ ...heading, id: ids.get(heading)! }));
}
