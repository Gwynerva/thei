import { createError, getQuery, type H3Event } from 'h3';
import { AssetType } from '#layers/thei/shared/asset';
import type { StoredAssetRecord } from './storage';

/**
 * The file a `?preview=1` request gets: the asset's preview, or, for an
 * image that has none, the image itself.
 *
 * An image is what its preview would be made from, only larger, so it can
 * stand in for one. That is what happens when a preview is itself placed as
 * a picture — a preview of a preview is never made — and in a library older
 * than previews. A video has no such stand-in: its preview is a still, and
 * the video file would not do where an image is expected.
 */
export async function resolvePublicAssetVariant(
  event: H3Event,
  asset: StoredAssetRecord,
): Promise<StoredAssetRecord> {
  if (getQuery(event).preview !== '1') return asset;
  if (asset.type !== AssetType.Image && asset.type !== AssetType.Video) {
    throw createError({ statusCode: 404 });
  }
  const preview = (
    await THEI_SERVER.assets.usages.findByContainer('asset', asset.assetUuid)
  ).find((usage) => usage.role === 'preview')?.asset;
  if (preview) return preview;
  if (asset.type === AssetType.Image) return asset;
  throw createError({ statusCode: 404 });
}

export function publicAssetFilename(
  requestedFilename: string,
  source: StoredAssetRecord,
  selected: StoredAssetRecord,
): string {
  return selected.assetUuid === source.assetUuid
    ? requestedFilename
    : `${source.slug}-preview.${selected.extension}`;
}
