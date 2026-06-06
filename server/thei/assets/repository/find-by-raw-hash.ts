import { desc, eq } from 'drizzle-orm';

export async function findAssetsByRawHash(rawHash: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.query.assets.findMany({
    where: eq(schema.assets.rawHash, rawHash),
    orderBy: desc(schema.assets.touchedAt),
  });
}
