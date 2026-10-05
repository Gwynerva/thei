import {
  CONTENT_ENTITY_TYPES,
  isContentEntityType,
} from '#layers/thei/shared/content-link';
import {
  CONTENT_ENTITY_SEARCH_LIMIT,
  CONTENT_ENTITY_SEARCH_MAX_LIMIT,
  CONTENT_ENTITY_SUGGEST_TEXT_LIMIT,
  pickContentEntities,
  rankContentEntities,
  suggestContentEntities,
  type ContentEntitySearchItem,
} from '#layers/thei/shared/admin/content-entity-search';
import { listContentEntities } from '../../../thei/content-entities';
import { contentEntitySearchItem } from '../../../thei/content-entity-search';

/**
 * The admin's picker for anything content can link to or relate with.
 *
 * `entityTypes` narrows the kinds (relations only join projects, events and
 * diary entries; pinned pages are pages), `exclude` drops what is already
 * chosen as `type:uuid` keys, `publicOnly` keeps what a visitor can open, and
 * `limit` is how many results the picker has room for.
 *
 * With nothing typed, `suggest` is the text a link is being made over: what
 * it names comes first, the most recent after it.
 *
 * `keys` asks for exactly the entities it names as `type:uuid`, in its order
 * and with no search at all: the relations block describes with it what the
 * entity's own text links to, to recommend them.
 */
export default defineEventHandler(
  async (event): Promise<ContentEntitySearchItem[]> => {
    const query = getQuery(event);
    const limit = Math.min(
      CONTENT_ENTITY_SEARCH_MAX_LIMIT,
      Math.max(
        1,
        Math.trunc(Number(query.limit)) || CONTENT_ENTITY_SEARCH_LIMIT,
      ),
    );
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
    const search = typeof query.query === 'string' ? query.query.trim() : '';
    const suggest =
      typeof query.suggest === 'string'
        ? Array.from(query.suggest)
            .slice(0, CONTENT_ENTITY_SUGGEST_TEXT_LIMIT)
            .join('')
            .trim()
        : '';
    const keys =
      typeof query.keys === 'string'
        ? query.keys.split(',').filter(Boolean)
        : undefined;
    const ranked = keys
      ? pickContentEntities(records, keys, CONTENT_ENTITY_SEARCH_MAX_LIMIT)
      : search
        ? rankContentEntities(records, search, limit)
        : suggest
          ? suggestContentEntities(records, suggest, limit)
          : rankContentEntities(records, '', limit);
    return await Promise.all(ranked.map(contentEntitySearchItem));
  },
);
