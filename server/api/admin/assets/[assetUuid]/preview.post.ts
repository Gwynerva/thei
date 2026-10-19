import type {
  AssetPreviewFrameRequest,
  AssetPreviewFrameResponse,
} from '#layers/thei/shared/api/asset';
import { AssetType, type VideoAssetMeta } from '#layers/thei/shared/asset';
import { chooseVideoPreviewFrame } from '../../../../thei/assets/storage';

/**
 * A player's own reading of a video's length may run a little past the one
 * the file was probed for; a moment that far past it is the last frame.
 */
const DURATION_SLACK = 0.5;

/**
 * Takes a video's preview frame at the moment the owner chose, or lets it
 * be picked by itself again, for every video of its family.
 *
 * A write like any other: the pages and cards that show the still are built
 * again. A model is shown the new frame from its next turn, as a new look of
 * the file (`server/thei/ai/sessions/files.ts`).
 */
export default defineEventHandler(
  async (event): Promise<AssetPreviewFrameResponse> => {
    const assetUuid = getRouterParam(event, 'assetUuid') ?? '';
    const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (!asset || asset.type !== AssetType.Video)
      throw createError({ statusCode: 404, message: 'Video not found' });
    const body =
      (await readBody<Partial<AssetPreviewFrameRequest>>(event)) ?? {};
    const at = body.at;
    const duration = (asset.meta as VideoAssetMeta | null)?.duration;
    if (
      at !== null &&
      (typeof at !== 'number' ||
        !Number.isFinite(at) ||
        at < 0 ||
        (duration !== undefined && at > duration + DURATION_SLACK))
    )
      throw createError({
        statusCode: 400,
        message: 'at must be a moment of the video, in seconds, or null',
      });
    return await chooseVideoPreviewFrame(asset, at);
  },
);
