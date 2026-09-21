import {
  ensureFaviconVariant,
  resolveFaviconSet,
} from '../../thei/media/favicon';
import { sendFaviconFile } from '../../thei/media/favicon-response';

/**
 * `icon.svg` or `icon.png`, whichever the uploaded icon yields. The head links
 * to exactly one of them, with a version in the query.
 */
export default defineEventHandler(async (event) => {
  const variant = getRouterParam(event, 'variant') ?? '';
  const set = await resolveFaviconSet();
  if (variant !== `icon.${set.iconExtension}`)
    throw createError({ statusCode: 404 });
  return sendFaviconFile(event, await ensureFaviconVariant('icon', set));
});
