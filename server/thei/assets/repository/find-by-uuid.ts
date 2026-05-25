import { eq } from 'drizzle-orm';

export async function findAssetByUuid(assetUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db.query.assets.findFirst({
    where: eq(schema.assets.assetUuid, assetUuid),
  });
}
