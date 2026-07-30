import { rankTagSearch, type TagItem } from '#layers/thei/shared/tag';
import { buildTagItems, isTagUuid } from '../../../thei/tags';

export default defineEventHandler(async (event): Promise<TagItem[]> => {
  const query = getQuery(event);
  const search = typeof query.query === 'string' ? query.query : '';
  if (search.length > 100)
    throw createError({ statusCode: 400, message: 'Search query is too long' });
  const excludeItems = (
    typeof query.exclude === 'string' ? query.exclude.split(',') : []
  ).filter(Boolean);
  if (excludeItems.length > 100 || excludeItems.some((item) => !isTagUuid(item)))
    throw createError({ statusCode: 400, message: 'Invalid excluded tags' });
  const excluded = new Set(excludeItems);
  const { db, schema } = THEI_SERVER.useDb();
  const tags = db.select().from(schema.tags).all().filter((tag) => !excluded.has(tag.tagUuid));
  return buildTagItems(rankTagSearch(tags, search));
});
