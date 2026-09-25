export const publicViewCookieName = 'thei-public-view';
export const publicViewGuestValue = 'guest';

export function isAdminRequestPath(path: string): boolean {
  return (
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path === '/api/admin' ||
    path.startsWith('/api/admin/')
  );
}

/**
 * The engine's own screens rather than the site's content. Public view shows
 * the site as a guest sees it; the update screen, like the admin bar, keeps
 * answering the signed-in admin as such.
 */
export function isEngineRequestPath(path: string): boolean {
  return path.startsWith('/api/update/');
}

export function resolveRequestAdminRole(options: {
  isAuthenticatedAdmin: boolean;
  path: string;
  publicViewCookie?: string;
}): boolean {
  if (!options.isAuthenticatedAdmin) return false;
  if (isAdminRequestPath(options.path) || isEngineRequestPath(options.path))
    return true;
  return options.publicViewCookie !== publicViewGuestValue;
}
