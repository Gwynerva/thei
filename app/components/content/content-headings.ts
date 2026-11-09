import {
  type PublicContentOutputBlock,
  type PublicContentOutputData,
} from '#layers/thei/shared/content';
import {
  contentBlockPath,
  contentHeadingAnchors,
  excerptAnchorId,
  excerptHeadingId,
  type ContentHeadingLevel,
} from '#layers/thei/shared/content-headings';
import type { IconName } from '#thei/icons';

export { contentBlockPath, type ContentHeadingLevel };

export interface ContentHeading {
  title: string;
  level: ContentHeadingLevel;
  id: string;
  href: string;
  path: string;
  /** Marks a heading of the page itself rather than of authored content. */
  icon?: IconName;
}

export interface VisibleContentBlock {
  block: PublicContentOutputBlock;
  path: string;
}

export function visibleContentBlocks(
  data: PublicContentOutputData,
  pathPrefix = '',
): VisibleContentBlock[] {
  return data.blocks.map((block, index) => ({
    block,
    path: contentBlockPath(pathPrefix, index),
  }));
}

type EmbeddedExcerpt = {
  publicId: string;
  title: string;
  content: PublicContentOutputData;
};

/**
 * The headings of an excerpt embedded on its parent's page, as its renderer
 * anchors them: each under the excerpt's own anchor. The paths stay the
 * text's own, which is how the renderer finds each heading's block.
 */
export function buildExcerptContentHeadings(
  excerpt: EmbeddedExcerpt,
  slugify: (value: string) => string,
): ContentHeading[] {
  return buildContentHeadings(excerpt.content, slugify).map((heading) => {
    const id = excerptHeadingId(excerpt.publicId, heading.id);
    return { ...heading, id, href: `#${id}` };
  });
}

/**
 * What an embedded excerpt adds to the contents of its parent's page: the
 * excerpt itself, then the headings of its text one level down — those of
 * its first level only, since the contents go two levels deep.
 */
export function buildExcerptContentsEntries(
  excerpt: EmbeddedExcerpt,
  slugify: (value: string) => string,
): ContentHeading[] {
  const id = excerptAnchorId(excerpt.publicId);
  return [
    {
      title: excerpt.title,
      level: 2,
      id,
      href: `#${id}`,
      path: `excerpt:${excerpt.publicId}`,
      icon: 'excerpt',
    },
    ...buildExcerptContentHeadings(excerpt, slugify)
      .filter((heading) => heading.level === 2)
      .map((heading) => ({
        ...heading,
        level: 3 as const,
        path: `excerpt:${excerpt.publicId}:${heading.path}`,
      })),
  ];
}

/** A text's headings as the page lists and anchors them (`content-headings`). */
export function buildContentHeadings(
  data: PublicContentOutputData | null | undefined,
  slugify: (value: string) => string,
): ContentHeading[] {
  return contentHeadingAnchors(data, slugify).map((heading) => ({
    title: heading.title,
    level: heading.level,
    id: heading.id,
    href: `#${heading.id}`,
    path: heading.path,
  }));
}
