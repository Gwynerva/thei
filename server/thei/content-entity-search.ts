import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import type { ContentEntityRecord } from './content-entities';

/** A picker result: the record plus what the admin needs to recognise it. */
export async function contentEntitySearchItem(
  record: ContentEntityRecord,
): Promise<ContentEntitySearchItem> {
  const previewMedia = await record.media('admin');
  return {
    entityType: record.entityType,
    entityId: record.entityId,
    title: record.title,
    summary: record.summary,
    url: record.href,
    humanReadableSlug: record.humanReadableSlug,
    ...(record.publicId ? { publicId: record.publicId } : {}),
    ...(record.date ? { date: record.date } : {}),
    ...(record.parent ? { parent: record.parent } : {}),
    updatedAt: record.updatedAt,
    ...(previewMedia ? { previewMedia } : {}),
  };
}
