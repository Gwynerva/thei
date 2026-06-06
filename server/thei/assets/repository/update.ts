import { eq } from 'drizzle-orm';
import type { AssetMeta } from '../../db/schema/assets';

export async function updateAsset(
  assetUuid: string,
  patch: { meta?: AssetMeta | null },
) {
  const { db, schema } = THEI_SERVER.useDb();
  await db
    .update(schema.assets)
    .set(patch)
    .where(eq(schema.assets.assetUuid, assetUuid));
}
