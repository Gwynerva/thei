/**
 * The site's own address.
 *
 * Absolute links — `rel=canonical`, the JSON-LD graph, `<loc>` in the sitemap,
 * the `Sitemap:` line in robots.txt — are derived from the incoming request by
 * default, which is correct only while exactly one hostname reaches the
 * instance and the proxy forwards `Host` and `X-Forwarded-Proto`. An operator
 * who serves the site under both an apex and a `www` hostname, or behind a
 * proxy that rewrites neither, configures the address explicitly instead.
 *
 * The address may carry a path, for a site served from a subfolder such as
 * `https://example.com/diary`. That path becomes the build's `app.baseURL`.
 *
 * One rule keeps the subfolder manageable: a path stored or passed around in
 * data — API responses, `shared/*-url.ts`, media `src`, canonical paths — never
 * includes the base. The base is added only on the way out: by the router for
 * navigation, by `withSiteBase` for DOM attributes and redirects, and by
 * `resolveSiteUrl` for absolute URLs.
 */

/**
 * Validate an operator-supplied site address.
 *
 * Returns the normalized address without a trailing slash (`origin` or
 * `origin/path`), `''` when the field is left empty — which means "derive it
 * from the request" — and `undefined` when the value cannot be used.
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
  const path = url.pathname.replace(/\/+$/, '');
  // Each segment must survive as a plain URL path segment.
  if (path && !/^(\/[A-Za-z0-9._~-]+)+$/.test(path)) return undefined;
  return url.origin + path;
}

/** The origin part of a normalized site address, or `''` when unset. */
export function siteUrlOrigin(siteUrl: string): string {
  return siteUrl ? new URL(siteUrl).origin : '';
}

/**
 * The base path a normalized site address asks for, always with a leading and
 * a trailing slash: `/` for a site at the domain root, `/diary/` otherwise.
 */
export function siteUrlBasePath(siteUrl: string): string {
  if (!siteUrl) return '/';
  return normalizeBasePath(new URL(siteUrl).pathname);
}

/** `diary`, `/diary`, `/diary/` → `/diary/`; empty → `/`. */
export function normalizeBasePath(base: string): string {
  const trimmed = base.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

/** Prefix a site path (which never carries the base) with the base path. */
export function withSiteBase(path: string, base: string): string {
  const normalized = normalizeBasePath(base);
  if (normalized === '/') return path.startsWith('/') ? path : `/${path}`;
  return normalized + path.replace(/^\/+/, '');
}

/** Strip the base path from a path that carries it, e.g. `location.pathname`. */
export function withoutSiteBase(path: string, base: string): string {
  const normalized = normalizeBasePath(base);
  if (normalized === '/') return path;
  if (path === normalized.slice(0, -1)) return '/';
  return path.startsWith(normalized) ? path.slice(normalized.length - 1) : path;
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
