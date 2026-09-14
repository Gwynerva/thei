import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';

/** Resolve an asset by the digest of bytes that are actually present in storage. */
export async function findStoredAssetByHash(
  hash: string,
  size?: number,
) {
  const { db, schema } = THEI_SERVER.useDb();
  const predicates = [
    eq(schema.assets.contentHash, hash),
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
      THEI_SERVER.assets.filePath(asset.assetUuid, asset.extension),
    ).catch(() => null);
    if (!file?.isFile() || file.size !== asset.size) continue;
    const digest = createHash('sha256');
    try {
      for await (const chunk of createReadStream(THEI_SERVER.assets.filePath(asset.assetUuid, asset.extension))) digest.update(chunk);
      if (digest.digest('hex') === hash) return asset;
    } catch {
      // A file removed during lookup is not a reusable candidate.
    }
  }
  return null;
}
