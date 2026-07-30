import { eq } from 'drizzle-orm';
import { EntityPrefix, generateUniqueId } from '../../../thei/entity-id';
import { normalizeTagTitle, validateTagData, type TagEditData, type TagSaveResponse } from '#layers/thei/shared/tag';
import {
  findTagConflict,
  tagConflictMessage,
} from '../../../thei/tags';

export default defineEventHandler(async (event): Promise<TagSaveResponse> => {
  const result = validateTagData(await readBody<TagEditData>(event));
  if (typeof result === 'string') return { type: 'error', message: result };
  const { db, schema } = THEI_SERVER.useDb();
  const conflict = findTagConflict({
    normalizedTitle: normalizeTagTitle(result.title),
    slug: result.slug,
    publicId: result.publicId,
  });
  if (conflict)
    return { type: 'error', code: conflict, message: tagConflictMessage(conflict) };
  if (
    result.iconAssetUuid &&
    !(await db.query.assets.findFirst({
      where: eq(schema.assets.assetUuid, result.iconAssetUuid),
    }))
  )
    return { type: 'error', message: THEI_SERVER.phrase.tag_icon_not_found };
  const tagUuid = await generateUniqueId(
    EntityPrefix.Tag,
    async (id) => !(await db.query.tags.findFirst({ where: eq(schema.tags.tagUuid, id) })),
  );
  try {
    db.transaction((tx) => {
      tx.insert(schema.tags).values({
        tagUuid,
        title: result.title,
        normalizedTitle: normalizeTagTitle(result.title),
        slug: result.slug,
        publicId: result.publicId,
        description: result.description,
        accentColor: result.accentColor,
      }).run();
      if (result.iconAssetUuid) {
        tx.insert(schema.assetUsages).values({
          assetUuid: result.iconAssetUuid,
          containerType: 'tag',
          containerId: tagUuid,
          role: 'icon',
        }).run();
      }
    });
  } catch (error) {
    const raceConflict = findTagConflict({
      normalizedTitle: normalizeTagTitle(result.title),
      slug: result.slug,
      publicId: result.publicId,
    });
    if (raceConflict)
      return {
        type: 'error',
        code: raceConflict,
        message: tagConflictMessage(raceConflict),
      };
    throw error;
  }
  return { type: 'success', tagUuid };
});
