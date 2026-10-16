import { apiTokenExists } from '../../../thei/api-tokens';
import { markReadOnlyRequest } from '../../../thei/read-only-request';
import { sendAssetFile } from '../../../thei/assets/send-file';
import { takeDownloadTicket } from '../../../thei/mcp/files';

/**
 * The one-time address `download_file` hands an AI client: one library file,
 * streamed as stored, for an app that describes or reads it itself. The
 * address is the permission — opened by a key, good for one download and a
 * few minutes — so no other credential travels with the request.
 */
export default defineEventHandler(async (event) => {
  markReadOnlyRequest(event);
  if (!THEI_SERVER.config.mcp.enabled)
    throw createError({ statusCode: 404, message: 'Not found' });
  const ticket = takeDownloadTicket(getRouterParam(event, 'ticket') ?? '');
  // A revoked key's addresses close with it.
  if (!ticket || !apiTokenExists(ticket.tokenUuid))
    throw createError({
      statusCode: 404,
      message:
        'This download address is used up or has lapsed; ask for a new one.',
    });
  const asset = await THEI_SERVER.assets.findByUuid(ticket.assetUuid);
  if (!asset) throw createError({ statusCode: 404, message: 'File not found' });
  return sendAssetFile(
    event,
    THEI_SERVER.assets.filePath(asset.contentHash, asset.extension),
    asset.extension,
    {
      cacheControl: 'private, no-store',
      filename: `${asset.assetUuid}.${asset.extension}`,
    },
  );
});
