import type { ValidatedEventEditData } from '#layers/thei/shared/event';
import { AssetType } from '#layers/thei/shared/asset';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';

export async function validateEventAssets(data: ValidatedEventEditData) {
  const checks: Array<{
    assetUuid: string;
    maxSize: number;
    imageOnly?: boolean;
    mediaOnly?: boolean;
  }> = [];
  for (const file of data.otherAssets ?? [])
    checks.push({
      assetUuid: file.assetUuid,
      maxSize: ASSET_UPLOAD_LIMITS.file,
    });
  if (data.action.iconAssetUuid)
    checks.push({
      assetUuid: data.action.iconAssetUuid,
      maxSize: ASSET_UPLOAD_LIMITS.media,
      imageOnly: true,
    });
  if (data.action.backgroundAssetUuid)
    checks.push({
      assetUuid: data.action.backgroundAssetUuid,
      maxSize: ASSET_UPLOAD_LIMITS.media,
      imageOnly: true,
    });
  if (data.action.fileAssetUuid)
    checks.push({
      assetUuid: data.action.fileAssetUuid,
      maxSize: ASSET_UPLOAD_LIMITS.file,
      mediaOnly: data.action.backgroundMode === 'file-gradient',
    });

  for (const check of checks) {
    const asset = await THEI_SERVER.assets.findByUuid(check.assetUuid);
    if (!asset) return 'Event asset does not exist';
    if (asset.size > check.maxSize) return 'Event asset exceeds size limit';
    if (check.imageOnly && asset.type !== AssetType.Image)
      return 'Action image must be an image';
    if (
      check.mediaOnly &&
      asset.type !== AssetType.Image &&
      asset.type !== AssetType.Video
    )
      return 'Action button file color requires an image or video';
  }
}
