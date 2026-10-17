import {
  type PublicContentOutputBlock,
  type PublicContentOutputData,
} from '#layers/thei/shared/content';
import {
  contentBlockPath,
  contentHeadingAnchors,
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
