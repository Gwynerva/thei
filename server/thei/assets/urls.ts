import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';
import { AssetType, type AssetMeta } from '#layers/thei/shared/asset';
import { buildStoredMediaDescriptor } from './storage';

type StoredAsset = Parameters<typeof buildStoredMediaDescriptor>[0];

export async function buildAdminAssetUrls(asset: StoredAsset) {
  const assetUrl = buildAssetPreviewUrl(asset.slug, asset.extension);

  if (asset.type === AssetType.Video || asset.type === AssetType.Image) {
    return {
      assetUrl,
      media: await buildStoredMediaDescriptor(asset),
    };
  }

  return {
    assetUrl,
    media: undefined,
  };
}

export function archivedOriginalFromMeta(meta: AssetMeta | null | undefined) {
  return meta && 'archivedOriginal' in meta ? meta.archivedOriginal : undefined;
}

export function dominantHueFromMeta(meta: AssetMeta | null | undefined) {
  return meta && 'dominantHue' in meta ? meta.dominantHue : undefined;
}
