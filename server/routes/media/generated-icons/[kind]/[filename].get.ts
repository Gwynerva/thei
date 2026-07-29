import type { GeneratedIconKind } from '../../../../thei/media/generated-icon';
import {
  ensureGeneratedIcon,
} from '../../../../thei/media/generated-icon';
import { sendAssetFile } from '../../../../thei/assets/send-file';

export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, 'kind');
  const filename = getRouterParam(event, 'filename') ?? '';
  if (kind !== 'project' && kind !== 'author') {
    throw createError({ statusCode: 404 });
  }
  const match = /^([a-f0-9]{64})\.webp$/.exec(filename);
  if (!match) throw createError({ statusCode: 404 });
  const generated = await ensureGeneratedIcon(
    kind as GeneratedIconKind,
    match[1]!,
  );
  return sendAssetFile(event, generated.filePath, 'webp', {
    cacheControl: 'public, max-age=0, must-revalidate',
    etag: generated.etag,
    filename,
  });
});
