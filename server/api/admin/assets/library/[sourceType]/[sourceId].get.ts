import {
  ASSET_SOURCE_TYPES,
  type AssetSourceType,
} from '#layers/thei/shared/asset-library';
import { listSourceAssets } from '../../../../../thei/assets/library';
import { parseLibraryQuery } from '../../../../../thei/assets/library-query';
export default defineEventHandler((event) => {
  const query = parseLibraryQuery(getQuery(event));
  const type = getRouterParam(event, 'sourceType') ?? '';
  const id = getRouterParam(event, 'sourceId') ?? '';
  if (!ASSET_SOURCE_TYPES.includes(type as AssetSourceType) || !id)
    throw createError({ statusCode: 400, message: 'Invalid asset source' });
  return listSourceAssets(type, id, query);
});
