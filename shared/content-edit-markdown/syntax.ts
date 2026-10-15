import type { Root } from 'mdast';
import { directiveFromMarkdown, directiveToMarkdown } from 'mdast-util-directive';
import { fromMarkdown } from 'mdast-util-from-markdown';
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from 'mdast-util-gfm-strikethrough';
import {
  gfmTaskListItemFromMarkdown,
  gfmTaskListItemToMarkdown,
} from 'mdast-util-gfm-task-list-item';
import { toMarkdown } from 'mdast-util-to-markdown';
import { directive } from 'micromark-extension-directive';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';

/**
 * The Markdown the editing dialect is read and written in: CommonMark with
 * directives, strikethrough and task list items — and nothing else, so a bare
 * address stays text, as the owner typed it.
 */
export function parseEditMarkdown(markdown: string): Root {
  return fromMarkdown(markdown, {
    extensions: [directive(), gfmStrikethrough(), gfmTaskListItem()],
    mdastExtensions: [
      directiveFromMarkdown(),
      gfmStrikethroughFromMarkdown(),
      gfmTaskListItemFromMarkdown(),
    ],
  });
}

/**
 * A directive's attribute value, made safe to write as it is. The writer
 * quotes it but leaves an ampersand alone, and keeps a text directive's line
 * breaks raw — where an empty line would end the paragraph mid-directive. Both
 * are written as character references, which the reader decodes back.
 */
export function directiveAttributeValue(value: string): string {
  return value
    .replace(/&(?=#?[a-z0-9]+;)/gi, '&#38;')
    .replace(/\r\n|\r|\n/g, '&#10;');
}

export function writeEditMarkdown(root: Root): string {
  return (
    toMarkdown(root, {
    extensions: [
      directiveToMarkdown(),
      gfmStrikethroughToMarkdown(),
      gfmTaskListItemToMarkdown(),
    ],
    bullet: '-',
    emphasis: '*',
    strong: '*',
    rule: '-',
    listItemIndent: 'one',
    resourceLink: true,
    })
      // A colon before letters could open a directive in running text, so
      // the writer escapes it everywhere — also in a link's address, where
      // nothing can open and `thei\:` only looks like a different scheme.
      .replace(/\]\(thei\\:/g, '](thei:')
      .trimEnd()
  );
}
