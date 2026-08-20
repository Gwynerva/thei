import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';
import type { AssetRole } from '#layers/thei/shared/asset';
import { AssetType, type AssetMeta } from '#layers/thei/shared/asset';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { buildStoredMediaDescriptor, type StoredAssetRecord } from './storage';

type StoredAsset = Parameters<typeof buildStoredMediaDescriptor>[0];

export async function buildPublicProjectMedia(
  project: { humanReadableSlug: string; publicId: string },
  asset: StoredAssetRecord,
  role: AssetRole,
) {
  const media = await buildStoredMediaDescriptor(asset);
  const src = `${buildProjectUrl(project.humanReadableSlug, project.publicId)}${role}/${asset.slug}.${asset.extension}`;
  return { ...media, src, previewSrc: src };
}

export async function buildAdminAssetUrls(asset: StoredAsset) {
  const assetUrl = buildAssetPreviewUrl(asset.assetUuid);

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
