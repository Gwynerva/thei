import { and, eq, sql } from 'drizzle-orm';

export async function findOtherAssets(projectUuid: string) {
  return findOtherAssetsForContainer('project', projectUuid);
}

export async function findOtherAssetsForContainer(
  containerType: 'project' | 'event',
  containerId: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ asset: schema.assets, meta: schema.assetUsages.meta })
    .from(schema.assets)
    .innerJoin(
      schema.assetUsages,
      eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
    )
    .where(
      and(
        eq(schema.assetUsages.containerType, containerType),
        eq(schema.assetUsages.containerId, containerId),
        eq(schema.assetUsages.role, 'other-asset'),
      ),
    )
    .orderBy(sql`json_extract(${schema.assetUsages.meta}, '$.order')`);
}
