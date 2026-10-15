import type { OAuthRequestView } from '#layers/thei/shared/oauth';
import { readRequest } from '../../../../thei/oauth/consent';
import { requireOAuth } from '../../../../thei/oauth/http';

/**
 * A request for a connection, as its consent page shows it. The page asks
 * once it is in the owner's browser: an admin route, so the session — which
 * a redirect from another site does not carry — is checked here.
 */
export default defineEventHandler((event): OAuthRequestView => {
  requireOAuth(event);
  setResponseHeader(event, 'Cache-Control', 'no-store');
  const view = readRequest(getRouterParam(event, 'requestId') ?? '');
  if (!view) throw createError({ statusCode: 404 });
  return view;
});
