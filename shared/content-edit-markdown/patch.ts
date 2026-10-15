import { escapeHtmlText } from './html';
import { phrasingToInlineHtml } from './inline';
import { stripMarks, type PreparedTextEdit, type TextEdit } from './patch-core';
import { parseEditMarkdown } from './syntax';

/**
 * Text edits whose replacement is editing Markdown, as a client writes them:
 * `[Parapet](thei:project/<id>)` makes the words a link. The replacement is
 * worked out here once, as stored markup, and the edit is then applied — or
 * kept, ready, in a suggestion for a page to apply.
 */
export function prepareTextEdit(edit: TextEdit): PreparedTextEdit {
  const replacePlain = stripMarks(edit.replace);
  const root = parseEditMarkdown(edit.replace);
  const first = root.children[0];
  if (root.children.length !== 1 || first?.type !== 'paragraph')
    return {
      ...edit,
      replaceHtml: escapeHtmlText(edit.replace),
      replacePlain,
      links: false,
    };
  // A replacement is a few words, and leading or trailing spaces in it are as
  // meaningful as the words: Markdown would trim them.
  const lead = /^\s*/.exec(edit.replace)![0];
  const trail = /\s*$/.exec(edit.replace)![0];
  const links = first.children.some(function hasLink(node): boolean {
    return (
      node.type === 'link' ||
      ('children' in node &&
        (node.children as typeof first.children).some(hasLink))
    );
  });
  return {
    ...edit,
    replaceHtml: `${escapeHtmlText(lead)}${phrasingToInlineHtml(first.children)}${escapeHtmlText(trail)}`,
    replacePlain,
    links,
  };
}
