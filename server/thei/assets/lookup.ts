import { stat } from 'node:fs/promises';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import {
  buildAssetSettingsKey,
  createOriginalAssetSettings,
} from '#layers/thei/shared/asset-upload-settings';

/**
 * Resolve an asset by the digest of a file the user holds.
 *
 * Two assets answer to it: one whose stored bytes hash to that digest, and the
 * original kept for that very upload. An original is stored without its
 * embedded metadata, so its bytes no longer match the file it came from, but
 * its family is still named after that file's digest.
 *
 * Because files are addressed by content, a file sitting at the path the digest
 * derives is a file whose bytes hash to that digest. The size check catches a
 * truncated or half-written file, so no re-read of the file is needed: the old
 * implementation streamed every candidate through SHA-256, which meant picking
 * a 100 MB video out of the library cost a 100 MB disk read.
 */
export async function findStoredAssetByHash(hash: string, size?: number) {
  const { db, schema } = THEI_SERVER.useDb();
  const sameBytes = [eq(schema.assets.contentHash, hash)];
  if (size !== undefined) sameBytes.push(eq(schema.assets.size, size));
  const rows = db
    .select()
    .from(schema.assets)
    .where(
      and(
        // Internal helper assets (previews) are never selectable.
        isNotNull(schema.assets.settings),
        or(
          and(...sameBytes),
          and(
            eq(schema.assets.familyUuid, `af-${hash}`),
            eq(
              schema.assets.settingsKey,
              buildAssetSettingsKey(createOriginalAssetSettings()),
            ),
          ),
        ),
      ),
    )
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
