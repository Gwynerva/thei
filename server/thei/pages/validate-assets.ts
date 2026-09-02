import type { ValidatedPageEditData } from '#layers/thei/shared/page';
import { AssetType } from '#layers/thei/shared/asset';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';

export async function validatePageAssets(data: ValidatedPageEditData) {
  if (!data.iconAssetUuid) return undefined;
  const asset = await THEI_SERVER.assets.findByUuid(data.iconAssetUuid);
  if (!asset) return 'Page icon asset does not exist';
  if (asset.type !== AssetType.Image && asset.type !== AssetType.Video)
    return 'Page icon must be an image or video';
  if (asset.size > ASSET_UPLOAD_LIMITS.media)
    return 'Page icon exceeds the maximum allowed size';
}
