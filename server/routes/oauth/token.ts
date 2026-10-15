import {
  answeredPreflight,
  oauthAnswer,
  oauthError,
  readForm,
  requireOAuth,
} from '../../thei/oauth/http';
import { mcpResource } from '../../thei/oauth/base';
import { tokenFailureLimit } from '../../thei/oauth/limits';
import { exchangeCode, renewKeys } from '../../thei/oauth/tokens';
import { getRequestIp } from '../../thei/request';

/**
 * Where an app turns its code into a connection, and renews it. A run of
 * failures from one address is slowed down: a code or a refresh key is far
 * too long to guess, so only a broken client is held up.
 */
export default defineEventHandler(async (event) => {
  requireOAuth(event);
  if (answeredPreflight(event)) return null;
  if (event.method !== 'POST')
    return oauthError(event, 405, 'invalid_request', 'POST only.');
  const ip = getRequestIp(event) ?? 'unknown';
  if (tokenFailureLimit.exceeded(ip))
    return oauthError(
      event,
      429,
      'invalid_request',
      'Too many failures; wait.',
    );
  const form = await readForm(event);
  if (!form)
    return oauthError(
      event,
      400,
      'invalid_request',
      'A form body, each parameter once.',
    );
  const answer =
    form.grant_type === 'authorization_code'
      ? exchangeCode(form, mcpResource(event))
      : form.grant_type === 'refresh_token'
        ? renewKeys(form, mcpResource(event))
        : {
            status: 400,
            body: {
              error: 'unsupported_grant_type',
              error_description: 'authorization_code or refresh_token.',
            },
          };
  if (answer.status !== 200) tokenFailureLimit.take(ip);
  return oauthAnswer(event, answer.status, answer.body);
});
