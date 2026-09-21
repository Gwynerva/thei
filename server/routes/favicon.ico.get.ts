import { ensureFaviconVariant, resolveFaviconSet } from '../thei/media/favicon';
import { sendFaviconFile } from '../thei/media/favicon-response';

/**
 * The address browsers try on their own, before they have parsed any markup.
 * A site in a subfolder is still asked for `<base>/favicon.ico` once the page
 * declares it, which the head does.
 */
export default defineEventHandler(async (event) => {
  const set = await resolveFaviconSet();
  return sendFaviconFile(event, await ensureFaviconVariant('ico', set));
});
