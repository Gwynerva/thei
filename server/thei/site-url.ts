import { getRequestURL, type H3Event } from 'h3';
import { resolveSiteUrl } from '#layers/thei/shared/site-url';

/** The configured site address, falling back to the request's own origin. */
export function siteOrigin(event: H3Event): string {
  return THEI_SERVER.config.siteUrl || getRequestURL(event).origin;
}

/** Absolute URL for a site-relative path. */
export function siteUrl(event: H3Event, path: string): string {
  return resolveSiteUrl(siteOrigin(event), path);
}
