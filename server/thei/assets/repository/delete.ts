import { eq } from 'drizzle-orm';
import { forgetFamilyDescriptions } from '../descriptions';

export async function deleteAsset(assetUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    const row = tx
      .select({ familyUuid: schema.assets.familyUuid })
      .from(schema.assets)
      .where(eq(schema.assets.assetUuid, assetUuid))
      .get();
    tx.delete(schema.assets)
      .where(eq(schema.assets.assetUuid, assetUuid))
      .run();
    if (row) forgetFamilyDescriptions(tx, schema, [row.familyUuid]);
  });
}
