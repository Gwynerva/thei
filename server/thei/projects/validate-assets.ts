import type { ValidatedProjectEditData } from '#layers/thei/shared/admin/project';
import { AssetType, type AssetMeta } from '#layers/thei/shared/asset';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';

type ProjectAssetCheck = {
  assetUuid: unknown;
  label: string;
  maxSize: number;
  mediaOnly?: boolean;
  imageOnly?: boolean;
};

export async function validateProjectAssets(
  data: ValidatedProjectEditData,
): Promise<string | undefined> {
  const checks: ProjectAssetCheck[] = [];
  const assets = new Map<
    string,
    Awaited<ReturnType<typeof THEI_SERVER.assets.findByUuid>>
  >();

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

  if (data.action?.iconAssetUuid)
    checks.push({
      assetUuid: data.action.iconAssetUuid,
      label: 'Action button icon',
      maxSize: ASSET_UPLOAD_LIMITS.media,
      imageOnly: true,
    });
  if (data.action?.backgroundAssetUuid)
    checks.push({
      assetUuid: data.action.backgroundAssetUuid,
      label: 'Action button background',
      maxSize: ASSET_UPLOAD_LIMITS.media,
      imageOnly: true,
    });
  if (data.action?.fileAssetUuid)
    checks.push({
      assetUuid: data.action.fileAssetUuid,
      label: 'Action button file',
      maxSize: ASSET_UPLOAD_LIMITS.file,
      mediaOnly: data.action.backgroundMode === 'file-gradient',
    });

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
    if (!check.assetUuid || typeof check.assetUuid !== 'string')
      return `${check.label} asset is missing`;
    let asset = assets.get(check.assetUuid);
    if (!assets.has(check.assetUuid)) {
      asset = await THEI_SERVER.assets.findByUuid(check.assetUuid);
      assets.set(check.assetUuid, asset);
    }
    const error = validateProjectAsset(check, asset);
    if (error) return error;
  }
}

function validateProjectAsset(
  check: ProjectAssetCheck,
  asset: Awaited<ReturnType<typeof THEI_SERVER.assets.findByUuid>>,
) {
  if (!asset) {
    return `${check.label} asset does not exist`;
  }

  if (check.imageOnly && asset.type !== AssetType.Image) {
    return `${check.label} must be an image`;
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
