import type { MediaDescriptor } from './media';
import { normalizeCaptionText } from './terminal-punctuation';

export const EXTERNAL_LINK_TEXT_LIMIT = 300;
export const EXTERNAL_LINK_LIST_LIMIT = 100;
export const EXTERNAL_LINK_NAME_LIMIT = 300;
/**
 * The longest note a field lets the owner type about a link. A manual list
 * refuses a longer one; content keeps what it was given, since a document is
 * never refused over one of its words.
 */
export const EXTERNAL_LINK_NOTE_LIMIT = 300;

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

/**
 * One entry of a manual link list, as it is saved. The page speaks for itself
 * — its own title and description are shown — and `note` is the owner's word
 * on why it is there, empty when there is none.
 */
export interface ExternalLinkListItem {
  url: string;
  note: string;
  isPrivate: boolean;
}

/**
 * An entry of the profile's list, which is shown as a row of chips: each one
 * carries a short name of the owner's choosing, such as «GitHub».
 */
export interface NamedExternalLinkListItem extends ExternalLinkListItem {
  name: string;
}

/**
 * One entry of a manual link list, as it is read: the site's record and the
 * entry's own note.
 */
export interface ProjectExternalLink extends ExternalLink {
  note: string;
  isPrivate: boolean;
}

/** An entry of the profile's list, as it is read. */
export interface NamedExternalLink extends ProjectExternalLink {
  name: string;
}

/**
 * What a form keeps of a list entry, in one order of keys, so that a form
 * compares an entry it made with one it was given as equal.
 */
export function externalLinkListItem({
  url,
  note,
  isPrivate,
}: ExternalLinkListItem): ExternalLinkListItem {
  return { url, note, isPrivate };
}

export function namedExternalLinkListItem({
  url,
  name,
  note,
  isPrivate,
}: NamedExternalLinkListItem): NamedExternalLinkListItem {
  return { url, name, note, isPrivate };
}

/** What a form keeps of a link list it was given with full records. */
export function externalLinkListItems(
  links: Iterable<ExternalLinkListItem> | undefined,
): ExternalLinkListItem[] {
  return Array.from(links ?? [], externalLinkListItem);
}

/** The same for the profile's list, which keeps each entry's name too. */
export function namedExternalLinkListItems(
  links: Iterable<NamedExternalLinkListItem> | undefined,
): NamedExternalLinkListItem[] {
  return Array.from(links ?? [], namedExternalLinkListItem);
}

export function externalLinkHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

/**
 * What makes two addresses "the same link" to a reader: the fragment and a
 * trailing slash do not open a different page. Everything that decides
 * whether two links repeat each other compares this.
 */
export function externalLinkIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.pathname.length > 1)
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.href;
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

/**
 * Whether an address looks finished enough to be read while it is still
 * being typed. `https://exa` is a valid address, but reading it would fetch a
 * site nobody meant. The host is taken from the text as typed, because the
 * URL parser completes partial hosts on its own — `https://192.168` becomes
 * `192.0.0.168` — and turns a one-letter zone into a long punycode one.
 */
export function externalLinkHostLooksComplete(raw: string): boolean {
  try {
    normalizeExternalLinkUrl(raw);
  } catch {
    return false;
  }
  const host =
    raw
      .trim()
      .replace(/^[a-z][a-z\d+.-]*:[\\/]*/i, '')
      .split(/[/?#\\]/, 1)[0] ?? '';
  // The parser only accepts an IPv6 literal once it is closed.
  if (host.startsWith('[')) return true;
  const labels = host.replace(/:\d*$/, '').split('.');
  if (labels.length < 2 || labels.some((label) => !label)) return false;
  if (labels.every((label) => /^\d+$/.test(label))) return labels.length === 4;
  return Array.from(labels.at(-1)!).length >= 2;
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
 * A manual list entry as a form sends it. `note` is optional on the way in
 * only for an admin panel of the previous release still open in a browser,
 * which knows nothing of notes: an entry sent without one keeps the note it
 * has (`applyExternalLinkList`).
 */
export type ExternalLinkListInput = Omit<ExternalLinkListItem, 'note'> & {
  note?: string;
};

export type NamedExternalLinkListInput = ExternalLinkListInput & {
  name: string;
};

type Fail = (message: string) => never;

/**
 * A manual link list as the client sent it, checked the same way wherever it
 * belongs. `fail` raises the caller's own kind of error; an absent list is
 * left absent, so a form that did not send one changes nothing.
 */
export function validateExternalLinkList(
  links: unknown,
  fail: Fail,
): ExternalLinkListInput[] | undefined {
  return validateLinkList(links, fail, () => ({}));
}

/** The profile's list, whose every entry also carries a name. */
export function validateNamedExternalLinkList(
  links: unknown,
  fail: Fail,
): NamedExternalLinkListInput[] | undefined {
  return validateLinkList(links, fail, (link) => ({
    name: readLinkName(link.name, fail),
  }));
}

function validateLinkList<T extends object>(
  links: unknown,
  fail: Fail,
  read: (link: Record<string, unknown>) => T,
): (ExternalLinkListInput & T)[] | undefined {
  if (links === undefined) return undefined;
  if (!Array.isArray(links)) fail('Invalid external links');
  if (links.length > EXTERNAL_LINK_LIST_LIMIT) fail('Too many external links');
  const seen = new Set<string>();
  return links.map((item) => {
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
    const note = readLinkNote(link.note, fail);
    if (typeof link.isPrivate !== 'boolean')
      fail('Invalid external link privacy');
    return {
      url,
      ...read(link),
      ...(note === undefined ? {} : { note }),
      isPrivate: link.isPrivate,
    };
  });
}

function readLinkNote(value: unknown, fail: Fail): string | undefined {
  if (value === undefined) return undefined;
  const note =
    typeof value === 'string' ? normalizeCaptionText(value.trim()) : '';
  if (Array.from(note).length > EXTERNAL_LINK_NOTE_LIMIT)
    fail('External link note is too long');
  return note;
}

function readLinkName(value: unknown, fail: Fail): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) fail('External link name cannot be empty');
  if (Array.from(name).length > EXTERNAL_LINK_NAME_LIMIT)
    fail('External link name is too long');
  return name;
}
