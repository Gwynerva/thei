import { getRequestURL, type H3Event } from 'h3';
import {
  normalizeBasePath,
  resolveSiteUrl,
  siteUrlOrigin,
  withSiteBase,
} from '#layers/thei/shared/site-url';
import type { InternalUrlSite } from '#layers/thei/shared/internal-url';

/**
 * The base path this build serves from (`/` or `/diary/`).
 *
 * Taken from the running build rather than from the configured address: when
 * the two disagree, a rebuild is pending and the build is what actually
 * answers requests.
 */
export function siteBasePath(): string {
  return normalizeBasePath(useRuntimeConfig().app.baseURL);
}

/** The configured site origin, falling back to the request's own origin. */
export function siteOrigin(event: H3Event): string {
  return (
    siteUrlOrigin(THEI_SERVER.config.siteUrl) || getRequestURL(event).origin
  );
}

/** Origin plus base path, without a trailing slash. */
export function siteRoot(event: H3Event): string {
  return resolveSiteUrl(siteOrigin(event), siteBasePath()).replace(/\/$/, '');
}

/** Absolute URL for a site path. */
export function siteUrl(event: H3Event, path: string): string {
  return resolveSiteUrl(siteRoot(event), path);
}

/** A site path as seen from outside: prefixed with the base path. */
export function sitePath(path: string): string {
  return withSiteBase(path, siteBasePath());
}

/**
 * What counts as this site when an address is checked for being one of its
 * own: the configured origin and, during a request, the origin it came in on —
 * an admin working through a second hostname pastes addresses from that one.
 */
export function internalUrlSite(event?: H3Event): InternalUrlSite {
  return {
    origins: [
      siteUrlOrigin(THEI_SERVER.config.siteUrl),
      event ? getRequestURL(event).origin : '',
    ].filter(Boolean),
    base: siteBasePath(),
  };
}
