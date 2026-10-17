import { apiTokenExists } from '../../../thei/api-tokens';
import { markReadOnlyRequest } from '../../../thei/read-only-request';
import { requestAbortSignal } from '../../../thei/assets/request-signal';
import { stageUploadBody } from '../../../thei/assets/upload-stream';
import {
  describeFile,
  storeStagedFile,
  takeUploadTicket,
} from '../../../thei/mcp/files';
import { placeAppFile } from '../../../thei/ai/sessions/files';
import { findSession } from '../../../thei/ai/sessions/store';

/** Whether a session still takes files in: not archived by the owner, nor gone. */
function sessionOpen(sessionUuid: string) {
  const session = findSession(sessionUuid);
  return Boolean(session && !session.closedAt);
}

const ARCHIVED = 'The owner archived the session this address was opened in.';

/**
 * The one-time address `upload_file` hands an AI client: the raw bytes of one
 * file, streamed to disk and stored as the admin's uploads are. The address
 * itself is the permission — opened by a token that may edit, good for one
 * file and a few minutes — so no other credential travels with the bytes.
 * The file is kept in the session the address was opened in, unless the
 * owner archived it while the bytes came: then nothing is kept.
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
  // An archived session takes nothing more in.
  if (!sessionOpen(ticket.sessionUuid))
    throw createError({ statusCode: 404, message: ARCHIVED });
  const staged = await stageUploadBody(event, {
    maxSizeBytes: ticket.maxSizeBytes,
  });
  if (!sessionOpen(ticket.sessionUuid)) {
    await staged.discard();
    throw createError({ statusCode: 404, message: ARCHIVED });
  }
  const file = await storeStagedFile(staged, ticket, signal);
  // Archived while it was stored: the file is placed nowhere, and the
  // library lets it go as it does any file nothing holds.
  if (!sessionOpen(ticket.sessionUuid))
    throw createError({ statusCode: 404, message: ARCHIVED });
  placeAppFile(ticket.sessionUuid, file.assetUuid);
  return describeFile(file);
});
