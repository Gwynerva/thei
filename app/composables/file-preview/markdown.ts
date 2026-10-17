import { micromark } from 'micromark';
import {
  gfmAutolinkLiteral,
  gfmAutolinkLiteralHtml,
} from 'micromark-extension-gfm-autolink-literal';
import {
  gfmStrikethrough,
  gfmStrikethroughHtml,
} from 'micromark-extension-gfm-strikethrough';
import { gfmTable, gfmTableHtml } from 'micromark-extension-gfm-table';
import {
  gfmTaskListItem,
  gfmTaskListItemHtml,
} from 'micromark-extension-gfm-task-list-item';
import { previewUrl } from '#layers/thei/shared/assets/preview';

/**
 * A Markdown file as a page: GitHub's tables, task lists, strikethrough and
 * bare links, and the HTML written into it. Loaded only when such a file is
 * opened, so no other page carries the parser.
 */

/**
 * Elements kept, with the attributes each may keep. Anything else gives up
 * its tag and keeps its text; what can run, embed or style is dropped whole.
 */
const KEPT: Record<string, readonly string[]> = {
  p: [],
  br: [],
  hr: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  blockquote: [],
  ul: [],
  ol: ['start'],
  li: [],
  pre: [],
  code: [],
  em: [],
  i: [],
  strong: [],
  b: [],
  del: [],
  s: [],
  sup: [],
  sub: [],
  kbd: [],
  mark: [],
  small: [],
  abbr: ['title'],
  dl: [],
  dt: [],
  dd: [],
  details: ['open'],
  summary: [],
  figure: [],
  figcaption: [],
  table: [],
  caption: [],
  thead: [],
  tbody: [],
  tfoot: [],
  tr: [],
  th: ['align', 'colspan', 'rowspan'],
  td: ['align', 'colspan', 'rowspan'],
  a: ['href', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  input: ['type', 'checked'],
  span: [],
  div: [],
};

const DROPPED = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'portal',
  'svg',
  'math',
  'form',
  'button',
  'select',
  'textarea',
  'link',
  'meta',
  'base',
  'title',
  'head',
  'video',
  'audio',
  'source',
  'track',
  'canvas',
]);

function keptAttribute(
  tag: string,
  name: string,
  value: string,
): string | undefined {
  switch (name) {
    case 'href':
      return previewUrl(value, 'link');
    case 'src':
      return previewUrl(value, 'image');
    case 'width':
    case 'height':
    case 'start':
      return /^\d{1,5}$/.test(value.trim()) ? value.trim() : undefined;
    case 'colspan':
    case 'rowspan':
      return /^\d{1,3}$/.test(value.trim()) ? value.trim() : undefined;
    case 'align':
      return ['left', 'center', 'right'].includes(value) ? value : undefined;
    case 'type':
      return tag === 'input' && value === 'checkbox' ? value : undefined;
    case 'checked':
    case 'open':
      return '';
    default:
      return value;
  }
}

function copyInto(from: Node, to: Node, document: Document) {
  for (const node of from.childNodes) {
    if (node.nodeType === 3) {
      to.appendChild(document.createTextNode(node.nodeValue ?? ''));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    const tag = element.localName;
    if (DROPPED.has(tag)) continue;
    const attributes = KEPT[tag];
    if (!attributes) {
      copyInto(element, to, document);
      continue;
    }
    // A task list's box is the one input there is.
    if (tag === 'input' && element.getAttribute('type') !== 'checkbox')
      continue;
    const copy = document.createElement(tag);
    for (const name of attributes) {
      const value = element.getAttribute(name);
      if (value === null) continue;
      const kept = keptAttribute(tag, name, value);
      if (kept === undefined) continue;
      // A title is shown as every hint of the site is, never the browser's.
      if (name === 'title') {
        if (kept.trim()) copy.setAttribute('data-title-popup', kept.trim());
      } else copy.setAttribute(name, kept);
    }
    if (tag === 'input') copy.setAttribute('disabled', '');
    if (tag === 'a' && copy.getAttribute('href')?.startsWith('#') === false) {
      copy.setAttribute('target', '_blank');
      copy.setAttribute('rel', 'noopener noreferrer nofollow');
    }
    if (tag === 'img') {
      copy.setAttribute('loading', 'lazy');
      copy.setAttribute('referrerpolicy', 'no-referrer');
    }
    copyInto(element, copy, document);
    to.appendChild(copy);
  }
}

/**
 * The text as elements of this page, rebuilt from the kept ones alone: the
 * HTML is parsed in a document that runs and loads nothing, and only new
 * elements with checked attributes come out of it.
 */
export function renderMarkdown(
  text: string,
  document: Document = window.document,
): DocumentFragment {
  const html = micromark(text, {
    allowDangerousHtml: true,
    // Every address is checked once, below, by what it is for: micromark's
    // own check would also drop a picture written into the text as `data:`.
    allowDangerousProtocol: true,
    extensions: [
      gfmAutolinkLiteral(),
      gfmStrikethrough(),
      gfmTable(),
      gfmTaskListItem(),
    ],
    htmlExtensions: [
      gfmAutolinkLiteralHtml(),
      gfmStrikethroughHtml(),
      gfmTableHtml(),
      gfmTaskListItemHtml(),
    ],
  });
  const parsed = new DOMParser().parseFromString(
    `<!doctype html><body>${html}`,
    'text/html',
  );
  const fragment = document.createDocumentFragment();
  copyInto(parsed.body, fragment, document);
  return fragment;
}
