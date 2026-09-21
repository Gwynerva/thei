import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { H3Event } from 'h3';

/**
 * Serves one favicon file.
 *
 * Written out here rather than through `sendAssetFile`, which labels every SVG
 * as a download — the right call for library files, since an SVG can carry
 * script, and wrong for a tab icon, which has to be a real image. The SVG is
 * sent inline under a locked-down policy instead: no scripts, no network,
 * sandboxed.
 */
export async function sendFaviconFile(
  event: H3Event,
  file: { filePath: string; etag: string; contentType: string },
) {
  const fileStat = await stat(file.filePath).catch(() => null);
  if (!fileStat) throw createError({ statusCode: 404 });

  setHeader(event, 'Content-Type', file.contentType);
  setHeader(event, 'X-Content-Type-Options', 'nosniff');
  setHeader(event, 'Cache-Control', 'public, max-age=86400');
  setHeader(event, 'ETag', file.etag);
  if (file.contentType === 'image/svg+xml')
    setHeader(
      event,
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );

  const validators = getHeader(event, 'if-none-match')
    ?.split(',')
    .map((value) => value.trim().replace(/^W\//, ''));
  if (validators?.includes(file.etag) || validators?.includes('*')) {
    setResponseStatus(event, 304);
    return null;
  }

  setHeader(event, 'Content-Length', fileStat.size);
  return sendStream(event, createReadStream(file.filePath));
}
