import { bootTheiServer } from './boot/process';
import { invalidatePublicSearchIndex } from './public/search-index';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export default defineNitroPlugin(async (nitroApp) => {
  THEI_SERVER.console.log('Server plugin started.');
  // Every content write goes through the API, so any write drops the search
  // index; it is rebuilt lazily by the next search.
  nitroApp.hooks.hook('afterResponse', (event) => {
    if (!READ_METHODS.has(event.method) && event.path.startsWith('/api/'))
      invalidatePublicSearchIndex();
  });
  await bootTheiServer();
});
