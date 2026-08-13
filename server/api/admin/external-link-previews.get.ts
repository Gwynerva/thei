import type { ExternalLink } from '#layers/thei/shared/external-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import { findExternalLink } from '../../thei/external-links/repository';
import { persistExternalLink } from '../../thei/external-links/preview';

export default defineEventHandler(async (event): Promise<ExternalLink> => {
  try {
    const url = normalizeExternalLinkUrl(getQuery(event).url);
    return (await findExternalLink(url)) ?? (await persistExternalLink(url));
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage:
        error instanceof Error ? error.message : 'Invalid external link',
    });
  }
});
