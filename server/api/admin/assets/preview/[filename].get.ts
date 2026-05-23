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
  await THEI_SERVER.getAdmin(event);

  const filename = getRouterParam(event, 'filename') ?? '';
  const dot = filename.lastIndexOf('.');
  if (dot === -1) throw createError({ statusCode: 404 });

  const link = filename.slice(0, dot);
  const ext = filename.slice(dot + 1).toLowerCase();

  const asset = THEI_SERVER.assets.findByLink(link);
  if (!asset || asset.extension !== ext) throw createError({ statusCode: 404 });

  const filePath = THEI_SERVER.assets.filePath(
    asset.assetUuid,
    asset.extension,
  );
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) throw createError({ statusCode: 404 });

  setHeader(event, 'Content-Type', MIME[ext] ?? 'application/octet-stream');
  setHeader(event, 'Content-Length', fileStat.size);
  setHeader(event, 'Cache-Control', 'private, no-cache');
  return sendStream(event, createReadStream(filePath));
});
