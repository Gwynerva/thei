import {
  ensureFaviconVariant,
  resolveFaviconSet,
  type FaviconVariant,
} from '../../../thei/media/favicon';
import { sendFaviconFile } from '../../../thei/media/favicon-response';

const variants: Record<string, FaviconVariant> = {
  'favicon.ico': 'ico',
  'icon.svg': 'icon',
  'apple-touch-icon.png': 'apple',
};

/**
 * Thei's own icon set, worn by the engine's pages — the admin, the installer,
 * the update screen and sign-in — so they never pass for the site itself.
 */
export default defineEventHandler(async (event) => {
  const variant = variants[getRouterParam(event, 'file') ?? ''];
  if (!variant) throw createError({ statusCode: 404 });
  const set = await resolveFaviconSet('thei');
  return sendFaviconFile(event, await ensureFaviconVariant(variant, set));
});
