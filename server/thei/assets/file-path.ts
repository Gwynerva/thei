import { THEI_CONTENT_DIRS } from '../content-layout';

/**
 * Returns the on-disk path for an asset file.
 *
 * Files are addressed by their content, not by the row that references them:
 * the same bytes derived from two different sources are one file, and the
 * `assets` row is a logical handle pointing at it. Deleting a row therefore
 * only deletes the file once no other row shares the same content.
 *
 * Files are sharded into 256 subdirectories by the first two hex characters of
 * the digest (e.g. content/assets/a3/a3b4c5....webp). This keeps any single
 * directory from accumulating an unbounded number of entries, which degrades
 * filesystem performance at scale.
 */
export function assetFilePath(contentHash: string, extension: string): string {
  const shard = contentHash.slice(0, 2);
  return THEI_SERVER.contentPath(
    THEI_CONTENT_DIRS.assets,
    shard,
    `${contentHash}.${extension}`,
  );
}
