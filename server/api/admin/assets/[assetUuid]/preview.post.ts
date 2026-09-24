import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import { refreshMediaPreview } from '../../../../thei/assets/storage';

/**
 * Makes a video's preview again from a frame that shows it.
 *
 * Previews made before frames were chosen show the first one, black for many
 * videos; nothing is re-encoded but the small preview image.
 */
export default defineEventHandler(async (event): Promise<AssetVariantInfo> => {
  const assetUuid = getRouterParam(event, 'assetUuid') ?? '';
  const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
  if (!asset || asset.type !== AssetType.Video) {
    throw createError({ statusCode: 404 });
  }
  return await refreshMediaPreview(asset);
});
