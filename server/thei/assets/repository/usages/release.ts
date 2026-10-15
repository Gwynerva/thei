import type { SQL } from 'drizzle-orm';
import { touchReleasedAssets } from '../../../content/history';

/**
 * Deletes usage rows inside `tx`, and gives each file they placed its day of
 * grace from now when nothing else holds it: a banner taken off or a file
 * dropped from a list is not swept at once for having been placed long ago.
 */
export function deleteUsagesReleasing(
  tx: any,
  schema: any,
  where: SQL | undefined,
) {
  const released = (
    tx
      .select({ assetUuid: schema.assetUsages.assetUuid })
      .from(schema.assetUsages)
      .where(where)
      .all() as { assetUuid: string }[]
  ).map((row) => row.assetUuid);
  tx.delete(schema.assetUsages).where(where).run();
  if (released.length) touchReleasedAssets(tx, schema, released, Date.now());
}
