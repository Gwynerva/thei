import { getAssetUsages } from '../../../../thei/assets/library';
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'assetUuid') ?? '';
  return getAssetUsages(id);
});
