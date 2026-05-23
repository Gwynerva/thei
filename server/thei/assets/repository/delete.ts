import { eq } from 'drizzle-orm';

export function deleteAsset(assetUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  db.delete(schema.assets).where(eq(schema.assets.assetUuid, assetUuid)).run();
}
