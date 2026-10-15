import type {
  OAuthDecision,
  OAuthDecisionResponse,
} from '#layers/thei/shared/oauth';
import { decideRequest } from '../../../../thei/oauth/consent';
import { requireOAuth } from '../../../../thei/oauth/http';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';
import { siteOrigin } from '../../../../thei/site-url';

/**
 * The owner's word on a request: allow, with the rights chosen, or decline.
 * Only from the site's own page — the session cookie is strict, and the
 * origin must be the site's — and only once: the request is decided then.
 */
export default defineEventHandler(
  async (event): Promise<OAuthDecisionResponse> => {
    markReadOnlyRequest(event);
    requireOAuth(event);
    setResponseHeader(event, 'Cache-Control', 'no-store');
    if (getRequestHeader(event, 'origin') !== siteOrigin(event))
      throw createError({ statusCode: 403 });
    const body = (await readBody<Partial<OAuthDecision>>(event)) ?? {};
    const outcome = decideRequest(
      getRouterParam(event, 'requestId') ?? '',
      {
        allow: body.allow === true,
        preset: body.preset === 'editor' ? 'editor' : 'reader',
        label: typeof body.label === 'string' ? body.label : undefined,
      },
      event,
    );
    if (outcome.type === 'gone') throw createError({ statusCode: 404 });
    if (outcome.type === 'limit')
      throw createError({
        statusCode: 409,
        message: THEI_SERVER.phrase.api_token_too_many,
      });
    return { redirect: outcome.url };
  },
);
