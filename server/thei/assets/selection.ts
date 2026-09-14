import { createError } from 'h3';
import { eq } from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import { assetSelectionError, type AssetSelectionConstraints } from '../../../shared/asset-library';
import type { StoredAssetRecord } from './storage';

export function assertAssetSelection(asset: StoredAssetRecord, constraints: AssetSelectionConstraints) {
  const error = assetSelectionError(asset, constraints);
  if (error) throw createError({ statusCode: 400, message: error === 'size' ? 'File exceeds the maximum allowed size' : 'File type is not allowed' });
}

export async function confirmAssetSelection(assetUuid: string, constraints: AssetSelectionConstraints) {
  const { db, schema } = THEI_SERVER.useDb();
  const asset = db.select().from(schema.assets).where(eq(schema.assets.assetUuid, assetUuid)).get();
  if (!asset?.settings) throw createError({ statusCode: 404, message: 'Asset no longer exists' });
  const file = await stat(THEI_SERVER.assets.filePath(assetUuid, asset.extension)).catch(() => null);
  if (!file?.isFile() || file.size !== asset.size) throw createError({ statusCode: 404, message: 'Asset file no longer exists' });
  // No await between the recheck and touch: cleanup cannot delete this selection
  // while it is being confirmed, and the transaction protects other connections.
  return db.transaction(tx => {
    const current = tx.select().from(schema.assets).where(eq(schema.assets.assetUuid, assetUuid)).get();
    if (!current?.settings) throw createError({ statusCode: 404, message: 'Asset no longer exists' });
    assertAssetSelection(current, constraints);
    tx.update(schema.assets).set({ touchedAt: Date.now() }).where(eq(schema.assets.assetUuid, assetUuid)).run();
    return current;
  });
}
