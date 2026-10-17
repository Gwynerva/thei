/**
 * Where a request goes while the site is closed for an update: the update
 * screen and its API are served, other API calls are told to come back later,
 * and every page leads to the update screen. An AI app signing in is told to
 * come back later too: led to the update screen, it would take that page for
 * the answer it asked for.
 */
export function closedSiteRoute(
  path: string,
): 'allow' | 'unavailable' | 'redirect' {
  if (path === '/update/' || path.startsWith('/api/update/')) return 'allow';
  if (
    path.startsWith('/api/') ||
    path.startsWith('/oauth/') ||
    path.startsWith('/.well-known/oauth-')
  )
    return 'unavailable';
  return 'redirect';
}

/** Seconds a client is asked to wait before calling a closed site again. */
export const CLOSED_SITE_RETRY_AFTER = 5;
