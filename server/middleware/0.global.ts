import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import { bootPromise } from '../thei/boot/promise';
import { bootResult } from '../thei/boot/result';
import { isAdminSession } from '../thei/admin-session';

export default defineEventHandler(async (event) => {
  await bootPromise;

  const url = event.node.req.url || '/';
  const path = url.split('?')[0] || '/';

  const isInternalPath =
    path.startsWith('/_nuxt') || path.startsWith('/__nuxt');
  if (isInternalPath) {
    return;
  }

  const isPublicAsset = !path.startsWith('/assets/') && /\.\w+$/.test(path);
  if (isPublicAsset) {
    return;
  }

  const alwaysAvailable = ['/api/public-admin/'];
  if (alwaysAvailable.includes(path)) {
    return;
  }

  const isInstallPath = path === '/install/' || path === '/api/install/';
  const isUpdatePath = path === '/update/' || path === '/api/update/';
  const isAdminPath =
    path.startsWith('/admin/') || path.startsWith('/api/admin/');
  const isAdmin = await isAdminSession(event);

  switch (bootResult.type) {
    case 'ready':
      event.context.languageCode = THEI_SERVER.language.code;
      event.context.isAdmin = isAdmin;

      if (isInstallPath || isUpdatePath) {
        return sendRedirect(event, '/');
      }

      const isAuthPath = path === '/sign-in/' || path === '/api/sign-in/';
      if (isAuthPath && isAdmin) {
        return sendRedirect(event, '/admin/');
      }

      if (isAdminPath && !isAdmin) {
        return blockRequest();
      }

      if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private) {
        if (path === '/') {
          return sendRedirect(event, '/sign-in/');
        }

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
