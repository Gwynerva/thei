import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import {
  isAdminRequestPath,
  publicViewCookieName,
  resolveRequestAdminRole,
} from '#layers/thei/shared/public-view';
import { bootPromise } from '../thei/boot/promise';
import { bootResult } from '../thei/boot/result';
import { getRequestPath } from '../thei/request';
import { siteOrigin, sitePath } from '../thei/site-url';
import {
  readShareGrants,
  resolveShareGrantPaths,
  SHARE_COOKIE_NAME,
} from '../thei/access-links/share-links';

export default defineEventHandler(async (event) => {
  await bootPromise;

  const path = getRequestPath(event);

  const isInternalPath =
    path.startsWith('/_nuxt') || path.startsWith('/__nuxt');
  if (isInternalPath) {
    return;
  }

  // Only skip middleware for genuine static public files at the root level
  // (e.g. /favicon.svg, /robots.txt, /icons.svg).
  // Multi-segment paths like /projects/slug/icon/abc.webp must NOT be skipped —
  // they are dynamic routes that enforce container access control.
  const isPublicStaticFile = /^\/[^/]+\.\w+$/.test(path);
  if (isPublicStaticFile) {
    return;
  }

  const alwaysAvailable = ['/api/admin/profile'];
  if (
    alwaysAvailable.includes(path) ||
    // Icons, like `/favicon.ico` beside them: the sign-in page of a closed
    // site needs Thei's, and the site's own is no secret either.
    path.startsWith('/favicon/') ||
    path.startsWith('/api/generated-icons/') ||
    path.startsWith('/media/generated-icons/') ||
    path.startsWith('/media/external-link-favicons/')
  ) {
    return;
  }

  const isInstallPath = path === '/install/' || path === '/api/installation';
  const isUpdatePath = path === '/update/';
  const isAdminPath = isAdminRequestPath(path);
  const isAuthenticatedAdmin = await THEI_SERVER.isAuthenticatedAdmin(event);
  const isAdmin = resolveRequestAdminRole({
    isAuthenticatedAdmin,
    path,
    publicViewCookie: getCookie(event, publicViewCookieName),
  });

  switch (bootResult.type) {
    case 'ready':
      event.context.languageCode = THEI_SERVER.language.code;
      event.context.isAuthenticatedAdmin = isAuthenticatedAdmin;
      event.context.isAdmin = isAdmin;
      // Resolved here rather than in the pages so that a rendered page and the
      // sitemap it is listed in always agree on the site's own address.
      event.context.siteOrigin = siteOrigin(event);
      // Resolved once per request: a page, the API calls it makes and the
      // media it references all have to agree on what the visitor may see.
      if (getCookie(event, SHARE_COOKIE_NAME)) {
        const grants = readShareGrants(event);
        event.context.shareGrants = grants;
        if (grants.size) {
          // A share link is a private view, and a crawler that follows the
          // address out of a chat would be holding the same cookie as anyone
          // else. Nothing seen through one belongs in an index.
          setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
          if (!path.startsWith('/api/'))
            event.context.shareGrantPaths =
              await resolveShareGrantPaths(grants);
        }
      }

      if (isInstallPath || isUpdatePath) {
        return sendRedirect(event, sitePath('/'));
      }

      // The backup client has no session cookie and cannot get one. Its routes
      // authenticate themselves against the instance token, which also has to
      // work while the site is private — a closed site still needs backups.
      if (path.startsWith('/api/backup/')) {
        return;
      }

      const isAuthPath =
        path === '/sign-in/' ||
        path.startsWith('/sign-in/link/') ||
        ((path === '/api/admin/session' ||
          path === '/api/admin/session/link') &&
          event.method === 'POST');
      if (isAuthPath && isAuthenticatedAdmin) {
        return sendRedirect(event, sitePath('/admin/'));
      }

      if (isAdminPath && !isAuthPath && !isAuthenticatedAdmin) {
        return blockRequest();
      }

      if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private) {
        // Belongs on every response, not only the blocked ones: the admin
        // browsing their own private site is served real pages, and a cached
        // copy of one can outlive the switch back to public.
        setHeader(event, 'X-Robots-Tag', 'noindex, nofollow');
        if (!isAdmin && !isAuthPath) {
          return blockRequest();
        }
      }

      return;

    case 'install':
      if (!isInstallPath) {
        return sendRedirect(event, sitePath('/install/'));
      }
      return;

    case 'update':
      // Handed to the page through a plugin rather than an API route: the boot
      // stopped before the database was ready, so there is nothing to query.
      event.context.bootUpdate = {
        reason: bootResult.reason,
        migrationId: bootResult.migrationId,
        fromVersion: bootResult.fromVersion,
        toVersion: bootResult.toVersion,
        message: bootResult.message,
      };

      if (!isUpdatePath) {
        return sendRedirect(event, sitePath('/update/'));
      }
      return;

    case 'error':
      throw createError({
        statusCode: 503,
        statusMessage: 'Thei Boot Error',
        message: bootResult.message,
      });
  }
});

function blockRequest(): never {
  throw createError({
    statusCode: 403,
    statusMessage: 'Forbidden',
  });
}
