import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { H3Event } from 'h3';

/**
 * Sends a rendered card.
 *
 * The `?v=` a page puts on the URL exists for the link previewers that cache
 * by address and ignore headers, so that a new version of a card arrives
 * under a new address. What this route serves is always the current drawing:
 * under an address that names this very version it never changes and may be
 * kept for good, under any other for an hour.
 */
export async function sendOgImage(
  event: H3Event,
  file: { filePath: string; etag: string; tag: string },
) {
  const info = await stat(file.filePath).catch(() => null);
  if (!info) throw createError({ statusCode: 404 });
  setHeader(event, 'Content-Type', 'image/png');
  setHeader(event, 'X-Content-Type-Options', 'nosniff');
  setHeader(
    event,
    'Cache-Control',
    getQuery(event).v === file.tag
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
  );
  setHeader(event, 'ETag', file.etag);
  const validators = getHeader(event, 'if-none-match')
    ?.split(',')
    .map((value) => value.trim().replace(/^W\//, ''));
  if (validators?.includes(file.etag) || validators?.includes('*')) {
    setResponseStatus(event, 304);
    return null;
  }
  setHeader(event, 'Content-Length', info.size);
  return sendStream(event, createReadStream(file.filePath));
}
