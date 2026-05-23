import { eq } from 'drizzle-orm';

export function findAssetByLink(link: string) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.assets)
    .where(eq(schema.assets.link, link))
    .get();
}
