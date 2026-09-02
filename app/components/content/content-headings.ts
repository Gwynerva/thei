import {
  type PublicContentOutputBlock,
  type PublicContentOutputData,
} from '#layers/thei/shared/content';
import { richTextToPlainText } from '#layers/thei/shared/rich-text';

export type ContentHeadingLevel = 2 | 3;

export interface ContentHeading {
  title: string;
  level: ContentHeadingLevel;
  id: string;
  href: string;
  path: string;
}

export interface VisibleContentBlock {
  block: PublicContentOutputBlock;
  path: string;
}

export function contentBlockPath(prefix: string, index: number): string {
  return prefix ? `${prefix}.${index}` : String(index);
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

export function buildContentHeadings(
  data: PublicContentOutputData | null | undefined,
  slugify: (value: string) => string,
): ContentHeading[] {
  if (!data) return [];

  const headings: ContentHeading[] = [];
  const usedIds = new Set<string>();

  function uniqueId(title: string) {
    const base = slugify(title) || 'heading';
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);
    return id;
  }

  function visit(value: PublicContentOutputData, pathPrefix = '') {
    for (const { block, path } of visibleContentBlocks(value, pathPrefix)) {
      if (block.type === 'header') {
        const title = richTextToPlainText(String(block.data.text ?? ''));
        const id = uniqueId(title);
        headings.push({
          title,
          level: block.data.level === 3 ? 3 : 2,
          id,
          href: `#${id}`,
          path,
        });
      } else if (block.type === 'privateSectionExpanded') {
        visit({ blocks: block.data.blocks }, path);
      }
    }
  }

  visit(data);
  return headings;
}
