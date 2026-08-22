import { and, eq } from 'drizzle-orm';
import { buildContentPreview } from '#layers/thei/shared/content';
import type { EventListItem } from '#layers/thei/shared/api/event';

const LIMIT = 50;

export default defineEventHandler(async (event): Promise<EventListItem[]> => {
  const offset = Math.max(0, Number(getQuery(event).offset ?? 0) || 0);
  const events = await THEI_SERVER.events.list(offset, LIMIT);
  const { db, schema } = THEI_SERVER.useDb();
  const [fileRows, contentRows] = await Promise.all([
    db
      .select({
        eventUuid: schema.assetUsages.containerId,
        assetUuid: schema.assets.assetUuid,
        size: schema.assets.size,
      })
      .from(schema.assets)
      .innerJoin(
        schema.assetUsages,
        eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
      )
      .where(
        and(
          eq(schema.assetUsages.containerType, 'event'),
          eq(schema.assetUsages.role, 'other-asset'),
        ),
      ),
    db
      .select({
        eventUuid: schema.content.ownerId,
        assetUuid: schema.assets.assetUuid,
        size: schema.assets.size,
      })
      .from(schema.assets)
      .innerJoin(
        schema.assetUsages,
        eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
      )
      .innerJoin(
        schema.content,
        eq(schema.assetUsages.containerId, schema.content.contentUuid),
      )
      .where(
        and(
          eq(schema.assetUsages.containerType, 'content'),
          eq(schema.content.ownerType, 'event'),
          eq(schema.content.slot, 'event-body'),
        ),
      ),
  ]);
  const sizes = new Map<string, Map<string, number>>();
  for (const row of [...fileRows, ...contentRows]) {
    const current = sizes.get(row.eventUuid) ?? new Map<string, number>();
    current.set(row.assetUuid, row.size);
    sizes.set(row.eventUuid, current);
  }

  return Promise.all(
    events.map(async (item) => {
      const content = await THEI_SERVER.content.buildFieldValue(
        'event',
        item.eventUuid,
        'event-body',
      );
      const preview = buildContentPreview(content?.data);
      return {
        eventUuid: item.eventUuid,
        title: item.title,
        summary: item.summary,
        access: item.access,
        humanReadableSlug: item.humanReadableSlug,
        publicId: item.publicId,
        previewMedia: preview.media,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        totalSize: Array.from(sizes.get(item.eventUuid)?.values() ?? []).reduce(
          (sum, size) => sum + size,
          0,
        ),
      };
    }),
  );
});
