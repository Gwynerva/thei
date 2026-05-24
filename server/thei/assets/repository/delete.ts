import { eq } from 'drizzle-orm';

export async function deleteAsset(assetUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  await db.delete(schema.assets).where(eq(schema.assets.assetUuid, assetUuid));
}
