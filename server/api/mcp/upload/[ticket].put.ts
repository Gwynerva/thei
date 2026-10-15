import { apiTokenExists } from '../../../thei/api-tokens';
import { markReadOnlyRequest } from '../../../thei/read-only-request';
import { stageUploadBody } from '../../../thei/assets/upload-stream';
import {
  describeFile,
  storeStagedFile,
  takeUploadTicket,
  uploadLimit,
} from '../../../thei/mcp/files';
import { placeAppFile } from '../../../thei/ai/sessions/files';

/**
 * The one-time address `upload_file` hands an AI client: the raw bytes of one
 * file, streamed to disk and stored as the admin's uploads are. The address
 * itself is the permission — opened by a token that may edit, good for one
 * file and a few minutes — so no other credential travels with the bytes.
 * The file is kept in the session the address was opened in.
 */
export default defineEventHandler(async (event) => {
  // A file is no content until a text or a field holds it.
  markReadOnlyRequest(event);
  if (!THEI_SERVER.config.mcp.enabled)
    throw createError({ statusCode: 404, message: 'Not found' });
  const ticket = takeUploadTicket(getRouterParam(event, 'ticket') ?? '');
  // A revoked token's addresses close with it.
  if (!ticket || !apiTokenExists(ticket.tokenUuid))
    throw createError({
      statusCode: 404,
      message:
        'This upload address is used up or has lapsed; ask for a new one.',
    });
  const staged = await stageUploadBody(event, {
    maxSizeBytes: uploadLimit(ticket),
  });
  const file = await storeStagedFile(staged, ticket);
  placeAppFile(ticket.sessionUuid, file.assetUuid);
  return describeFile(file);
});
