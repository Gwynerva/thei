import { formatMediaTime } from './audio';
import type { ContentOutputBlock, PublicContentOutputData } from './content';
import { contentIntegrationUrl } from './content-integrations';
import { normalizeInlineMarkup } from './language/general-normalize';

/**
 * Editor.js content as Markdown.
 *
 * Written for readers that want the words rather than the page: an agent
 * summarising a project, a model answering a question about it, a person
 * saving a copy. What is private is already absent — the public content it is
 * given has had those blocks removed — and nothing here can put it back.
 */
export interface ContentMarkdownOptions {
  /** Turns a site path into the absolute URL a reader outside the site needs. */
  absolute: (path: string) => string;
  /** Text for the marker left where a private section was removed. */
  privateSectionLabel: string;
  /** What a recording with no title of its own is called. */
  audioLabel?: string;
  /**
   * The typography of the site's language for the owner's words, which the
   * page gives them too. Without it the words come out as typed.
   */
  format?: (text: string) => string;
}

function typeset(text: string, options: ContentMarkdownOptions) {
  return text && options.format ? options.format(text) : text;
}

/**
 * The owner's note on a link as a Markdown link title, `[text](url "note")`:
 * a reader of the copy learns why the link is there, as a visitor does on
 * hover, and the text itself reads as written.
 */
function linkTitle(note: unknown, options: ContentMarkdownOptions): string {
  if (typeof note !== 'string') return '';
  const text = typeset(note.replace(/\s+/g, ' ').trim(), options);
  return text ? ` "${text.replace(/[\\"]/g, '\\$&')}"` : '';
}

export function contentToMarkdown(
  data: PublicContentOutputData | null | undefined,
  options: ContentMarkdownOptions,
): string {
  if (!data?.blocks?.length) return '';
  const parts: string[] = [];
  for (const block of data.blocks) {
    const rendered = renderBlock(block, options);
    if (rendered) parts.push(rendered);
  }
  return parts.join('\n\n').trim();
}

function renderBlock(
  block: { type: string; data?: unknown },
  options: ContentMarkdownOptions,
): string {
  const data = (block.data ?? {}) as Record<string, any>;
  switch (block.type) {
    case 'paragraph':
      return inlineToMarkdown(data.text, options);
    case 'header': {
      const level = data.level === 3 ? '###' : '##';
      return `${level} ${inlineToMarkdown(data.text, options)}`;
    }
    case 'quote': {
      const text = inlineToMarkdown(data.text, options)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const caption = inlineToMarkdown(data.caption, options);
      return caption ? `${text}\n>\n> — ${caption}` : text;
    }
    case 'list':
      return renderList(data, options);
    case 'delimiter':
      return '---';
    case 'contentMedia':
      return renderMedia(data.asset, data.caption, options);
    case 'contentGallery':
      return (Array.isArray(data.items) ? data.items : [])
        .map((item: any) => renderMedia(item?.asset, item?.caption, options))
        .filter(Boolean)
        .join('\n\n');
    case 'contentAttachment': {
      const url = data.asset?.assetUrl ?? data.asset?.media?.src;
      const title =
        inlineToMarkdown(data.title, options) ||
        data.asset?.fileName ||
        data.asset?.slug ||
        '';
      if (!url) return '';
      const caption = inlineToMarkdown(data.caption, options);
      const link = `[${title || url}](${options.absolute(url)})`;
      return caption ? `${link}\n\n${caption}` : link;
    }
    case 'contentAudio': {
      const url = data.asset?.assetUrl;
      if (!url) return '';
      const title =
        inlineToMarkdown(data.title, options) || options.audioLabel || url;
      const duration = data.asset?.audio?.duration;
      const link = `[${title}](${options.absolute(url)})${
        duration > 0 ? ` (${formatMediaTime(duration)})` : ''
      }`;
      const caption = inlineToMarkdown(data.caption, options);
      return caption ? `${link}\n\n${caption}` : link;
    }
    case 'externalLink': {
      const url = data.url;
      if (!url) return '';
      const title = data.title || url;
      return `[${title}](${url}${linkTitle(data.note, options)})`;
    }
    case 'integration': {
      const url = contentIntegrationUrl(
        block.data as ContentOutputBlock['data'],
      );
      return url ? `[${url}](${url})` : '';
    }
    case 'entityLink': {
      if (data.restricted) return '';
      const url = data.url ?? data.href;
      const title = data.title ? typeset(data.title, options) : url;
      return url
        ? `[${title}](${options.absolute(url)}${linkTitle(data.note, options)})`
        : '';
    }
    case 'privateSectionPlaceholder':
      return `*${options.privateSectionLabel}*`;
    // A boundary is a marker inside the editor, not content; an expanded
    // private section only ever reaches the owner, who is not reading this.
    case 'privateSectionBoundary':
    case 'privateSectionExpanded':
      return '';
    default:
      return '';
  }
}

function renderMedia(
  asset: any,
  caption: unknown,
  options: ContentMarkdownOptions,
): string {
  const src = asset?.media?.src ?? asset?.assetUrl;
  if (!src) return '';
  const text = inlineToMarkdown(caption, options);
  return `![${text}](${options.absolute(src)})`;
}

function renderList(
  data: Record<string, any>,
  options: ContentMarkdownOptions,
  depth = 0,
): string {
  const items = Array.isArray(data.items) ? data.items : [];
  const ordered = data.style === 'ordered';
  // An ordered list may start elsewhere than 1; a nested one starts over.
  const start =
    depth === 0 && typeof data.meta?.start === 'number' ? data.meta.start : 1;
  const lines: string[] = [];
  items.forEach((item: any, index: number) => {
    const content = inlineToMarkdown(
      typeof item === 'string' ? item : item?.content,
      options,
    );
    const marker = ordered ? `${start + index}.` : '-';
    const checked =
      data.style === 'checklist' ? (item?.meta?.checked ? '[x] ' : '[ ] ') : '';
    const prefix = `${'  '.repeat(depth)}${marker} ${checked}`;
    // A line broken inside an item goes on under the item's own text, not at
    // the margin, where it would read as the start of something else.
    const continued = content.replace(/\n/g, `\n${' '.repeat(prefix.length)}`);
    lines.push(`${prefix}${continued}`.trimEnd());
    const nested = item?.items;
    if (Array.isArray(nested) && nested.length)
      lines.push(renderList({ ...data, items: nested }, options, depth + 1));
  });
  return lines.join('\n');
}

/**
 * Inline HTML as Markdown.
 *
 * The editor stores a deliberately small set of inline tags, so this is a
 * short, exact translation rather than a general HTML converter.
 */
export function inlineToMarkdown(
  value: unknown,
  options: ContentMarkdownOptions,
): string {
  if (typeof value !== 'string' || !value) return '';
  const html = options.format
    ? normalizeInlineMarkup(value, options.format)
    : value;
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:b|strong)>/gi, '**')
      .replace(/<\/?(?:i|em)>/gi, '_')
      .replace(/<\/?s>/gi, '~~')
      // A hint reads as the text plus its note in brackets: a reader of the
      // Markdown copy has no hover to reveal it with.
      .replace(
        /<abbr\b[^>]*data-content-hint="([^"]*)"[^>]*>([\s\S]*?)<\/abbr>/gi,
        (_match, hint: string, text: string) =>
          `${text.replace(/<[^>]+>/g, '')} (${typeset(decodeEntities(hint), options)})`,
      )
      .replace(
        /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
        (_match, attributes: string, text: string) => {
          const href = /\bhref="([^"]*)"/.exec(attributes)?.[1];
          // An entity link carries its target in data attributes; one that
          // was given no address keeps its words and loses the link.
          if (!href) return text;
          const note = /\bdata-content-note="([^"]*)"/.exec(attributes)?.[1];
          // The note is read out of the markup here, and what is built from
          // it passes the decoding below once more.
          const title = linkTitle(
            note && decodeEntities(note),
            options,
          ).replace(/&/g, '&amp;');
          return `[${text.replace(/<[^>]+>/g, '')}](${
            href.startsWith('/') ? options.absolute(href) : href
          }${title})`;
        },
      )
      .replace(/<[^>]+>/g, ''),
  ).trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
