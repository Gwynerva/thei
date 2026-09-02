import { eq } from 'drizzle-orm';
import { publicIdFromTagUrlPart } from '#layers/thei/shared/tag-url';
import { sendContextAsset } from '../../../../thei/assets/context-access';

export default defineEventHandler(async (event) => {
  const { db, schema } = THEI_SERVER.useDb();
  const tag = await db.query.tags.findFirst({
    where: eq(
      schema.tags.publicId,
      publicIdFromTagUrlPart(getRouterParam(event, 'slug') ?? ''),
    ),
  });
  if (!tag) throw createError({ statusCode: 404 });
  return sendContextAsset(event, {
    ownerType: 'tag',
    ownerId: tag.tagUuid,
    role: 'icon',
    filename: getRouterParam(event, 'filename') ?? '',
  });
});
