import type {
  AssetCheckRequest,
  AssetCheckResponse,
} from '#layers/thei/shared/api/asset';
import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';

export default defineEventHandler(
  async (event): Promise<AssetCheckResponse> => {
    const { rawHash, profileId } = await readBody<AssetCheckRequest>(event);
    const profile = ASSET_PROFILES[profileId];
    if (!profile)
      throw createError({
        statusCode: 400,
        message: `Unknown profile: ${profileId}`,
      });
    const existing = await THEI_SERVER.assets.findByHash(rawHash, profileId);
    if (!existing) return { exists: false };

    let videoPreviewUrl: string | undefined;
    if (profile.hasVideoPreview && existing.meta?.previewAssetUuid) {
      const thumb = await THEI_SERVER.assets.findByUuid(
        existing.meta.previewAssetUuid,
      );
      if (thumb) {
        videoPreviewUrl = buildAssetPreviewUrl(thumb.slug, 'webp');
      }
    }

    return {
      exists: true,
      assetUuid: existing.assetUuid,
      slug: existing.slug,
      extension: existing.extension,
      meta: existing.meta ?? null,
      size: existing.size,
      videoPreviewUrl,
    };
  },
);
