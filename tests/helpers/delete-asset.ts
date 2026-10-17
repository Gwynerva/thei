import { eq } from 'drizzle-orm';
import { forgetFamilyDescriptions } from '../../server/thei/assets/descriptions';

/**
 * Takes an asset row away as cleanup would once nothing holds it, without
 * its file: what goes with the last file of a family goes with it.
 */
export function deleteAssetRow(assetUuid: string) {
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
