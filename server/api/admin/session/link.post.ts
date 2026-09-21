import type { H3Event } from 'h3';
import { createAdminSession } from '../../../thei/admin-session';
import { consumeSignInLink } from '../../../thei/access-links/sign-in-links';
import { isSignInRateLimited } from '../../../thei/access-links/rate-limit';

type SignInLinkResponse =
  { type: 'success' } | { type: 'error'; message: string };

/**
 * Spends a one-time sign-in link.
 *
 * A POST, not a GET: link previews in messengers fetch the address the moment
 * it is sent, and a GET would let a preview bot burn the link before the phone
 * ever opened it. The page behind the link asks for one tap instead.
 */
export default defineEventHandler(
  async (event: H3Event): Promise<SignInLinkResponse> => {
    if (isSignInRateLimited(event))
      return {
        type: 'error',
        message: THEI_SERVER.phrase.sign_in_too_many_attempts,
      };
    const body = await readBody<{ token?: string }>(event);
    if (!body?.token || !consumeSignInLink(body.token))
      return {
        type: 'error',
        message: THEI_SERVER.phrase.sign_in_link_invalid,
      };
    await createAdminSession(event);
    return { type: 'success' };
  },
);
