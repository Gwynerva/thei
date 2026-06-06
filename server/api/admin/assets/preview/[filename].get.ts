import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

const MIME: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

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
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) throw createError({ statusCode: 404 });

  const range = getHeader(event, 'range');
  setHeader(event, 'Content-Type', MIME[ext] ?? 'application/octet-stream');
  setHeader(event, 'Cache-Control', 'private, no-cache');

  if (range) {
    const parsedRange = parseRange(range, fileStat.size);
    if (!parsedRange) {
      setHeader(event, 'Content-Range', `bytes */${fileStat.size}`);
      throw createError({ statusCode: 416 });
    }

    const { start, end } = parsedRange;
    setResponseStatus(event, 206);
    setHeader(event, 'Accept-Ranges', 'bytes');
    setHeader(event, 'Content-Range', `bytes ${start}-${end}/${fileStat.size}`);
    setHeader(event, 'Content-Length', end - start + 1);
    return sendStream(event, createReadStream(filePath, { start, end }));
  }

  setHeader(event, 'Accept-Ranges', 'bytes');
  setHeader(event, 'Content-Length', fileStat.size);
  return sendStream(event, createReadStream(filePath));
});

function parseRange(range: string, size: number) {
  const match = range.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startText, endText] = match;
  let start = startText ? Number(startText) : 0;
  let end = endText ? Number(endText) : size - 1;

  if (!startText && endText) {
    const suffixLength = Number(endText);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}
