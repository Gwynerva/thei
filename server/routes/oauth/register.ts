import { registerClient } from '../../thei/oauth/clients';
import {
  answeredPreflight,
  oauthAnswer,
  oauthError,
  readJson,
  requireOAuth,
} from '../../thei/oauth/http';
import { registerLimit } from '../../thei/oauth/limits';
import { getRequestIp } from '../../thei/request';

/** Where an app with no description of its own registers itself (RFC 7591). */
export default defineEventHandler(async (event) => {
  requireOAuth(event);
  if (answeredPreflight(event)) return null;
  if (event.method !== 'POST')
    return oauthError(event, 405, 'invalid_request', 'POST only.');
  if (!registerLimit.take(getRequestIp(event) ?? 'unknown'))
    return oauthError(
      event,
      429,
      'temporarily_unavailable',
      'Too many registrations; try later.',
    );
  const body = await readJson(event);
  if (body === undefined)
    return oauthError(
      event,
      400,
      'invalid_client_metadata',
      'A JSON body of at most 16 KB.',
    );
  const result = await registerClient(body);
  return result.ok
    ? oauthAnswer(event, 201, result.body)
    : oauthError(event, result.status, result.error, result.description);
});
