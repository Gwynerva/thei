import { bootTheiServer } from './boot/process';
import { invalidateOgCardInfo } from './og/cache';
import { invalidateLifeIndex } from './public/life';
import { invalidatePublicSearchIndex } from './public/search-index';
import { isContentWriteRequest } from './read-only-request';
import { invalidateTagRecommendationIndex } from './tag-recommendations';

export default defineNitroPlugin(async (nitroApp) => {
  // Modules that must also load outside a Nuxt build — the scratch directory
  // above all — find the server through the global, as tests provide it.
  // Without it they fell back to the system temp directory, which on a VPS is
  // usually a tmpfs: staged uploads went straight back into RAM.
  (globalThis as { THEI_SERVER?: typeof THEI_SERVER }).THEI_SERVER =
    THEI_SERVER;
  THEI_SERVER.console.log('Server plugin started.');
  // Every content write goes through the API, so any write drops the indexes
  // built over the content; each is rebuilt lazily by its next reader.
  nitroApp.hooks.hook('afterResponse', (event) => {
    if (!isContentWriteRequest(event)) return;
    invalidatePublicSearchIndex();
    invalidateLifeIndex();
    invalidateTagRecommendationIndex();
    invalidateOgCardInfo();
  });
  await bootTheiServer();
});
