import { sendAssetFile } from '../../../../thei/assets/send-file';

/** Serves any asset by link to authenticated admins.
 *  Used by AssetUpload.vue to preview a newly uploaded asset before it is
 *  attached to a container. Not intended for public consumption. */
export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename') ?? '';
  const dot = filename.lastIndexOf('.');
  if (dot === -1) throw createError({ statusCode: 404 });

  const slug = filename.slice(0, dot);
  const ext = filename.slice(dot + 1).toLowerCase();

  const asset = await THEI_SERVER.assets.findBySlug(slug);
  if (!asset || asset.extension !== ext) throw createError({ statusCode: 404 });

  const filePath = THEI_SERVER.assets.filePath(
    asset.assetUuid,
    asset.extension,
  );
  return sendAssetFile(event, filePath, asset.extension, {
    cacheControl: 'private, no-cache',
    filename,
  });
});
