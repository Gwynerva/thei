import { desc, eq } from 'drizzle-orm';

export async function findAssetsByFamilyUuid(familyUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.query.assets.findMany({
    where: eq(schema.assets.familyUuid, familyUuid),
    orderBy: desc(schema.assets.touchedAt),
  });
}
