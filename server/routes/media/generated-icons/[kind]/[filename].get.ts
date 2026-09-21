import {
  ensureGeneratedIcon,
  GENERATED_ICON_EXTENSION,
  isGeneratedIconKind,
} from '../../../../thei/media/generated-icon';
import { sendAssetFile } from '../../../../thei/assets/send-file';
import { PUBLIC_ASSET_CACHE_CONTROL } from '../../../../thei/assets/cache-control';

const GENERATED_ICON_FILENAME = /^([a-f0-9]{64})\.([a-z0-9]+)$/;

export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, 'kind');
  const filename = getRouterParam(event, 'filename') ?? '';
  if (!isGeneratedIconKind(kind)) {
    throw createError({ statusCode: 404 });
  }
  const match = GENERATED_ICON_FILENAME.exec(filename);
  if (!match || match[2] !== GENERATED_ICON_EXTENSION) {
    throw createError({ statusCode: 404 });
  }
  const generated = await ensureGeneratedIcon(kind, match[1]!);
  return sendAssetFile(event, generated.filePath, GENERATED_ICON_EXTENSION, {
    cacheControl: PUBLIC_ASSET_CACHE_CONTROL,
    etag: generated.etag,
    filename,
  });
});
