import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  buildContentPreview,
  contentPlainText,
} from '#layers/thei/shared/content';
import type { EventListResponse } from '#layers/thei/shared/api/event';
import {
  normalizeAdminSearchText,
  paginateAdminEntities,
  resolveAdminPagination,
  type AdminEntityListOrder,
} from '#layers/thei/shared/admin/entity-list';

export default defineEventHandler(async (event): Promise<EventListResponse> => {
  const query = getQuery(event);
  const { db, schema } = THEI_SERVER.useDb();
  const q = typeof query.q === 'string' ? query.q : '';
  const order: AdminEntityListOrder =
    query.order === 'oldest' ? 'oldest' : 'newest';
  const paginationQuery = {
    page: Number(query.page),
    pageSize: Number(query.pageSize),
  };

  async function searchEvents(
    searchQuery: string,
    searchOrder: AdminEntityListOrder,
    pagination: { page: number; pageSize: number },
  ) {
    const [events, eventContents] = await Promise.all([
      db.select().from(schema.events).all(),
      db
        .select({ ownerId: schema.content.ownerId, data: schema.content.data })
        .from(schema.content)
        .where(
          and(
            eq(schema.content.ownerType, 'event'),
            eq(schema.content.slot, 'event-body'),
          ),
        )
        .all(),
    ]);
    const contentByEventUuid = new Map(
      eventContents.map((content) => [content.ownerId, content.data]),
    );

    return paginateAdminEntities(
      events.map((item) => ({
        ...item,
        entityId: item.eventUuid,
        contentText: contentPlainText(contentByEventUuid.get(item.eventUuid)),
      })),
      { q: searchQuery, order: searchOrder, ...pagination },
    );
  }

  async function listEvents(
    listOrder: AdminEntityListOrder,
    paginationQuery: { page: number; pageSize: number },
  ) {
    const pagination = resolveAdminPagination(
      await THEI_SERVER.events.count(),
      paginationQuery,
    );
    const offset = (pagination.page - 1) * pagination.pageSize;
    const baseQuery = db.select().from(schema.events);
    const events =
      listOrder === 'oldest'
        ? await baseQuery
            .orderBy(asc(schema.events.createdAt), asc(schema.events.eventUuid))
            .limit(pagination.pageSize)
            .offset(offset)
        : await baseQuery
            .orderBy(
              desc(schema.events.updatedAt),
              desc(schema.events.createdAt),
              asc(schema.events.eventUuid),
            )
            .limit(pagination.pageSize)
            .offset(offset);

    return {
      items: events.map((item) => ({
        ...item,
        entityId: item.eventUuid,
      })),
      ...pagination,
    };
  }

  const result = normalizeAdminSearchText(q)
    ? await searchEvents(q, order, paginationQuery)
    : await listEvents(order, paginationQuery);
  const eventUuids = result.items.map((item) => item.eventUuid);

  if (!eventUuids.length) return { ...result, items: [] };

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
          inArray(schema.assetUsages.containerId, eventUuids),
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
          inArray(schema.content.ownerId, eventUuids),
        ),
      ),
  ]);
  const sizes = new Map<string, Map<string, number>>();
  for (const row of [...fileRows, ...contentRows]) {
    const current = sizes.get(row.eventUuid) ?? new Map<string, number>();
    current.set(row.assetUuid, row.size);
    sizes.set(row.eventUuid, current);
  }

  return {
    ...result,
    items: await Promise.all(
      result.items.map(async (item) => {
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
          totalSize: Array.from(
            sizes.get(item.eventUuid)?.values() ?? [],
          ).reduce((sum, size) => sum + size, 0),
        };
      }),
    ),
  };
});
