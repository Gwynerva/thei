import { OG_TARGET_KINDS, type OgTargetKind } from '../../../thei/og/cards';
import { ensureOgImage } from '../../../thei/og/cache';
import { sendOgImage } from '../../../thei/og/response';

export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, 'kind') ?? '';
  // Nitro names the parameter after the whole segment, `.png` included.
  const id = (getRouterParam(event, 'id.png') ?? '').replace(/\.png$/, '');
  if (!OG_TARGET_KINDS.includes(kind as OgTargetKind) || !id)
    throw createError({ statusCode: 404 });
  const file = await ensureOgImage({ kind: kind as OgTargetKind, id });
  if (!file) throw createError({ statusCode: 404 });
  return sendOgImage(event, file);
});
