import { and, eq } from 'drizzle-orm';
import type { ProjectListItem } from '#layers/thei/shared/api/project';

const LIMIT = 50;

export default defineEventHandler(async (event): Promise<ProjectListItem[]> => {
  const query = getQuery(event);
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

  return projects.map((project) => {
    const iconAsset = iconUrlByProjectUuid.get(project.projectUuid);
    return {
      projectUuid: project.projectUuid,
      title: project.title,
      summary: project.summary,
      humanReadableSlug: project.humanReadableSlug,
      publicId: project.publicId,
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
