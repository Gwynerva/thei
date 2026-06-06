import type {
  AssetVariantsRequest,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import { buildAssetVariantInfo } from '../../../thei/assets/storage';

export default defineEventHandler(
  async (event): Promise<AssetVariantsResponse> => {
    const { rawHash } = await readBody<AssetVariantsRequest>(event);
    if (!rawHash) {
      throw createError({ statusCode: 400, message: 'Missing rawHash' });
    }

    const assets = await THEI_SERVER.assets.findByRawHash(rawHash);
    return {
      variants: await Promise.all(assets.map(buildAssetVariantInfo)),
    };
  },
);
