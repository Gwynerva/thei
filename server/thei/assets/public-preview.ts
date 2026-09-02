import { createError, getQuery, type H3Event } from 'h3';
import { AssetType } from '#layers/thei/shared/asset';
import type { StoredAssetRecord } from './storage';

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
  if (!preview) throw createError({ statusCode: 404 });
  return preview;
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
