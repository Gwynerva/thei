import {
  listShareLinks,
  toShareLinkItem,
} from '../../../thei/access-links/share-links';
import {
  isShareLinkEntityType,
  type ShareLinkItem,
} from '#layers/thei/shared/share-link';

export default defineEventHandler((event): ShareLinkItem[] => {
  const { entityType, entityUuid } = getQuery(event);
  if (
    !isShareLinkEntityType(entityType) ||
    typeof entityUuid !== 'string' ||
    !entityUuid
  )
    throw createError({ statusCode: 400, message: 'Invalid entity' });
  // Live addresses: kept out of every cache, the browser's included.
  setHeader(event, 'Cache-Control', 'private, no-store');
  return listShareLinks(entityType, entityUuid).map((link) =>
    toShareLinkItem(event, link),
  );
});
