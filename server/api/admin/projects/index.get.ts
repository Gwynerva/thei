import { eq, sum } from 'drizzle-orm';
import type { ProjectListItem } from '#layers/thei/shared/api/project';

const LIMIT = 50;

export default defineEventHandler(async (event): Promise<ProjectListItem[]> => {
  const query = getQuery(event);
  const offset = Number(query.offset ?? 0);

  const projects = await THEI_SERVER.projects.list(offset, LIMIT);

  const { db, schema } = THEI_SERVER.useDb();

  // Subquery: deduplicate assets per project (same asset may appear with different roles)
  const distinctAssets = db
    .selectDistinct({
      containerId: schema.assetUsages.containerId,
      assetUuid: schema.assets.assetUuid,
      size: schema.assets.size,
    })
    .from(schema.assets)
    .innerJoin(
      schema.assetUsages,
      eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
    )
    .where(eq(schema.assetUsages.containerType, 'project'))
    .as('distinct_assets');

  const [iconUsages, sizeRows] = await Promise.all([
    THEI_SERVER.assets.usages.findByContainerTypeAndRole('project', 'icon'),
    db
      .select({
        containerId: distinctAssets.containerId,
        totalSize: sum(distinctAssets.size),
      })
      .from(distinctAssets)
      .groupBy(distinctAssets.containerId),
  ]);

  const iconUrlByProjectUuid = new Map(
    iconUsages.map(({ containerId, asset }) => [containerId, asset]),
  );

  const sizeByProjectUuid = new Map(
    sizeRows.map(({ containerId, totalSize }) => [
      containerId,
      Number(totalSize ?? 0),
    ]),
  );

  return projects.map((project) => {
    const iconAsset = iconUrlByProjectUuid.get(project.projectUuid);
    return {
      projectUuid: project.projectUuid,
      title: project.title,
      summary: project.summary,
      slug: project.slug,
      access: project.access,
      important: project.important,
      cv: project.cv,
      iconPreviewUrl: iconAsset
        ? `/api/admin/assets/preview/${iconAsset.slug}.${iconAsset.extension}/`
        : undefined,
      iconDominantHue: iconAsset?.meta?.dominantHue,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      totalSize: sizeByProjectUuid.get(project.projectUuid) ?? 0,
    };
  });
});
