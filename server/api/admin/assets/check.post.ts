import type {
  AssetCheckRequest,
  AssetCheckResponse,
} from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';

export default defineEventHandler(
  async (event): Promise<AssetCheckResponse> => {
    await THEI_SERVER.getAdmin(event);
    const { rawHash, profileId } = await readBody<AssetCheckRequest>(event);
    if (!ASSET_PROFILES[profileId])
      throw createError({
        statusCode: 400,
        message: `Unknown profile: ${profileId}`,
      });
    const existing = THEI_SERVER.assets.findByHash(rawHash, profileId);
    if (!existing) return { exists: false };
    return {
      exists: true,
      assetUuid: existing.assetUuid,
      link: existing.link,
      extension: existing.extension,
    };
  },
);
