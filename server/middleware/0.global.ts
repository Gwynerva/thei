import { isAdminRequest } from '../thei/auth';
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
  const isAdmin = isAdminRequest(event);

  switch (bootResult.type) {
    case 'ready':
      event.context.languageCode = THEI_SERVER.language.code;

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

// import { sn } from 'unslash';
// import { bootPromise } from '../thei/boot/promise';
// import { bootResult } from '../thei/boot/result';
// import { isAdminRequest } from '../thei/auth';

// type PublicWhitelistRule = string | ((path: string) => boolean);

// function blockRequest(): never {
//   throw createError({
//     statusCode: 403,
//     statusMessage: 'Forbidden',
//   });
// }

// const snt = sn(/t/);

// export default defineEventHandler(async (event) => {
//   await bootPromise;

//   const url = event.node.req.url || '/';
//   const path = url.split('?')[0] || '/';

//   /* Nuxt internal assets */
//   const isInternalAsset =
//     path.startsWith('/_nuxt') || path.startsWith('/__nuxt');

//   if (isInternalAsset) {
//     return;
//   }

//   const isAdmin = isAdminRequest(event);
//   const isSiteOpen = THEI_SERVER?.config?.siteAccessLevel === 'public';

//   /* Content assets */
//   const isContentAsset = path.startsWith('/assets/');

//   /* Special routes */
//   const isInstallPath =
//     snt(path) === '/install/' || snt(path) === '/api/install/';

//   const isUpdatePath = snt(path) === '/update/' || snt(path) === '/api/update/';

//   const isAdminPath =
//     path.startsWith('/admin/') || path.startsWith('/api/admin/');

//   const isAuthPage = path.startsWith('/auth/');
//   const isAuthApi = path.startsWith('/api/auth/');

//   switch (bootResult.type) {
//     case 'ready': {
//       /* Prevent install/update access after boot */
//       if (isInstallPath || isUpdatePath) {
//         return sendRedirect(event, '/');
//       }

//       event.context.languageCode = THEI_SERVER.language.code;
//       event.context.isAdmin = isAdmin;

//       /* Admin-only routes */
//       if (isAdminPath && !isAdmin) {
//         blockRequest();
//       }

//       /* Validate auth path secret page and API endpoint */
//       if (isAuthPage || isAuthApi) {
//         let authSegment = '';

//         try {
//           authSegment = decodeURIComponent(
//             path
//               .split('/')
//               .slice(isAuthPage ? 2 : 3)
//               .join('/'),
//           );
//         } catch {
//           blockRequest();
//         }

//         const correctAuthSegment = decodeURIComponent(
//           THEI_SERVER.config.secretPhrase,
//         );

//         if (authSegment !== correctAuthSegment) {
//           blockRequest();
//         }
//       }

//       /*
//        * Closed site protection
//        *
//        * Only evaluated when site is closed
//        * to avoid unnecessary checks in open mode.
//        */
//       if (!isSiteOpen && !isAdmin) {
//         /*
//          * Public routes accessible while closed
//          */
//         const publicWhitelist: PublicWhitelistRule[] = ['/api/public-admin'];

//         const isWhitelisted = publicWhitelist.some((rule) => {
//           if (typeof rule === 'string') {
//             return path === rule;
//           }

//           return rule(path);
//         });

//         const isPublicAllowedPath = isAuthPage || isAuthApi || isWhitelisted;

//         /*
//          * Allow:
//          * - auth pages
//          * - explicitly whitelisted routes
//          * - public assets and not content assets (which are assets uploaded by admin)
//          *
//          * Block everything else
//          */
//         if (!isPublicAllowedPath && !isContentAsset) {
//           blockRequest();
//         }
//       }

//       return;
//     }

//     case 'error':
//       throw createError({
//         statusCode: 503,
//         statusMessage: 'Thei Boot Error',
//         message: bootResult.message,
//       });

//     case 'install':
//       if (isInstallPath) {
//         return;
//       }

//       THEI_SERVER.console.warn(
//         `Attempting to visit "${url}" while in install mode! Redirecting...`,
//       );

//       return sendRedirect(event, '/install/');

//     case 'update':
//       if (isUpdatePath) {
//         return;
//       }

//       THEI_SERVER.console.warn(
//         `Attempting to visit "${url}" while in update mode! Redirecting...`,
//       );

//       return sendRedirect(event, '/update/');
//   }
// });
