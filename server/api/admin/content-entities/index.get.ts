import {
  CONTENT_ENTITY_TYPES,
  isContentEntityType,
} from '#layers/thei/shared/content-link';
import {
  rankContentEntities,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import { listContentEntities } from '../../../thei/content-entities';
import { contentEntitySearchItem } from '../../../thei/content-entity-search';

/**
 * The admin's picker for anything content can link to or relate with.
 *
 * `entityTypes` narrows the kinds (relations only join projects, events and
 * diary entries; pinned pages are pages), `exclude` drops what is already
 * chosen as `type:uuid` keys, and `publicOnly` keeps what a visitor can open.
 */
export default defineEventHandler(
  async (event): Promise<ContentEntitySearchItem[]> => {
    const query = getQuery(event);
    const requested =
      typeof query.entityTypes === 'string'
        ? query.entityTypes.split(',').filter(isContentEntityType)
        : CONTENT_ENTITY_TYPES;
    const excluded = new Set(
      typeof query.exclude === 'string' ? query.exclude.split(',') : [],
    );
    const records = (await listContentEntities(new Set(requested))).filter(
      (record) =>
        !excluded.has(`${record.entityType}:${record.entityId}`) &&
        (query.publicOnly !== 'true' || record.access === 'public'),
    );
    const ranked = rankContentEntities(
      records,
      typeof query.query === 'string' ? query.query : '',
    );
    return await Promise.all(ranked.map(contentEntitySearchItem));
  },
);
