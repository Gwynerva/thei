import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { parseAssetRange } from '../../../../thei/assets/send-file';
import { resolveBackupFile } from '../../../../thei/backup/manifest';
import {
  backupSessionHasFile,
  requireBackupSession,
} from '../../../../thei/backup/session';
import { touchBackupSession } from '../../../../thei/backup/state';
import { requireBackupToken } from '../../../../thei/backup/token';

export default defineEventHandler(async (event) => {
  requireBackupToken(event);
  const sessionId = getRouterParam(event, 'sessionId') ?? '';
  await requireBackupSession(sessionId);

  const requested = String(getQuery(event).path ?? '');
  // Only what the session listed, whatever else the path might resolve to.
  const filePath = (await backupSessionHasFile(sessionId, requested))
    ? resolveBackupFile(sessionId, requested)
    : undefined;
  if (!filePath) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' });
  }

  const info = await stat(filePath).catch(() => null);
  // A file listed in the manifest can be gone by the time it is asked for:
  // cleanup reclaims orphans while the transfer runs. That is garbage the
  // snapshot does not depend on, so the client is told to move on rather than
  // the whole run being failed.
  if (!info?.isFile()) {
    throw createError({ statusCode: 404, statusMessage: 'File is gone' });
  }

  setHeader(event, 'Content-Type', 'application/octet-stream');
  setHeader(event, 'X-Content-Type-Options', 'nosniff');
  setHeader(event, 'Cache-Control', 'no-store');
  setHeader(event, 'Accept-Ranges', 'bytes');

  const requestedRange = getHeader(event, 'range');
  if (requestedRange) {
    const range = parseAssetRange(requestedRange, info.size);
    if (!range) {
      setHeader(event, 'Content-Range', `bytes */${info.size}`);
      throw createError({ statusCode: 416 });
    }
    setResponseStatus(event, 206);
    setHeader(
      event,
      'Content-Range',
      `bytes ${range.start}-${range.end}/${info.size}`,
    );
    setHeader(event, 'Content-Length', range.end - range.start + 1);
    return sendStream(
      event,
      keepAlive(
        sessionId,
        createReadStream(filePath, { start: range.start, end: range.end }),
      ),
    );
  }

  setHeader(event, 'Content-Length', info.size);
  return sendStream(event, keepAlive(sessionId, createReadStream(filePath)));
});

/**
 * A large file over a slow line can take longer than a session may stay
 * silent; every chunk sent counts as the session being alive.
 */
function keepAlive<T extends NodeJS.ReadableStream>(
  sessionId: string,
  stream: T,
): T {
  stream.on('data', () => touchBackupSession(sessionId));
  return stream;
}
