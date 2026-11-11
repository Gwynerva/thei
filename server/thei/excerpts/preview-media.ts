import { and, eq } from 'drizzle-orm';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { buildContentPreviewMedia } from '../content/repository';
import { buildAdminEntityBanner } from '../entity-banner';

/**
 * The first picture among a parent's excerpts as the admin sees it, in the
 * owner's order: each its banner, else the first picture of its text. What an
 * event or a diary entry without a picture of its own is shown by in the
 * admin's lists, the way its public cards are (`public/parent-media.ts`) —
 * the owner sees every excerpt, private ones too.
 */
export async function buildAdminExcerptsPreviewMedia(parent: {
  type: 'event' | 'diary-entry';
  id: string;
}): Promise<MediaDescriptor | undefined> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({ excerptUuid: schema.excerpts.excerptUuid })
    .from(schema.excerpts)
    .where(
      and(
        eq(schema.excerpts.parentType, parent.type),
        eq(schema.excerpts.parentId, parent.id),
      ),
    )
    .orderBy(schema.excerpts.sortOrder)
    .all();
  for (const { excerptUuid } of rows) {
    const media =
      (await buildAdminEntityBanner('excerpt', excerptUuid)) ??
      (await buildContentPreviewMedia('excerpt', excerptUuid, 'excerpt-body'));
    if (media) return media;
  }
  return undefined;
}
