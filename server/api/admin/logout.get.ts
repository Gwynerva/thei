import { deleteAuthToken, TOKEN_COOKIE } from '../../thei/auth';

export default defineEventHandler(async (event) => {
  const token = getCookie(event, TOKEN_COOKIE) ?? '';
  deleteAuthToken(token);
  deleteCookie(event, TOKEN_COOKIE, { path: '/' });

  const referer = getRequestHeader(event, 'referer') ?? '';
  let redirectTo = '/';
  if (referer) {
    try {
      const pathname = new URL(referer).pathname;
      if (!pathname.startsWith('/admin/')) {
        redirectTo = pathname;
      }
    } catch {
      // Malformed Referer — fall back to '/'
    }
  }

  return sendRedirect(event, redirectTo);
});
