import { parseSelectionConstraints } from '../../../../thei/assets/library-query';
import { confirmAssetSelection } from '../../../../thei/assets/selection';
export default defineEventHandler(async (event) => {
  const assetUuid = getRouterParam(event, 'assetUuid');
  if (!assetUuid) {
    throw createError({ statusCode: 404, message: 'Asset not found' });
  }
  const body = (await readBody(event)) ?? {};
  await confirmAssetSelection(assetUuid, parseSelectionConstraints(body));
  return { ok: true };
});
