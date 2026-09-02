import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import {
  isAdminRequestPath,
  publicViewCookieName,
  resolveRequestAdminRole,
} from '#layers/thei/shared/public-view';
import { bootPromise } from '../thei/boot/promise';
import { bootResult } from '../thei/boot/result';

export default defineEventHandler(async (event) => {
  await bootPromise;

  const url = event.node.req.url || '/';
  const path = url.split('?')[0] || '/';

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

      if (isInstallPath || isUpdatePath) {
        return sendRedirect(event, '/');
      }

      const isAuthPath =
        path === '/sign-in/' ||
        (path === '/api/admin/session' && event.method === 'POST');
      if (isAuthPath && isAuthenticatedAdmin) {
        return sendRedirect(event, '/admin/');
      }

      if (isAdminPath && !isAuthPath && !isAuthenticatedAdmin) {
        return blockRequest();
      }

      if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private) {
        if (!isAdmin && !isAuthPath) {
          return blockRequest();
        }
      }

      return;

    case 'install':
      if (!isInstallPath) {
        return sendRedirect(event, '/install/');
      }
      return;

    case 'update':
      if (!isUpdatePath) {
        return sendRedirect(event, '/update/');
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
