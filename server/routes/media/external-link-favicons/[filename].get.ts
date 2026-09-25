import { readFile } from 'node:fs/promises';
import {
  EXTERNAL_LINK_FAVICON_EXTENSION,
  externalLinkFaviconPath,
  fallbackFaviconTile,
} from '../../../thei/external-links/favicon';

const FAVICON_FILENAME = /^([a-f0-9]{64})\.([a-z0-9]+)$/;

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename') ?? '';
  const match = FAVICON_FILENAME.exec(filename);
  if (!match || match[2] !== EXTERNAL_LINK_FAVICON_EXTENSION) {
    throw createError({ statusCode: 404 });
  }
  setHeader(event, 'content-type', `image/${EXTERNAL_LINK_FAVICON_EXTENSION}`);
  const data = await readFile(externalLinkFaviconPath(match[1]!)).catch(
    () => null,
  );
  if (data) {
    setHeader(event, 'cache-control', 'public, max-age=31536000, immutable');
    return data;
  }
  // A file that is gone — after a restore that left it out, say — shows the
  // neutral tile until the link is refreshed, not a broken image.
  setHeader(event, 'cache-control', 'public, max-age=300');
  return await fallbackFaviconTile();
});
