import { eq } from 'drizzle-orm';
import { TAG_CONTAINER_TYPES } from '#layers/thei/shared/tag';
import { isOneOf } from '#layers/thei/shared/utils/isOneOf';
import { addTagUsage, isTagUuid } from '../../../../thei/tags';

/** Puts the tag on one more project or event, from the tag's own page. */
export default defineEventHandler(async (event) => {
  const tagUuid = getRouterParam(event, 'tagUuid') ?? '';
  if (!isTagUuid(tagUuid))
    throw createError({ statusCode: 400, message: 'Invalid tag ID' });
  const body = await readBody<{ type?: unknown; id?: unknown }>(event);
  if (!isOneOf(body?.type, TAG_CONTAINER_TYPES) || typeof body.id !== 'string')
    throw createError({ statusCode: 400, message: 'Invalid entity' });
  const { db, schema } = THEI_SERVER.useDb();
  if (
    !db
      .select({ tagUuid: schema.tags.tagUuid })
      .from(schema.tags)
      .where(eq(schema.tags.tagUuid, tagUuid))
      .get()
  )
    throw createError({ statusCode: 404, message: 'Tag not found' });
  if (!addTagUsage(tagUuid, body.type, body.id))
    throw createError({ statusCode: 404, message: 'Entity not found' });
  return { type: 'success' as const };
});
