import {
  normalizeExternalLinkUrl,
  type ExternalLink,
} from '#layers/thei/shared/external-link';
import { lookupExternalLink } from '../../thei/external-links/repository';

/** The stored record of a link, read from the site only if there is none. */
export default defineEventHandler(async (event): Promise<ExternalLink> => {
  return await lookupExternalLink(requestedUrl(getQuery(event).url));
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
