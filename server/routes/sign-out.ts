import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import { deleteAuthToken, TOKEN_COOKIE } from '../thei/auth';

export default defineEventHandler(async (event) => {
  const token = getCookie(event, TOKEN_COOKIE) ?? '';
  deleteAuthToken(token);
  deleteCookie(event, TOKEN_COOKIE, { path: '/' });

  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private) {
    return sendRedirect(event, '/sign-in/');
  }

  const referer = getRequestHeader(event, 'referer') ?? '';
  if (referer) {
    try {
      const path = new URL(referer).pathname;
      if (!path.startsWith('/admin/')) {
        return sendRedirect(event, path);
      }
    } catch {}
  }

  return sendRedirect(event, '/sign-in/');
});
