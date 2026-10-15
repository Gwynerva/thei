import { and, eq, sql } from 'drizzle-orm';
import {
  buildTagItem,
  findTagConflict,
  findTagNameConflict,
  isTagUuid,
  tagConflictMessage,
} from '../tags';
import {
  normalizeTagTitle,
  validateTagData,
  type TagEditData,
  type TagSaveResponse,
  type TagUsageStats,
} from '#layers/thei/shared/tag';

import {
  assertEntityVersion,
  EntityEditConflict,
  type EntityEditOptions,
} from '../entity-edit';
import { deleteUsagesReleasing } from '../assets/repository/usages/release';
import { forgetAiAnchors } from '../ai/memory/forget';

/**
 * A tag as its edit form reads and saves it — the admin form, and an AI
 * client that reads the same form, changes what it was asked to and saves it
 * back. A save over a change made since the form was read is refused.
 */

/** The edit form, everything in it. */
export async function readTagEdit(
  tag: typeof import('../db/schema/tags').tags.$inferSelect,
) {
  const { db, schema } = THEI_SERVER.useDb();
  const tagUuid = tag.tagUuid;
  const counts = db
    .select({
      containerType: schema.tagUsages.containerType,
      count: sql<number>`count(*)`,
    })
    .from(schema.tagUsages)
    .where(eq(schema.tagUsages.tagUuid, tagUuid))
    .groupBy(schema.tagUsages.containerType)
    .all();
  const stats: TagUsageStats = {
    total: counts.reduce((sum, row) => sum + Number(row.count), 0),
    projects: Number(
      counts.find((row) => row.containerType === 'project')?.count ?? 0,
    ),
    events: Number(
      counts.find((row) => row.containerType === 'event')?.count ?? 0,
    ),
  };
  return {
    ...(await buildTagItem(tag)),
    synonyms: tag.synonyms,
    usageStats: stats,
    version: tag.updatedAt,
  };
}

/** Saves the edit form over what it edits, or says what is wrong. */
export async function saveTagEdit(
  tag: typeof import('../db/schema/tags').tags.$inferSelect,
  body: TagEditData,
  options: EntityEditOptions = {},
): Promise<TagSaveResponse> {
  const { db, schema } = THEI_SERVER.useDb();
  const tagUuid = tag.tagUuid;
  const result = validateTagData(body);
  if (typeof result === 'string')
    return { type: 'error', message: result } satisfies TagSaveResponse;
  const conflict = findTagConflict(
    {
      normalizedTitle: normalizeTagTitle(result.title),
      slug: result.slug,
      publicId: result.publicId,
    },
    tagUuid,
  );
  if (conflict)
    return {
      type: 'error',
      code: conflict,
      message: tagConflictMessage(conflict),
    } satisfies TagSaveResponse;
  const nameConflict = findTagNameConflict(
    result.title,
    result.synonyms,
    tagUuid,
  );
  if (nameConflict)
    return { type: 'error', ...nameConflict } satisfies TagSaveResponse;
  if (
    result.iconAssetUuid &&
    !(await db.query.assets.findFirst({
      where: eq(schema.assets.assetUuid, result.iconAssetUuid),
    }))
  )
    return { type: 'error', message: THEI_SERVER.phrase.tag_icon_not_found };
  const now = Date.now();
  try {
    db.transaction((tx) => {
      assertEntityVersion(
        tx,
        schema.tags,
        schema.tags.tagUuid,
        tagUuid,
        options.expectedUpdatedAt,
      );
      tx.update(schema.tags)
        .set({
          updatedAt: now,
          title: result.title,
          normalizedTitle: normalizeTagTitle(result.title),
          slug: result.slug,
          publicId: result.publicId,
          description: result.description,
          synonyms: result.synonyms,
        })
        .where(eq(schema.tags.tagUuid, tagUuid))
        .run();
      const current = tx
        .select()
        .from(schema.assetUsages)
        .where(
          and(
            eq(schema.assetUsages.containerType, 'tag'),
            eq(schema.assetUsages.containerId, tagUuid),
            eq(schema.assetUsages.role, 'icon'),
          ),
        )
        .get();
      if (current?.assetUuid !== result.iconAssetUuid) {
        deleteUsagesReleasing(
          tx,
          schema,
          and(
            eq(schema.assetUsages.containerType, 'tag'),
            eq(schema.assetUsages.containerId, tagUuid),
            eq(schema.assetUsages.role, 'icon'),
          ),
        );
        if (result.iconAssetUuid)
          tx.insert(schema.assetUsages)
            .values({
              assetUuid: result.iconAssetUuid,
              containerType: 'tag',
              containerId: tagUuid,
              role: 'icon',
            })
            .run();
      }
      options.onWrite?.(tx, schema);
    });
  } catch (error) {
    if (error instanceof EntityEditConflict)
      return {
        type: 'error',
        code: 'changed',
        message: error.message,
      } satisfies TagSaveResponse;
    const raceConflict = findTagConflict(
      {
        normalizedTitle: normalizeTagTitle(result.title),
        slug: result.slug,
        publicId: result.publicId,
      },
      tagUuid,
    );
    if (raceConflict)
      return {
        type: 'error',
        code: raceConflict,
        message: tagConflictMessage(raceConflict),
      } satisfies TagSaveResponse;
    throw error;
  }
  return { type: 'success', tagUuid, version: now } satisfies TagSaveResponse;
}

/** Deletes it with everything that is its own. */
export async function deleteTag(
  tag: typeof import('../db/schema/tags').tags.$inferSelect,
  options: Pick<EntityEditOptions, 'onWrite' | 'beforeWrite'> = {},
) {
  const { db, schema } = THEI_SERVER.useDb();
  const tagUuid = tag.tagUuid;
  db.transaction((tx) => {
    options.beforeWrite?.(tx, schema);
    tx.delete(schema.tagUsages)
      .where(eq(schema.tagUsages.tagUuid, tagUuid))
      .run();
    deleteUsagesReleasing(
      tx,
      schema,
      and(
        eq(schema.assetUsages.containerType, 'tag'),
        eq(schema.assetUsages.containerId, tagUuid),
      ),
    );
    tx.delete(schema.tags).where(eq(schema.tags.tagUuid, tagUuid)).run();
    forgetAiAnchors(tx, schema, 'tag', [tagUuid]);
    options.onWrite?.(tx, schema);
  });
  return;
}
