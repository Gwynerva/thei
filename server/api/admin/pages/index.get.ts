import { and, eq, inArray } from 'drizzle-orm';
import { contentPlainText } from '#layers/thei/shared/content';
import {
  paginateAdminEntities,
  type AdminEntityListOrder,
} from '#layers/thei/shared/admin/entity-list';
import type { PageListResponse } from '#layers/thei/shared/api/page';
import { buildAdminAssetUrls } from '../../../thei/assets/urls';
import { resolveEntityIconMedia } from '../../../thei/media/generated-icon';

export default defineEventHandler(async (event): Promise<PageListResponse> => {
  const query = getQuery(event);
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db.select().from(schema.pages).all();
  const contents = db
    .select({
      ownerId: schema.content.ownerId,
      contentUuid: schema.content.contentUuid,
      data: schema.content.data,
    })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, 'page'),
        eq(schema.content.slot, 'page-body'),
      ),
    )
    .all();
  const contentByPage = new Map(contents.map((item) => [item.ownerId, item]));
  const result = paginateAdminEntities(
    rows.map((item) => ({
      ...item,
      entityId: item.pageUuid,
      humanReadableSlug: item.slug,
      publicId: '',
      contentText: contentPlainText(contentByPage.get(item.pageUuid)?.data),
    })),
    {
      q: typeof query.q === 'string' ? query.q : '',
      order: (query.order === 'oldest'
        ? 'oldest'
        : 'newest') satisfies AdminEntityListOrder,
      page: Number(query.page),
      pageSize: Number(query.pageSize),
    },
  );
  const pageUuids = result.items.map((item) => item.pageUuid);
  if (!pageUuids.length) return { ...result, items: [] };

  const selectedContents = contents.filter((item) =>
    pageUuids.includes(item.ownerId),
  );
  const contentIds = selectedContents.map((item) => item.contentUuid);
  const [iconRows, contentAssetRows] = await Promise.all([
    db
      .select({
        pageUuid: schema.assetUsages.containerId,
        asset: schema.assets,
      })
      .from(schema.assetUsages)
      .innerJoin(
        schema.assets,
        eq(schema.assetUsages.assetUuid, schema.assets.assetUuid),
      )
      .where(
        and(
          eq(schema.assetUsages.containerType, 'page'),
          eq(schema.assetUsages.role, 'icon'),
          inArray(schema.assetUsages.containerId, pageUuids),
        ),
      ),
    contentIds.length
      ? db
          .select({
            contentUuid: schema.assetUsages.containerId,
            assetUuid: schema.assets.assetUuid,
            size: schema.assets.size,
          })
          .from(schema.assetUsages)
          .innerJoin(
            schema.assets,
            eq(schema.assetUsages.assetUuid, schema.assets.assetUuid),
          )
          .where(
            and(
              eq(schema.assetUsages.containerType, 'content'),
              inArray(schema.assetUsages.containerId, contentIds),
            ),
          )
      : [],
  ]);
  const iconByPage = new Map(
    iconRows.map((item) => [item.pageUuid, item.asset]),
  );
  const pageByContent = new Map(
    selectedContents.map((item) => [item.contentUuid, item.ownerId]),
  );
  const sizes = new Map<string, Map<string, number>>();
  for (const row of contentAssetRows) {
    const pageUuid = pageByContent.get(row.contentUuid);
    if (!pageUuid) continue;
    const map = sizes.get(pageUuid) ?? new Map<string, number>();
    map.set(row.assetUuid, row.size);
    sizes.set(pageUuid, map);
  }
  for (const row of iconRows) {
    const map = sizes.get(row.pageUuid) ?? new Map<string, number>();
    map.set(row.asset.assetUuid, row.asset.size);
    sizes.set(row.pageUuid, map);
  }

  return {
    ...result,
    items: await Promise.all(
      result.items.map(async (item) => {
        const icon = iconByPage.get(item.pageUuid);
        return {
          pageUuid: item.pageUuid,
          title: item.title,
          summary: item.summary,
          slug: item.slug,
          access: item.access,
          iconMedia: resolveEntityIconMedia(
            'page',
            item.pageUuid,
            icon ? (await buildAdminAssetUrls(icon)).media! : undefined,
          ),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          totalSize: Array.from(
            sizes.get(item.pageUuid)?.values() ?? [],
          ).reduce((sum, size) => sum + size, 0),
        };
      }),
    ),
  };
});
