import type { OgImageInfo } from '#layers/thei/shared/og-url';
import { resolveOgCardInfo } from '../../../thei/og/cache';
import { parseOgTarget } from '../../../thei/og/targets';

/**
 * A page's card, as the page puts it in its head: the address with the
 * card's version, and a description of it for readers who cannot see it.
 *
 * The version is built from exactly what the card will show, so the address
 * changes whenever the picture does and never otherwise. A target without a
 * card — private, or on a closed site — is not found, and its page shows
 * no picture rather than a broken one.
 */
export default defineEventHandler(async (event): Promise<OgImageInfo> => {
  const target = parseOgTarget(
    getRouterParam(event, 'kind') ?? '',
    getRouterParam(event, 'id') ?? '',
  );
  if (!target) throw createError({ statusCode: 404 });
  const info = await resolveOgCardInfo(target);
  if (!info) throw createError({ statusCode: 404 });
  return { url: info.url, alt: info.alt };
});
