import { isShareLinkDuration } from '#layers/thei/shared/share-link';
import { extendShareLink } from '../../../thei/access-links/share-links';

/**
 * Moves a link's expiry, counted from now.
 *
 * A fixed address with the link named in the body, rather than a method on the
 * link's own address: it keeps the panel's calls on literal routes.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ shareUuid?: string; duration?: string }>(event);
  if (!body?.shareUuid || !isShareLinkDuration(body?.duration))
    throw createError({ statusCode: 400, message: 'Invalid share link' });
  const updated = extendShareLink(body.shareUuid, body.duration);
  if (!updated) throw createError({ statusCode: 404 });
  return updated;
});
