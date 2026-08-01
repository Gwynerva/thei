import { readFile } from 'node:fs/promises';
import { externalLinkFaviconPath } from '../../../thei/external-links/repository';

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename') ?? '';
  if (!/^[a-f0-9]{64}\.webp$/.test(filename)) {
    throw createError({ statusCode: 404 });
  }
  const key = filename.slice(0, -5);
  const data = await readFile(externalLinkFaviconPath(key)).catch(() => null);
  if (!data) throw createError({ statusCode: 404 });
  setHeader(event, 'content-type', 'image/webp');
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable');
  return data;
});
