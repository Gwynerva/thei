import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';
import { AssetType, type AssetMeta } from '#layers/thei/shared/asset';
import { findVideoPreviewAsset } from './storage';

type StoredAsset = Parameters<typeof findVideoPreviewAsset>[0];

export async function buildAdminAssetUrls(asset: StoredAsset) {
  const assetUrl = buildAssetPreviewUrl(asset.slug, asset.extension);

  if (asset.type === AssetType.Video) {
    const preview = await findVideoPreviewAsset(asset);
    return {
      assetUrl,
      previewUrl: preview
        ? buildAssetPreviewUrl(preview.slug, preview.extension)
        : undefined,
      videoUrl: assetUrl,
    };
  }

  return {
    assetUrl,
    previewUrl: asset.type === AssetType.Image ? assetUrl : undefined,
    videoUrl: undefined,
  };
}

export function archivedOriginalFromMeta(meta: AssetMeta | null | undefined) {
  return meta && 'archivedOriginal' in meta ? meta.archivedOriginal : undefined;
}

export function dominantHueFromMeta(meta: AssetMeta | null | undefined) {
  return meta && 'dominantHue' in meta ? meta.dominantHue : undefined;
}
