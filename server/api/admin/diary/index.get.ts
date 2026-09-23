import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { resolveEntityIconMedia } from '../../../thei/media/generated-icon';
import {
  buildContentPreview,
  contentPlainText,
} from '#layers/thei/shared/content';
import type { DiaryListResponse } from '#layers/thei/shared/api/diary';
import {
  normalizeAdminSearchText,
  paginateAdminEntities,
  resolveAdminPagination,
  type AdminEntityListOrder,
} from '#layers/thei/shared/admin/entity-list';
import { diaryExcerpt } from '#layers/thei/shared/diary-text';

export default defineEventHandler(async (event): Promise<DiaryListResponse> => {
  const query = getQuery(event);
  const { db, schema } = THEI_SERVER.useDb();
  const q = typeof query.q === 'string' ? query.q : '';
  const order: AdminEntityListOrder =
    query.order === 'oldest' ? 'oldest' : 'newest';
  const paginationQuery = {
    page: Number(query.page),
    pageSize: Number(query.pageSize),
  };

  const bodies = db
    .select({ ownerId: schema.content.ownerId, data: schema.content.data })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, 'diary-entry'),
        eq(schema.content.slot, 'diary-body'),
      ),
    )
    .all();
  const bodyByUuid = new Map(bodies.map((row) => [row.ownerId, row.data]));

  /**
   * The shape the shared list helpers expect.
   *
   * A diary entry has no title, slug or public ID, so its day stands in for
   * all three — which is also how one is actually looked for.
   */
  type Row = Awaited<ReturnType<typeof THEI_SERVER.diary.list>>[number] & {
    entityId: string;
    title: string;
    summary: string;
    humanReadableSlug: string;
    publicId: string;
    contentText: string;
  };

  const asRow = (
    item: Awaited<ReturnType<typeof THEI_SERVER.diary.list>>[number],
  ): Row => ({
    ...item,
    entityId: item.diaryUuid,
    title: item.date,
    summary: '',
    humanReadableSlug: item.date,
    publicId: item.date,
    contentText: contentPlainText(bodyByUuid.get(item.diaryUuid)),
  });

  function searchEntries() {
    return paginateAdminEntities(
      db.select().from(schema.diaryEntries).all().map(asRow),
      { q, order, ...paginationQuery },
    );
  }

  async function listEntries() {
    const pagination = resolveAdminPagination(
      await THEI_SERVER.diary.count(),
      paginationQuery,
    );
    const offset = (pagination.page - 1) * pagination.pageSize;
    const entries = await db
      .select()
      .from(schema.diaryEntries)
      .orderBy(
        order === 'oldest'
          ? asc(schema.diaryEntries.date)
          : desc(schema.diaryEntries.date),
      )
      .limit(pagination.pageSize)
      .offset(offset);
    return { items: entries.map(asRow), ...pagination };
  }

  const result = normalizeAdminSearchText(q)
    ? searchEntries()
    : await listEntries();
  const uuids = result.items.map((item) => item.diaryUuid);
  if (!uuids.length) return { ...result, items: [] };

  const sizeRows = db
    .select({
      diaryUuid: schema.content.ownerId,
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
        eq(schema.content.ownerType, 'diary-entry'),
        eq(schema.content.slot, 'diary-body'),
        inArray(schema.content.ownerId, uuids),
      ),
    )
    .all();
  const sizes = new Map<string, Map<string, number>>();
  for (const row of sizeRows) {
    const current = sizes.get(row.diaryUuid) ?? new Map<string, number>();
    current.set(row.assetUuid, row.size);
    sizes.set(row.diaryUuid, current);
  }

  return {
    ...result,
    items: result.items.map((item) => {
      const data = bodyByUuid.get(item.diaryUuid);
      return {
        diaryUuid: item.diaryUuid,
        date: item.date,
        access: item.access,
        excerpt: diaryExcerpt(item.contentText),
        previewMedia: resolveEntityIconMedia(
          'diary-entry',
          item.diaryUuid,
          buildContentPreview(data).media,
        ),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        totalSize: Array.from(sizes.get(item.diaryUuid)?.values() ?? []).reduce(
          (sum, size) => sum + size,
          0,
        ),
        ...(item.reminder ? { reminder: item.reminder } : {}),
      };
    }),
  };
});
