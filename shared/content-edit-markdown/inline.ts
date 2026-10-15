import type { PhrasingContent } from 'mdast';
import type { TextDirective } from 'mdast-util-directive';
import { isContentEntityType } from '../content-link';
import { isTheiLinkUrl, parseTheiLinkUrl, theiLinkUrl } from './links';
import {
  decodeHtmlEntities,
  escapeHtmlAttribute,
  escapeHtmlText,
} from './html';
import { directiveAttributeValue } from './syntax';

export { decodeHtmlEntities, escapeHtmlAttribute, escapeHtmlText };

/**
 * Stored inline markup and Markdown phrasing, both ways.
 *
 * The stored side is the small, canonical HTML subset that
 * `normalizeContentInlineHtml` keeps (see `docs/content-blocks.md`), so this
 * is an exact translation of a handful of tags, not a general HTML converter.
 * The Markdown side is an mdast tree: escaping is left to the library that
 * writes it, which knows every way a character can start syntax.
 */

const INLINE_TOKEN = /<br\s*\/?>|<\/?(?:a|b|strong|i|em|s|abbr)(?:\s[^>]*)?>/gi;
const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE))
    attributes[match[1]!.toLowerCase()] = decodeHtmlEntities(match[2]!);
  return attributes;
}

type Container = { children: PhrasingContent[] };
type Frame = { tag: string; node: Container };

/** A stored anchor as a Markdown link, or nothing when it links nowhere. */
function anchorNode(attributes: Record<string, string>): Container | null {
  const note = attributes['data-content-note'] || undefined;
  if (attributes['data-content-link'] === 'entity') {
    const entityType = attributes['data-entity-type'];
    const entityId = attributes['data-entity-id'];
    if (!isContentEntityType(entityType) || !entityId) return null;
    return {
      type: 'link',
      url: theiLinkUrl({
        entityType,
        entityId,
        fragment: attributes['data-entity-fragment'],
      }),
      title: note ?? null,
      children: [],
    } as Container;
  }
  const href = attributes.href;
  if (!href) return null;
  return {
    type: 'link',
    url: href,
    title: href.startsWith('/') ? null : (note ?? null),
    children: [],
  } as Container;
}

function openNode(tag: string, source: string): Container | null {
  switch (tag) {
    case 'b':
    case 'strong':
      return { type: 'strong', children: [] } as Container;
    case 'i':
    case 'em':
      return { type: 'emphasis', children: [] } as Container;
    case 's':
      return { type: 'delete', children: [] } as Container;
    case 'abbr':
      return {
        type: 'textDirective',
        name: 'hint',
        attributes: {
          note: directiveAttributeValue(
            parseAttributes(source)['data-content-hint'] ?? '',
          ),
        },
        children: [],
      } as unknown as Container;
    case 'a':
      return anchorNode(parseAttributes(source));
    default:
      return null;
  }
}

/**
 * Stored inline markup as Markdown phrasing.
 *
 * A line break at either end of a text breaks nothing a reader sees, and
 * Markdown has no way to write one there: a backslash that ends a paragraph
 * is only a backslash. Those are left out.
 */
export function inlineHtmlToPhrasing(html: unknown): PhrasingContent[] {
  const nodes = inlineHtmlTree(html);
  while (nodes[0]?.type === 'break') nodes.shift();
  while (nodes.at(-1)?.type === 'break') nodes.pop();
  return nodes;
}

function inlineHtmlTree(html: unknown): PhrasingContent[] {
  if (typeof html !== 'string' || !html) return [];
  const root: Container = { children: [] };
  const stack: Frame[] = [{ tag: '', node: root }];
  const top = () => stack.at(-1)!.node;
  const pushText = (value: string) => {
    if (!value) return;
    const children = top().children;
    const last = children.at(-1);
    if (last?.type === 'text') last.value += value;
    else children.push({ type: 'text', value });
  };

  let cursor = 0;
  for (const match of html.matchAll(INLINE_TOKEN)) {
    pushText(decodeHtmlEntities(html.slice(cursor, match.index)));
    cursor = (match.index ?? 0) + match[0].length;
    const token = match[0];
    if (/^<br/i.test(token)) {
      top().children.push({ type: 'break' });
      continue;
    }
    const tag = /^<\/?([a-z]+)/i.exec(token)![1]!.toLowerCase();
    if (token.startsWith('</')) {
      const index = stack.map((frame) => frame.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const node = openNode(tag, token);
    // An anchor that links nowhere keeps its words in place: its frame
    // collects them straight into the parent.
    const target = node ?? top();
    if (node) top().children.push(node as unknown as PhrasingContent);
    stack.push({ tag, node: target });
  }
  pushText(decodeHtmlEntities(html.slice(cursor)));
  return root.children;
}

/** The plain text of phrasing, as a heading or a file's title holds it. */
export function phrasingToPlainText(nodes: readonly PhrasingContent[]): string {
  let text = '';
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'inlineCode') text += node.value;
    else if (node.type === 'break') text += ' ';
    else if ('children' in node)
      text += phrasingToPlainText(node.children as PhrasingContent[]);
  }
  return text;
}

/**
 * Markdown phrasing as inline markup, before `normalizeContentInlineHtml`
 * makes it canonical — which also drops whatever a writer put there that the
 * site does not keep.
 */
export function phrasingToInlineHtml(
  nodes: readonly PhrasingContent[],
): string {
  let html = '';
  for (const node of nodes) html += nodeToHtml(node);
  return html;
}

function nodeToHtml(node: PhrasingContent): string {
  switch (node.type) {
    case 'text':
      return escapeHtmlText(node.value);
    case 'inlineCode':
      // The site keeps no code spans; their text stays, marks and all.
      return escapeHtmlText(`\`${node.value}\``);
    case 'break':
      return '<br>';
    case 'strong':
      return `<b>${phrasingToInlineHtml(node.children)}</b>`;
    case 'emphasis':
      return `<i>${phrasingToInlineHtml(node.children)}</i>`;
    case 'delete':
      return `<s>${phrasingToInlineHtml(node.children)}</s>`;
    case 'link':
      return linkToHtml(node.url, node.title, node.children);
    case 'html':
      // Left to the normalizer, which keeps only the tags the site knows.
      return node.value;
    case 'image':
      return escapeHtmlText(node.alt ?? '');
    case 'textDirective':
      return textDirectiveToHtml(node);
    default:
      return 'children' in node
        ? phrasingToInlineHtml((node as Container).children)
        : '';
  }
}

function linkToHtml(
  url: string,
  title: string | null | undefined,
  children: PhrasingContent[],
): string {
  const text = phrasingToInlineHtml(children);
  const note = title?.trim()
    ? ` data-content-note="${escapeHtmlAttribute(title.trim())}"`
    : '';
  const target = parseTheiLinkUrl(url);
  if (target) {
    const fragment = target.fragment
      ? ` data-entity-fragment="${escapeHtmlAttribute(target.fragment)}"`
      : '';
    return (
      `<a data-content-link="entity" data-entity-type="${target.entityType}" ` +
      `data-entity-id="${escapeHtmlAttribute(target.entityId)}"${fragment}${note}>` +
      `${text}</a>`
    );
  }
  // Meant for this site, it names nothing the site has: the words stay,
  // with no link that would lead nowhere.
  if (isTheiLinkUrl(url)) return text;
  if (url.startsWith('/') && !url.startsWith('//'))
    return `<a href="${escapeHtmlAttribute(url)}">${text}</a>`;
  return `<a href="${escapeHtmlAttribute(url)}" data-content-link="external"${note}>${text}</a>`;
}

function textDirectiveToHtml(node: TextDirective): string {
  const text = phrasingToInlineHtml(node.children);
  if (node.name !== 'hint') {
    // Not something the site knows: the words stay, as the writer typed them.
    return `:${escapeHtmlText(node.name)}${text}`;
  }
  const note = node.attributes?.note?.trim();
  return note
    ? `<abbr data-content-hint="${escapeHtmlAttribute(note)}">${text}</abbr>`
    : text;
}
