import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { contentPlainText } from '#layers/thei/shared/content';
import type { ProjectListResponse } from '#layers/thei/shared/api/project';
import {
  normalizeAdminSearchText,
  paginateAdminEntities,
  resolveAdminPagination,
  type AdminEntityListOrder,
} from '#layers/thei/shared/admin/entity-list';
import { buildAdminAssetUrls } from '../../../thei/assets/urls';
import { resolveEntityIconMedia } from '../../../thei/media/generated-icon';

export default defineEventHandler(
  async (event): Promise<ProjectListResponse> => {
    const query = getQuery(event);
    const { db, schema } = THEI_SERVER.useDb();
    const q = typeof query.q === 'string' ? query.q : '';
    const order: AdminEntityListOrder =
      query.order === 'oldest' ? 'oldest' : 'newest';
    const paginationQuery = {
      page: Number(query.page),
      pageSize: Number(query.pageSize),
    };

    async function searchProjects(
      searchQuery: string,
      searchOrder: AdminEntityListOrder,
      pagination: { page: number; pageSize: number },
    ) {
      const [projects, descriptions] = await Promise.all([
        db.select().from(schema.projects).all(),
        db
          .select({
            ownerId: schema.content.ownerId,
            data: schema.content.data,
          })
          .from(schema.content)
          .where(
            and(
              eq(schema.content.ownerType, 'project'),
              eq(schema.content.slot, 'project-description'),
            ),
          )
          .all(),
      ]);
      const descriptionByProjectUuid = new Map(
        descriptions.map((description) => [
          description.ownerId,
          contentPlainText(description.data),
        ]),
      );

      return paginateAdminEntities(
        projects.map((project) => ({
          ...project,
          entityId: project.projectUuid,
          contentText: descriptionByProjectUuid.get(project.projectUuid),
        })),
        { q: searchQuery, order: searchOrder, ...pagination },
      );
    }

    async function listProjects(
      listOrder: AdminEntityListOrder,
      paginationQuery: { page: number; pageSize: number },
    ) {
      const pagination = resolveAdminPagination(
        await THEI_SERVER.projects.count(),
        paginationQuery,
      );
      const offset = (pagination.page - 1) * pagination.pageSize;
      const baseQuery = db.select().from(schema.projects);
      const projects =
        listOrder === 'oldest'
          ? await baseQuery
              .orderBy(
                asc(schema.projects.createdAt),
                asc(schema.projects.projectUuid),
              )
              .limit(pagination.pageSize)
              .offset(offset)
          : await baseQuery
              .orderBy(
                desc(schema.projects.updatedAt),
                desc(schema.projects.createdAt),
                asc(schema.projects.projectUuid),
              )
              .limit(pagination.pageSize)
              .offset(offset);

      return {
        items: projects.map((project) => ({
          ...project,
          entityId: project.projectUuid,
        })),
        ...pagination,
      };
    }

    const result = normalizeAdminSearchText(q)
      ? await searchProjects(q, order, paginationQuery)
      : await listProjects(order, paginationQuery);
    const projectUuids = result.items.map((project) => project.projectUuid);

    if (!projectUuids.length) {
      return { ...result, items: [] };
    }

    const [iconUsages, directAssetRows, contentAssetRows] = await Promise.all([
      db
        .select({
          asset: schema.assets,
          containerId: schema.assetUsages.containerId,
        })
        .from(schema.assets)
        .innerJoin(
          schema.assetUsages,
          eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
        )
        .where(
          and(
            eq(schema.assetUsages.containerType, 'project'),
            eq(schema.assetUsages.role, 'icon'),
            inArray(schema.assetUsages.containerId, projectUuids),
          ),
        ),
      db
        .select({
          projectUuid: schema.assetUsages.containerId,
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
            eq(schema.assetUsages.containerType, 'project'),
            inArray(schema.assetUsages.containerId, projectUuids),
          ),
        ),
      db
        .select({
          projectUuid: schema.content.ownerId,
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
            eq(schema.content.ownerType, 'project'),
            inArray(schema.content.ownerId, projectUuids),
          ),
        ),
    ]);

    const iconUrlByProjectUuid = new Map(
      iconUsages.map(({ containerId, asset }) => [containerId, asset]),
    );

    const assetsByProjectUuid = new Map<string, Map<string, number>>();
    for (const row of [...directAssetRows, ...contentAssetRows]) {
      const assets =
        assetsByProjectUuid.get(row.projectUuid) ?? new Map<string, number>();
      assets.set(row.assetUuid, row.size);
      assetsByProjectUuid.set(row.projectUuid, assets);
    }

    const sizeByProjectUuid = new Map(
      Array.from(assetsByProjectUuid.entries()).map(([projectUuid, assets]) => [
        projectUuid,
        Array.from(assets.values()).reduce((sum, size) => sum + size, 0),
      ]),
    );

    return {
      ...result,
      items: await Promise.all(
        result.items.map(async (project) => {
          const iconAsset = iconUrlByProjectUuid.get(project.projectUuid);
          return {
            projectUuid: project.projectUuid,
            title: project.title,
            summary: project.summary,
            humanReadableSlug: project.humanReadableSlug,
            publicId: project.publicId,
            access: project.access,
            showcase: project.showcase,
            cv: project.cv,
            iconMedia: resolveEntityIconMedia(
              'project',
              project.projectUuid,
              iconAsset
                ? (await buildAdminAssetUrls(iconAsset)).media!
                : undefined,
            ),
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            totalSize: sizeByProjectUuid.get(project.projectUuid) ?? 0,
            ...(project.reminder ? { reminder: project.reminder } : {}),
          };
        }),
      ),
    };
  },
);
