import type { ValidatedProjectEditData } from '#layers/thei/shared/admin/project';
import { AssetType, type AssetMeta } from '#layers/thei/shared/asset';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';

type ProjectAssetCheck = {
  assetUuid: unknown;
  label: string;
  maxSize: number;
  mediaOnly?: boolean;
};

export async function validateProjectAssets(
  data: ValidatedProjectEditData,
): Promise<string | undefined> {
  const checks: ProjectAssetCheck[] = [];

  if (data.iconAssetUuid) {
    checks.push({
      assetUuid: data.iconAssetUuid,
      label: 'Project icon',
      maxSize: ASSET_UPLOAD_LIMITS.media,
      mediaOnly: true,
    });
  }

  if (data.bannerAssetUuid) {
    checks.push({
      assetUuid: data.bannerAssetUuid,
      label: 'Project banner',
      maxSize: ASSET_UPLOAD_LIMITS.media,
      mediaOnly: true,
    });
  }

  for (const item of data.showcaseAssets ?? []) {
    checks.push({
      assetUuid: item.assetUuid,
      label: 'Showcase asset',
      maxSize: ASSET_UPLOAD_LIMITS.media,
      mediaOnly: true,
    });
  }

  for (const item of data.otherAssets ?? []) {
    checks.push({
      assetUuid: item.assetUuid,
      label: 'Other file',
      maxSize: ASSET_UPLOAD_LIMITS.file,
    });
  }

  for (const check of checks) {
    const error = await validateProjectAsset(check);
    if (error) return error;
  }
}

async function validateProjectAsset(check: ProjectAssetCheck) {
  if (!check.assetUuid || typeof check.assetUuid !== 'string') {
    return `${check.label} asset is missing`;
  }

  const asset = await THEI_SERVER.assets.findByUuid(check.assetUuid);
  if (!asset) {
    return `${check.label} asset does not exist`;
  }

  if (
    check.mediaOnly &&
    asset.type !== AssetType.Image &&
    asset.type !== AssetType.Video
  ) {
    return `${check.label} must be an image or video`;
  }

  if (assetSizeForLimit(asset.size, asset.meta) > check.maxSize) {
    return `${check.label} exceeds the maximum allowed size`;
  }
}

function assetSizeForLimit(size: number, meta: AssetMeta | null): number {
  const archivedOriginalSize =
    meta && 'archivedOriginal' in meta
      ? meta.archivedOriginal?.size
      : undefined;

  return Math.max(size, archivedOriginalSize ?? 0);
}
