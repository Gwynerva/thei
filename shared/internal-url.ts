import { dateFromDiaryUrlPart } from './diary-url';
import { publicIdFromEventUrlPart } from './event-url';
import { publicIdIsValid } from './public-link';
import {
  publicIdFromProjectChildUrlPart,
  publicIdFromProjectUrlPart,
} from './project-url';
import { normalizeBasePath, withoutSiteBase } from './site-url';

/**
 * The entity an address of this site opens, named the way the address names
 * it — by public ID, slug or day — rather than by uuid. Turning that into an
 * entity takes the database, so it is the server's job; recognising the shape
 * is not, and happens here, where the editor can do it as the address is
 * typed or pasted.
 */
export type InternalUrlTarget =
  | { entityType: 'project'; publicId: string }
  | { entityType: 'project-stage'; projectPublicId: string; publicId: string }
  | { entityType: 'project-section'; projectPublicId: string; publicId: string }
  | { entityType: 'event'; publicId: string }
  | { entityType: 'page'; slug: string }
  | { entityType: 'diary-entry'; date: string };

/**
 * Where this site lives. `origins` holds every origin the site answers on —
 * the configured address and the one the admin happens to be using, which
 * differ on a site reached through a second hostname or a tunnel.
 */
export type InternalUrlSite = { origins: string[]; base: string };

/**
 * Recognises an address of this very site that opens an entity.
 *
 * People copy a link from the address bar and paste it as an external link;
 * stored like that, it breaks the day the site moves to another domain. This is
 * what lets the editor notice and store an internal link instead.
 *
 * Accepts an absolute address on one of the site's origins, or a site path
 * with or without the base. A query, a hash, a trailing `index.md` (the
 * Markdown mirror) and a missing trailing slash are all tolerated; anything
 * after the entity's own segments — a tab, a file — is not the entity, and is
 * left alone.
 */
export function parseInternalUrl(
  value: string,
  site: InternalUrlSite,
): InternalUrlTarget | undefined {
  const trimmed = value.trim();
  let pathname: string;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    pathname = trimmed.replace(/[?#].*$/, '');
  } else {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return undefined;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (!site.origins.some((origin) => sameOrigin(origin, url.origin)))
      return undefined;
    pathname = url.pathname;
  }
  const segments = withoutSiteBase(pathname, site.base)
    .replace(/\/index\.md$/, '/')
    .split('/')
    .filter(Boolean)
    .map(decodeSegment);
  return targetFromSegments(segments);
}

function targetFromSegments(segments: string[]): InternalUrlTarget | undefined {
  const [section, part, childKind, childPart, ...rest] = segments;
  if (!section || !part || rest.length) return undefined;
  if (section === 'projects') {
    const projectPublicId = publicIdFromProjectUrlPart(part);
    if (!publicIdIsValid(projectPublicId)) return undefined;
    if (!childKind) return { entityType: 'project', publicId: projectPublicId };
    if (!childPart) return undefined;
    const publicId = publicIdFromProjectChildUrlPart(childPart);
    if (!publicIdIsValid(publicId)) return undefined;
    if (childKind === 'stages')
      return { entityType: 'project-stage', projectPublicId, publicId };
    if (childKind === 'sections')
      return { entityType: 'project-section', projectPublicId, publicId };
    return undefined;
  }
  if (childKind) return undefined;
  if (section === 'events') {
    const publicId = publicIdFromEventUrlPart(part);
    return publicIdIsValid(publicId)
      ? { entityType: 'event', publicId }
      : undefined;
  }
  if (section === 'pages') return { entityType: 'page', slug: part };
  if (section === 'diary') {
    const date = dateFromDiaryUrlPart(part);
    return date ? { entityType: 'diary-entry', date } : undefined;
  }
  return undefined;
}

/**
 * A pattern for Editor.js paste handling: the whole pasted string is an
 * address on one of the site's origins under an entity section. It only has
 * to be good enough to claim the paste; `parseInternalUrl` decides.
 */
export function internalUrlPastePattern(site: InternalUrlSite): RegExp {
  const origins = [...new Set(site.origins.map(normalizeOrigin))]
    .filter(Boolean)
    .map(escapeRegExp);
  if (!origins.length) return /(?!)/;
  const base = escapeRegExp(normalizeBasePath(site.base));
  return new RegExp(
    `^(?:${origins.join('|')})${base}(?:projects|events|pages|diary)/[^\\s]+$`,
    'i',
  );
}

function sameOrigin(a: string, b: string) {
  return normalizeOrigin(a) === normalizeOrigin(b);
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return '';
  }
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
