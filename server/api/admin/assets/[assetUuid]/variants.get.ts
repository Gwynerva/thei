import type { AssetVariantsResponse } from '#layers/thei/shared/api/asset';
import { buildAssetVariantInfo } from '../../../../thei/assets/storage';

export default defineEventHandler(
  async (event): Promise<AssetVariantsResponse> => {
    const assetUuid = getRouterParam(event, 'assetUuid');
    if (!assetUuid) {
      throw createError({ statusCode: 400, message: 'Missing assetUuid' });
    }

    const current = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (!current) {
      throw createError({ statusCode: 404, message: 'Asset not found' });
    }
    const assets = await THEI_SERVER.assets.findByFamilyUuid(
      current.familyUuid,
    );
    return {
      currentAssetUuid: current.assetUuid,
      variants: await Promise.all(
        assets.map(async (asset) => ({
          ...(await buildAssetVariantInfo(asset)),
          usageCount: await THEI_SERVER.assets.countPlacements(
            asset.assetUuid,
          ),
        })),
      ),
    };
  },
);
