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
    return oauthAnswer(event, oauthError('invalid_request', 'POST only.', 405));
  if (!registerLimit.take(getRequestIp(event) ?? 'unknown'))
    return oauthAnswer(
      event,
      oauthError(
        'temporarily_unavailable',
        'Too many registrations; try later.',
        429,
      ),
    );
  const body = await readJson(event);
  if (body === undefined)
    return oauthAnswer(
      event,
      oauthError('invalid_client_metadata', 'A JSON body of at most 16 KB.'),
    );
  return oauthAnswer(event, await registerClient(body));
});
