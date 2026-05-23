/**
 * Returns the on-disk path for an asset file.
 *
 * Files are sharded into 256 subdirectories by the first two hex characters
 * of the asset UUID (e.g. content/assets/a3/a3b4c5d6-....webp).
 * This prevents any single directory from accumulating an unbounded number
 * of entries, which degrades filesystem performance at scale.
 */
export function assetFilePath(assetUuid: string, extension: string): string {
  const shard = assetUuid.slice(0, 2);
  return THEI_SERVER.contentPath('assets', shard, `${assetUuid}.${extension}`);
}
