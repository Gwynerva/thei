import type { AssetVariantsResponse } from '#layers/thei/shared/api/asset';
import { buildAssetVariantInfos } from '../../../../thei/assets/storage';

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
    const [variants, usageCounts] = await Promise.all([
      buildAssetVariantInfos(assets),
      THEI_SERVER.assets.countPlacementsByUuids(
        assets.map((asset) => asset.assetUuid),
      ),
    ]);
    return {
      currentAssetUuid: current.assetUuid,
      variants: variants.map((variant) => ({
        ...variant,
        usageCount: usageCounts.get(variant.assetUuid) ?? 0,
      })),
    };
  },
);
