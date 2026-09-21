import { ensureOgImage } from '../../thei/og/cache';
import { sendOgImage } from '../../thei/og/response';

/** The card for the site itself, shown when the home page is shared. */
export default defineEventHandler(async (event) => {
  const file = await ensureOgImage({ kind: 'site', id: 'site' });
  if (!file) throw createError({ statusCode: 404 });
  return sendOgImage(event, file);
});
