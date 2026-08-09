import { and, eq } from 'drizzle-orm';
import type { ProjectListItem, ProjectSearchItem } from '#layers/thei/shared/api/project';
import { rankProjectSearch } from '#layers/thei/shared/admin/project-search';
import { buildAdminAssetUrls } from '../../../thei/assets/urls';
import { resolveGeneratedIcon } from '../../../thei/media/generated-icon';
import { listTagsForContainer } from '../../../thei/tags';

const LIMIT = 50;

export default defineEventHandler(async (event): Promise<ProjectListItem[] | ProjectSearchItem[]> => {
  const query = getQuery(event);
  if (typeof query.query === 'string') {
    const excluded = new Set(
      (typeof query.excludeProjectUuids === 'string'
        ? query.excludeProjectUuids.split(',')
        : []
      ).filter(Boolean),
    );
    const { db, schema } = THEI_SERVER.useDb();
    const matches = rankProjectSearch(
      db.select().from(schema.projects).all().filter((project) => !excluded.has(project.projectUuid)),
      query.query,
    );
    return await Promise.all(matches.map(async (project) => {
      const iconUsage = (
        await THEI_SERVER.assets.usages.findByContainer('project', project.projectUuid)
      ).find((usage) => usage.role === 'icon');
      return {
        projectUuid: project.projectUuid,
        title: project.title,
        humanReadableSlug: project.humanReadableSlug,
        publicId: project.publicId,
        iconMedia: iconUsage
          ? (await buildAdminAssetUrls(iconUsage.asset)).media!
          : resolveGeneratedIcon('project', project.projectUuid),
        tags: (await listTagsForContainer('project', project.projectUuid)).slice(0, 3),
      };
    }));
  }
  const offset = Number(query.offset ?? 0);

  const projects = await THEI_SERVER.projects.list(offset, LIMIT);

  const { db, schema } = THEI_SERVER.useDb();

  const [iconUsages, directAssetRows, contentAssetRows] = await Promise.all([
    THEI_SERVER.assets.usages.findByContainerTypeAndRole('project', 'icon'),
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
      .where(eq(schema.assetUsages.containerType, 'project')),
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

  return await Promise.all(projects.map(async (project) => {
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
      iconMedia: iconAsset
        ? (await buildAdminAssetUrls(iconAsset)).media!
        : resolveGeneratedIcon('project', project.projectUuid),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      totalSize: sizeByProjectUuid.get(project.projectUuid) ?? 0,
    };
  }));
});
