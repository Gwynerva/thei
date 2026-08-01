import type { ExternalLink } from '#layers/thei/shared/external-link';
import { refreshExternalLink } from '../../../thei/external-links/preview';

export default defineEventHandler(async (event): Promise<ExternalLink> => {
  const body = await readBody<{ url?: unknown }>(event);
  try {
    return await refreshExternalLink(body?.url);
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage:
        error instanceof Error ? error.message : 'Invalid external link',
    });
  }
});
