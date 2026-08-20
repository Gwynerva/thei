import type { MediaDescriptor } from './media';
import { normalizeExternalLinkUrl } from './external-link';

export const CONTENT_ENTITY_TYPES = ['project'] as const;
export type ContentEntityType = (typeof CONTENT_ENTITY_TYPES)[number];

export interface ContentEntityLink {
  kind: 'entity';
  entityType: ContentEntityType;
  entityId: string;
  href?: string;
  label: string;
}

export interface ContentExternalInlineLink {
  kind: 'external';
  url: string;
  label: string;
}

export type ContentInlineLink = ContentEntityLink | ContentExternalInlineLink;

export type ContentLinkReference =
  | {
      kind: 'project';
      projectUuid: string;
    }
  | {
      kind: 'external';
      url: string;
    };

export type ResolvedContentLink =
  | (Extract<ContentLinkReference, { kind: 'project' }> & {
      state: 'resolved';
      href: string;
      title: string;
      summary: string;
      iconMedia: MediaDescriptor;
    })
  | (Extract<ContentLinkReference, { kind: 'external' }> & {
      state: 'resolved';
      href: string;
      title?: string;
      description?: string;
      iconMedia: MediaDescriptor;
    })
  | (ContentLinkReference & {
      state: 'broken';
      href?: string;
      reason: 'not-found' | 'invalid' | 'unavailable';
    });

export type ContentLinkResolver = (
  reference: ContentLinkReference,
) => Promise<ResolvedContentLink>;

const INLINE_TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'br']);

export function contentInlineLinkSanitizeConfig() {
  return {
    href: true,
    target: '_blank',
    rel: 'noopener noreferrer',
    'data-content-link': true,
    'data-entity-type': true,
    'data-entity-id': true,
  };
}

/**
 * Keeps Editor.js inline markup deliberately small and canonical. Runtime
 * attributes are rehydrated by the resolver and never enter stored content.
 */
export function normalizeContentInlineHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  const sanitized = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z][\w-]*)\b([^>]*)>/gi, (source, rawName, rawAttrs) => {
      const name = String(rawName).toLowerCase();
      if (!INLINE_TAGS.has(name)) return '';
      if (source.startsWith('</')) return name === 'br' ? '' : `</${name}>`;
      if (name !== 'a') return name === 'br' ? '<br>' : `<${name}>`;

      const attributes = parseAttributes(String(rawAttrs));
      const kind = attributes['data-content-link'];
      const entityType = attributes['data-entity-type'];
      const entityId = attributes['data-entity-id']?.trim();
      if (kind === 'entity' && isContentEntityType(entityType) && entityId) {
        return `<a data-content-link="entity" data-entity-type="${entityType}" data-entity-id="${escapeAttribute(entityId)}">`;
      }

      const href = attributes.href;
      if (href) {
        try {
          const url = normalizeExternalLinkUrl(href);
          return `<a href="${escapeAttribute(url)}" data-content-link="external">`;
        } catch {
          if (href.startsWith('/') && !href.startsWith('//'))
            return `<a href="${escapeAttribute(href)}">`;
        }
      }
      return '<a>';
    });
  return normalizeInlineWhitespace(sanitized);
}

const HORIZONTAL_SPACE_SOURCE = String.raw`(?:[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]|&(?:nbsp|#0*160|#x0*a0);)`;
const HORIZONTAL_SPACE_RUN = new RegExp(`${HORIZONTAL_SPACE_SOURCE}+`, 'gi');
const INLINE_TOKEN = /<br>|<\/?(?:a|b|strong|i|em)(?:\s[^>]*)?>/gi;

export function normalizeContentText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(HORIZONTAL_SPACE_RUN, ' ').trim();
}

type InlineFrame = { tag: string; open: string };
type InlineAtom =
  | { kind: 'text'; value: string; stack: InlineFrame[]; space: boolean }
  | { kind: 'break'; stack: InlineFrame[] };

function normalizeInlineWhitespace(html: string): string {
  const atoms: InlineAtom[] = [];
  const stack: InlineFrame[] = [];
  let cursor = 0;

  for (const match of html.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    appendTextAtoms(atoms, html.slice(cursor, index), stack);
    const token = match[0];
    if (/^<br>$/i.test(token)) {
      atoms.push({ kind: 'break', stack: [...stack] });
    } else if (/^<\//.test(token)) {
      const tag = token.slice(2, -1).toLowerCase();
      const found = stack.map((frame) => frame.tag).lastIndexOf(tag);
      if (found >= 0) stack.splice(found);
    } else {
      const tag = /^<([a-z]+)/i.exec(token)?.[1]?.toLowerCase();
      if (tag) stack.push({ tag, open: token });
    }
    cursor = index + token.length;
  }
  appendTextAtoms(atoms, html.slice(cursor), stack);

  const normalized: InlineAtom[] = [];
  let line: InlineAtom[] = [];
  const flushLine = () => {
    while (isSpaceAtom(line[0])) line.shift();
    while (isSpaceAtom(line.at(-1))) line.pop();
    normalized.push(...line);
    line = [];
  };
  for (const atom of atoms) {
    if (atom.kind === 'break') {
      flushLine();
      normalized.push(atom);
    } else if (atom.space && isSpaceAtom(line.at(-1))) {
      // One canonical separator is enough even when it crosses text nodes.
    } else {
      line.push(atom);
    }
  }
  flushLine();

  let output = '';
  let active: InlineFrame[] = [];
  const transition = (next: InlineFrame[]) => {
    let common = 0;
    while (active[common] === next[common] && common < active.length) common++;
    for (let index = active.length - 1; index >= common; index--)
      output += `</${active[index]!.tag}>`;
    for (let index = common; index < next.length; index++)
      output += next[index]!.open;
    active = [...next];
  };

  for (let index = 0; index < normalized.length; index++) {
    const atom = normalized[index]!;
    if (atom.kind === 'break') {
      transition(atom.stack);
      output += '<br>';
      continue;
    }
    if (atom.space) {
      const previous = findTextAtom(normalized, index, -1);
      const next = findTextAtom(normalized, index, 1);
      transition(commonStack(previous?.stack ?? [], next?.stack ?? []));
      output += ' ';
    } else {
      transition(atom.stack);
      output += atom.value;
    }
  }
  transition([]);
  return output;
}

function isSpaceAtom(
  atom: InlineAtom | undefined,
): atom is Extract<InlineAtom, { kind: 'text' }> {
  return atom?.kind === 'text' && atom.space;
}

function appendTextAtoms(
  atoms: InlineAtom[],
  text: string,
  stack: InlineFrame[],
) {
  if (!text) return;
  let cursor = 0;
  for (const match of text.matchAll(HORIZONTAL_SPACE_RUN)) {
    const index = match.index ?? 0;
    if (index > cursor)
      atoms.push({
        kind: 'text',
        value: text.slice(cursor, index),
        stack: [...stack],
        space: false,
      });
    atoms.push({ kind: 'text', value: ' ', stack: [...stack], space: true });
    cursor = index + match[0].length;
  }
  if (cursor < text.length)
    atoms.push({
      kind: 'text',
      value: text.slice(cursor),
      stack: [...stack],
      space: false,
    });
}

function findTextAtom(atoms: InlineAtom[], from: number, direction: -1 | 1) {
  for (
    let index = from + direction;
    index >= 0 && index < atoms.length;
    index += direction
  ) {
    const atom = atoms[index]!;
    if (atom.kind === 'break') return undefined;
    if (!atom.space) return atom;
  }
}

function commonStack(left: InlineFrame[], right: InlineFrame[]) {
  let length = 0;
  while (left[length] === right[length] && length < left.length) length++;
  return left.slice(0, length);
}

export function extractContentInlineLinks(html: string): ContentInlineLink[] {
  const links: ContentInlineLink[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = parseAttributes(match[1] ?? '');
    const label = plainInlineText(match[2] ?? '');
    const href = attributes.href;
    if (attributes['data-content-link'] === 'external' || href) {
      try {
        links.push({
          kind: 'external',
          url: normalizeExternalLinkUrl(href),
          label,
        });
        continue;
      } catch {
        // Relative hrefs may be legacy project links and are resolved server-side.
      }
    }
    if (attributes['data-content-link'] !== 'entity') continue;
    const entityType = attributes['data-entity-type'];
    const entityId = attributes['data-entity-id']?.trim();
    if (!isContentEntityType(entityType) || !entityId) continue;
    links.push({
      kind: 'entity',
      entityType,
      entityId,
      href,
      label,
    });
  }
  return links;
}

export function contentLinkReferenceFromAnchor(
  link: HTMLAnchorElement,
): ContentLinkReference | undefined {
  if (
    link.dataset.contentLink === 'entity' &&
    link.dataset.entityType === 'project' &&
    link.dataset.entityId
  ) {
    return { kind: 'project', projectUuid: link.dataset.entityId };
  }
  if (link.dataset.contentLink === 'external' || link.href) {
    try {
      return { kind: 'external', url: normalizeExternalLinkUrl(link.href) };
    } catch {
      return undefined;
    }
  }
}

export function contentLinkReferenceKey(reference: ContentLinkReference) {
  return reference.kind === 'project'
    ? `project:${reference.projectUuid}`
    : `external:${reference.url}`;
}

export function contentInlineLinksFromData(data: {
  blocks: Array<{ data: Record<string, unknown> }>;
}): ContentInlineLink[] {
  const links: ContentInlineLink[] = [];
  for (const block of data.blocks) {
    collectStrings(block.data, (value) => {
      if (value.includes('<a')) links.push(...extractContentInlineLinks(value));
    });
  }
  return links;
}

export function stripHydratedContentInlineLinks(value: unknown): unknown {
  if (typeof value === 'string') return normalizeContentInlineHtml(value);
  if (Array.isArray(value))
    return value.map((item) => stripHydratedContentInlineLinks(item));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        stripHydratedContentInlineLinks(item),
      ]),
    );
  return value;
}

export function isContentEntityType(
  value: unknown,
): value is ContentEntityType {
  return CONTENT_ENTITY_TYPES.includes(value as ContentEntityType);
}

function collectStrings(value: unknown, visit: (value: string) => void) {
  if (typeof value === 'string') {
    visit(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, visit));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, visit));
  }
}

function parseAttributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
  )) {
    result[(match[1] ?? '').toLowerCase()] = decodeHtml(
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  }
  return result;
}

function plainInlineText(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
