import { ensureOgImage } from '../../../thei/og/cache';
import { sendOgImage } from '../../../thei/og/response';
import { parseOgTarget } from '../../../thei/og/targets';

export default defineEventHandler(async (event) => {
  const target = parseOgTarget(
    getRouterParam(event, 'kind') ?? '',
    // Nitro names the parameter after the whole segment, `.png` included.
    (getRouterParam(event, 'id.png') ?? '').replace(/\.png$/, ''),
  );
  if (!target) throw createError({ statusCode: 404 });
  const file = await ensureOgImage(target);
  if (!file) throw createError({ statusCode: 404 });
  return sendOgImage(event, file);
});
