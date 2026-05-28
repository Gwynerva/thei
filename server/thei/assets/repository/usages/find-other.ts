import { and, eq, sql } from 'drizzle-orm';

export async function findOtherAssets(projectUuid: string) {
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
        eq(schema.assetUsages.containerType, 'project'),
        eq(schema.assetUsages.containerId, projectUuid),
        eq(schema.assetUsages.role, 'other-asset'),
      ),
    )
    .orderBy(sql`json_extract(${schema.assetUsages.meta}, '$.order')`);
}
