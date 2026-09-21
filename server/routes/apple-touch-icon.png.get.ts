import { ensureFaviconVariant, resolveFaviconSet } from '../thei/media/favicon';
import { sendFaviconFile } from '../thei/media/favicon-response';

/** iOS looks for this name at the root before reading the page's head. */
export default defineEventHandler(async (event) => {
  const set = await resolveFaviconSet();
  return sendFaviconFile(event, await ensureFaviconVariant('apple', set));
});
