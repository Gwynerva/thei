import {
  answeredPreflight,
  oauthAnswer,
  readForm,
  requireOAuth,
} from '../../thei/oauth/http';
import { revokeKey } from '../../thei/oauth/tokens';

/**
 * Where an app ends its connection (RFC 7009). Answered the same whatever
 * the key was, so the answer tells nothing.
 */
export default defineEventHandler(async (event) => {
  requireOAuth(event);
  if (answeredPreflight(event)) return null;
  if (event.method === 'POST') {
    const form = await readForm(event);
    if (form) revokeKey(form);
  }
  return oauthAnswer(event, { status: 200, body: {} });
});
