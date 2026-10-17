import type { AssetDescriptionResponse } from '#layers/thei/shared/asset-description';
import { readAssetDescription } from '../../../../thei/assets/descriptions';
import { fileOffers } from '../../../../thei/ai/file-panel';
import { asksRunning } from '../../../../thei/ai/field-ask';
import { sessionModel } from '../../../../thei/ai/model/settings';
import { markReadOnlyRequest } from '../../../../thei/read-only-request';

/**
 * A file's description, read through any file of its family, and — with AI
 * on — what an AI proposes for it, settled against it first.
 */
export default defineEventHandler(
  async (event): Promise<AssetDescriptionResponse> => {
    markReadOnlyRequest(event);
    const assetUuid = getRouterParam(event, 'assetUuid') ?? '';
    const description = readAssetDescription(assetUuid);
    if (!description)
      throw createError({ statusCode: 404, message: 'File not found' });
    const { familyUuid: _family, ...kept } = description;
    return {
      ...kept,
      ...(THEI_SERVER.config.mcp.enabled
        ? {
            offers: await fileOffers(assetUuid),
            asking: asksRunning(`asset:${assetUuid}`),
            modelReady: Boolean(sessionModel()),
          }
        : {}),
    };
  },
);
