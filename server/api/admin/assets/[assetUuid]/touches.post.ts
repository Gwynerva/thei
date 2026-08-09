export default defineEventHandler(async (event) => {
  const assetUuid = getRouterParam(event, 'assetUuid');
  if (!assetUuid || !(await THEI_SERVER.assets.findByUuid(assetUuid))) {
    throw createError({ statusCode: 404, message: 'Asset not found' });
  }
  await THEI_SERVER.assets.touch(assetUuid);
  return { ok: true };
});
