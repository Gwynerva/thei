import { inArray } from 'drizzle-orm';
import { ASSET_ORPHAN_GRACE_MS } from '../../../shared/asset-library';
import { assetsHeldByHistory } from '../content/history';

/** What cleanup has in store for an asset; nothing for one in use. */
export interface AssetRetention {
  /** Unix ms after which cleanup deletes the asset. */
  deleteAfter?: number;
  /** Unused, but kept while a version of some text still shows it. */
  inHistory?: true;
}

/**
 * Tells, the way cleanup decides it, which of these assets it will take and
 * when: one no usage row holds is kept while a version of some text shows it,
 * and otherwise goes a grace period after its last touch. An asset with any
 * usage row, whatever holds it, is absent from the result.
 */
export function readAssetRetention(
  rows: readonly { assetUuid: string; touchedAt: number }[],
): Map<string, AssetRetention> {
  const result = new Map<string, AssetRetention>();
  if (!rows.length) return result;
  const { db, schema } = THEI_SERVER.useDb();
  const ids = rows.map((row) => row.assetUuid);
  const referenced = new Set(
    db
      .select({ assetUuid: schema.assetUsages.assetUuid })
      .from(schema.assetUsages)
      .where(inArray(schema.assetUsages.assetUuid, ids))
      .all()
      .map((usage) => usage.assetUuid),
  );
  const held = assetsHeldByHistory(ids.filter((id) => !referenced.has(id)));
  for (const row of rows) {
    if (referenced.has(row.assetUuid)) continue;
    result.set(
      row.assetUuid,
      held.has(row.assetUuid)
        ? { inHistory: true }
        : { deleteAfter: row.touchedAt + ASSET_ORPHAN_GRACE_MS },
    );
  }
  return result;
}
