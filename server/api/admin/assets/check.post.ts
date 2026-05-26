import type {
  AssetCheckRequest,
  AssetCheckResponse,
} from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';

export default defineEventHandler(
  async (event): Promise<AssetCheckResponse> => {
    const { rawHash, profileId } = await readBody<AssetCheckRequest>(event);
    if (!ASSET_PROFILES[profileId])
      throw createError({
        statusCode: 400,
        message: `Unknown profile: ${profileId}`,
      });
    const existing = await THEI_SERVER.assets.findByHash(rawHash, profileId);
    if (!existing) return { exists: false };
    return {
      exists: true,
      assetUuid: existing.assetUuid,
      slug: existing.slug,
      extension: existing.extension,
      meta: existing.meta ?? null,
    };
  },
);
