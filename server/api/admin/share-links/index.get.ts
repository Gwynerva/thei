import {
  listShareLinks,
  cleanupExpiredShareLinks,
} from '../../../thei/access-links/share-links';
import {
  isShareLinkEntityType,
  type ShareLinkItem,
} from '#layers/thei/shared/share-link';

export default defineEventHandler((event): ShareLinkItem[] => {
  const query = getQuery(event);
  const entityType = isShareLinkEntityType(query.entityType)
    ? query.entityType
    : 'project';
  const entityUuid = String(query.entityUuid ?? '');
  if (!entityUuid)
    throw createError({ statusCode: 400, message: 'Missing entity' });
  cleanupExpiredShareLinks();
  return listShareLinks(entityType, entityUuid);
});
