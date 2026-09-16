/**
 * The site's own address.
 *
 * Absolute links — `rel=canonical`, the JSON-LD graph, `<loc>` in the sitemap,
 * the `Sitemap:` line in robots.txt — are derived from the incoming request by
 * default, which is correct only while exactly one hostname reaches the
 * instance and the proxy forwards `Host` and `X-Forwarded-Proto`. An operator
 * who serves the site under both an apex and a `www` hostname, or behind a
 * proxy that rewrites neither, configures the address explicitly instead.
 */

/**
 * Validate an operator-supplied site address.
 *
 * Returns the normalized origin, `''` when the field is left empty — which
 * means "derive it from the request" — and `undefined` when the value cannot
 * be used. A path is rejected rather than accepted and ignored: serving the
 * site from a subfolder needs `app.baseURL` as well, which the engine does not
 * support yet.
 */
export function normalizeSiteUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (!url.hostname) return undefined;
  if (url.username || url.password) return undefined;
  if (url.search || url.hash) return undefined;
  if (url.pathname !== '/') return undefined;
  return url.origin;
}

/**
 * Join a site-relative path onto the site address.
 *
 * Written as a join rather than `new URL(path, base)` so that a base carrying
 * a path keeps it: a leading slash in `path` would otherwise discard it.
 */
export function resolveSiteUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
