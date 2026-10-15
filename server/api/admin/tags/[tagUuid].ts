import { and, eq } from 'drizzle-orm';
import { isTagUuid } from '../../../thei/tags';
import type { TagEditData } from '#layers/thei/shared/tag';
import { formVersion } from '../../../thei/entity-edit';
import {
  deleteTag,
  readTagEdit,
  saveTagEdit,
} from '../../../thei/tags-edit/edit';

export default defineEventHandler(async (event) => {
  // A UUID from the admin list, or the public ID a visitor's address carries —
  // the admin bar on a public tag page only knows the latter.
  const identifier = getRouterParam(event, 'tagUuid')!;
  const { db, schema } = THEI_SERVER.useDb();
  const tag = await db.query.tags.findFirst({
    where: isTagUuid(identifier)
      ? eq(schema.tags.tagUuid, identifier)
      : eq(schema.tags.publicId, identifier),
  });
  if (!tag) throw createError({ statusCode: 404, message: 'Tag not found' });
  const tagUuid = tag.tagUuid;

  switch (event.method) {
    case 'GET':
      return readTagEdit(tag);
    case 'PUT': {
      const body = await readBody<TagEditData>(event);
      return saveTagEdit(tag, body, { expectedUpdatedAt: formVersion(body) });
    }
    case 'DELETE':
      await deleteTag(tag);
      return;
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
