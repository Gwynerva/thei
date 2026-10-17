import { isContentEntityType } from '#layers/thei/shared/content-link';
import type { ContentEntityOutline } from '#layers/thei/shared/admin/content-entity-outline';
import { entityOutline } from '../../../thei/content-links/anchors';

/**
 * Where inside an entity a link may lead — its headings, a project's
 * sections — for the admin's link picker to go down to.
 */
export default defineEventHandler(
  async (event): Promise<ContentEntityOutline> => {
    const query = getQuery(event);
    const type = query.entityType;
    const id = typeof query.entityId === 'string' ? query.entityId : '';
    if (!isContentEntityType(type) || !id)
      throw createError({ statusCode: 400, statusMessage: 'Unknown entity' });
    const outline = await entityOutline(type, id);
    if (!outline)
      throw createError({ statusCode: 404, statusMessage: 'No such entity' });
    return outline;
  },
);
