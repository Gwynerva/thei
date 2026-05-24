import { eq } from 'drizzle-orm';

/** Refresh touchedAt so the orphan cleanup grace period resets. Call when dedup returns an existing asset. */
export async function touchAsset(assetUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  await db
    .update(schema.assets)
    .set({ touchedAt: Date.now() })
    .where(eq(schema.assets.assetUuid, assetUuid));
}
