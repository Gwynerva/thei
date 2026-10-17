import { startAuthorization } from '../../thei/oauth/authorize';
import { requireOAuth } from '../../thei/oauth/http';
import { getRequestIp } from '../../thei/request';
import { sitePath } from '../../thei/site-url';

/**
 * Where an app sends the owner's browser to ask for a connection. What
 * comes of it is a page: the owner's consent, the site's own refusal, or
 * the app's address with its answer. An address that asks too often is
 * told so by the site alone: the app may not be known yet.
 */
export default defineEventHandler(async (event) => {
  requireOAuth(event);
  setResponseHeaders(event, {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  const outcome = await startAuthorization(
    getQuery(event),
    event,
    getRequestIp(event) ?? 'unknown',
  );
  if (outcome.type === 'busy')
    throw createError({ statusCode: 429, statusMessage: 'Too Many Requests' });
  if (outcome.type === 'consent')
    return sendRedirect(
      event,
      sitePath(`/oauth/consent/${outcome.requestId}/`),
      303,
    );
  if (outcome.type === 'refused')
    return sendRedirect(
      event,
      sitePath(`/oauth/refused/?reason=${outcome.reason}`),
      303,
    );
  return sendRedirect(event, outcome.url, 303);
});
