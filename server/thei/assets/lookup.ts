import { stat } from 'node:fs/promises';
import { and, eq, isNotNull } from 'drizzle-orm';

/**
 * Resolve an asset by the digest of bytes that are actually present in storage.
 *
 * Because files are addressed by content, a file sitting at the path the digest
 * derives is a file whose bytes hash to that digest. The size check catches a
 * truncated or half-written file, so no re-read of the file is needed: the old
 * implementation streamed every candidate through SHA-256, which meant picking
 * a 100 MB video out of the library cost a 100 MB disk read.
 */
export async function findStoredAssetByHash(hash: string, size?: number) {
  const { db, schema } = THEI_SERVER.useDb();
  const predicates = [
    eq(schema.assets.contentHash, hash),
    // Internal helper assets (previews) are never selectable.
    isNotNull(schema.assets.settings),
  ];
  if (size !== undefined) predicates.push(eq(schema.assets.size, size));
  const rows = db
    .select()
    .from(schema.assets)
    .where(and(...predicates))
    .orderBy(schema.assets.assetUuid)
    .all();

  for (const asset of rows) {
    const file = await stat(
      THEI_SERVER.assets.filePath(asset.contentHash, asset.extension),
    ).catch(() => null);
    if (!file?.isFile() || file.size !== asset.size) continue;
    return asset;
  }

  return null;
}
