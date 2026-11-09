import { apiTokenExists } from '../../../thei/api-tokens';
import { markReadOnlyRequest } from '../../../thei/read-only-request';
import { requestAbortSignal } from '../../../thei/assets/request-signal';
import { stageUploadBody } from '../../../thei/assets/upload-stream';
import {
  describeFile,
  storeStagedFile,
  takeUploadTicket,
} from '../../../thei/mcp/files';

/**
 * The one-time address `upload_file` hands an AI client: the raw bytes of one
 * file, streamed to disk and stored as the admin's uploads are. The address
 * itself is the permission — opened by a token that may edit, good for one
 * file and a few minutes — so no other credential travels with the bytes.
 * The file is in the library like an upload of the owner's not yet placed:
 * a change that uses it puts it in place, and one nothing uses is let go by
 * the library's own sweep a day later.
 */
export default defineEventHandler(async (event) => {
  // A file is no content until a text or a field holds it.
  markReadOnlyRequest(event);
  if (!THEI_SERVER.config.mcp.enabled)
    throw createError({ statusCode: 404, message: 'Not found' });
  // An app that goes away stops the encoding of what it sent.
  const signal = requestAbortSignal(event);
  const ticket = takeUploadTicket(getRouterParam(event, 'ticket') ?? '');
  // A revoked token's addresses close with it.
  if (!ticket || !apiTokenExists(ticket.tokenUuid))
    throw createError({
      statusCode: 404,
      message:
        'This upload address is used up or has lapsed; ask for a new one.',
    });
  const staged = await stageUploadBody(event, {
    maxSizeBytes: ticket.maxSizeBytes,
  });
  const file = await storeStagedFile(staged, ticket, signal);
  return describeFile(file);
});
