import type { MediaDescriptor } from './media';

export const EXTERNAL_LINK_TEXT_LIMIT = 300;
export const EXTERNAL_LINK_LIST_LIMIT = 100;
export const EXTERNAL_LINK_NAME_LIMIT = 300;

/**
 * How the details of a link were obtained: from the site itself, from an
 * archived copy of the page, or not at all (the hostname stands in).
 */
export type ExternalLinkStatus = 'complete' | 'archived' | 'fallback';

/**
 * What a card shows. A stored record fits it, and so does a resolved inline
 * link or a public reference, which carry no more than this.
 */
export interface ExternalLinkPreview {
  url: string;
  title?: string;
  description?: string;
  faviconMedia?: MediaDescriptor;
  status?: ExternalLinkStatus;
}

/** A stored record of a site. */
export interface ExternalLink extends ExternalLinkPreview {
  faviconMedia: MediaDescriptor;
  status: ExternalLinkStatus;
  touchedAt: number;
}

/** One entry of a manual link list, as it is saved. */
export interface ExternalLinkListItem {
  url: string;
  name: string;
  isPrivate: boolean;
}

/**
 * One entry of a manual link list, as it is read: the record and the entry's
 * own name.
 */
export interface ProjectExternalLink extends ExternalLink {
  name: string;
  isPrivate: boolean;
}

/** What a form keeps of a link list it was given with full records. */
export function externalLinkListItems(
  links: Iterable<ExternalLinkListItem> | undefined,
): ExternalLinkListItem[] {
  return Array.from(links ?? [], ({ url, name, isPrivate }) => ({
    url,
    name,
    isPrivate,
  }));
}

export function externalLinkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export function normalizeExternalLinkUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid external link URL');
  const trimmed = value.trim();
  if (!trimmed) throw new Error('External link URL cannot be empty');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Invalid external link URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('External link must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('External link cannot contain credentials');
  }
  return url.href;
}

export function truncateExternalLinkText(
  value: unknown,
  limit = EXTERNAL_LINK_TEXT_LIMIT,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;
  const characters = Array.from(normalized);
  if (characters.length <= limit) return normalized;
  return `${characters.slice(0, Math.max(0, limit - 1)).join('')}…`;
}

/**
 * A manual link list as the client sent it, checked the same way wherever it
 * belongs. `fail` raises the caller's own kind of error; an absent list is
 * left absent, so a form that did not send one changes nothing.
 */
export function validateExternalLinkList(
  links: unknown,
  fail: (message: string) => never,
): ExternalLinkListItem[] | undefined {
  if (links === undefined) return undefined;
  if (!Array.isArray(links)) fail('Invalid external links');
  if (links.length > EXTERNAL_LINK_LIST_LIMIT) fail('Too many external links');
  const seen = new Set<string>();
  return links.map((item): ExternalLinkListItem => {
    if (!item || typeof item !== 'object') fail('Invalid external link');
    const link = item as Record<string, unknown>;
    let url: string;
    try {
      url = normalizeExternalLinkUrl(link.url);
    } catch (error) {
      fail(
        error instanceof Error ? error.message : 'Invalid external link URL',
      );
    }
    if (seen.has(url)) fail('Duplicate external link');
    seen.add(url);
    const name = typeof link.name === 'string' ? link.name.trim() : '';
    if (!name) fail('External link name cannot be empty');
    if (Array.from(name).length > EXTERNAL_LINK_NAME_LIMIT)
      fail('External link name is too long');
    if (typeof link.isPrivate !== 'boolean')
      fail('Invalid external link privacy');
    return { url, name, isPrivate: link.isPrivate };
  });
}
