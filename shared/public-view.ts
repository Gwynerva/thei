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

export function resolveRequestAdminRole(options: {
  isAuthenticatedAdmin: boolean;
  path: string;
  publicViewCookie?: string;
}): boolean {
  if (!options.isAuthenticatedAdmin) return false;
  if (isAdminRequestPath(options.path)) return true;
  return options.publicViewCookie !== publicViewGuestValue;
}
