import { getAssetUsages } from '../../../../thei/assets/library';
import { withPlaceMedia } from '../../../../thei/assets/usage-media';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'assetUuid') ?? '';
  const usages = getAssetUsages(id);
  return { ...usages, placements: await withPlaceMedia(usages.placements) };
});
