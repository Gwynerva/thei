import {
  isShareLinkDuration,
  type ShareLinkItem,
} from '#layers/thei/shared/share-link';
import {
  extendShareLink,
  toShareLinkItem,
} from '../../../thei/access-links/share-links';

/**
 * Adds time to a live link, up to a day ahead. A link that has run out is
 * gone: 404, the same as one that was revoked.
 *
 * A fixed address with the link named in the body, rather than a method on the
 * link's own address: it keeps the panel's calls on literal routes.
 */
export default defineEventHandler(async (event): Promise<ShareLinkItem> => {
  const body = await readBody<{ shareUuid?: unknown; duration?: unknown }>(
    event,
  );
  if (
    typeof body?.shareUuid !== 'string' ||
    !isShareLinkDuration(body.duration)
  )
    throw createError({ statusCode: 400, message: 'Invalid share link' });
  const updated = extendShareLink(body.shareUuid, body.duration);
  if (!updated) throw createError({ statusCode: 404 });
  return toShareLinkItem(event, updated);
});
