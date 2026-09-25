import {
  normalizeExternalLinkUrl,
  type ExternalLink,
} from '#layers/thei/shared/external-link';
import { refreshExternalLink } from '../../thei/external-links/repository';

/**
 * Reads the site again and stores what it says. This is what a link that
 * was just put in, or one the admin asked to refresh, goes through.
 */
export default defineEventHandler(async (event): Promise<ExternalLink> => {
  const body = await readBody<{ url?: unknown }>(event);
  return await refreshExternalLink(requestedUrl(body?.url));
});

function requestedUrl(value: unknown) {
  try {
    return normalizeExternalLinkUrl(value);
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage:
        error instanceof Error ? error.message : 'Invalid external link',
    });
  }
}
