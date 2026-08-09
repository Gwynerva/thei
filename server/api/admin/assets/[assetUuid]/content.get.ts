import { sendAssetFile } from '../../../../thei/assets/send-file';

/** Serves any asset by link to authenticated admins.
 *  Used by AssetUpload.vue to preview a newly uploaded asset before it is
 *  attached to a container. Not intended for public consumption. */
export default defineEventHandler(async (event) => {
  const assetUuid = getRouterParam(event, 'assetUuid') ?? '';
  const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
  if (!asset) throw createError({ statusCode: 404 });

  const filePath = THEI_SERVER.assets.filePath(
    asset.assetUuid,
    asset.extension,
  );
  const filename = `${asset.slug}.${asset.extension}`;
  return sendAssetFile(event, filePath, asset.extension, {
    cacheControl: 'private, no-cache',
    filename,
  });
});
