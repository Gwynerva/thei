import { bootTheiServer } from './boot/process';
import { invalidatePublicSearchIndex } from './public/search-index';
import { isContentWriteRequest } from './read-only-request';

export default defineNitroPlugin(async (nitroApp) => {
  // Modules that must also load outside a Nuxt build — the scratch directory
  // above all — find the server through the global, as tests provide it.
  // Without it they fell back to the system temp directory, which on a VPS is
  // usually a tmpfs: staged uploads went straight back into RAM.
  (globalThis as { THEI_SERVER?: typeof THEI_SERVER }).THEI_SERVER =
    THEI_SERVER;
  THEI_SERVER.console.log('Server plugin started.');
  // Every content write goes through the API, so any write drops the search
  // index; it is rebuilt lazily by the next search.
  nitroApp.hooks.hook('afterResponse', (event) => {
    if (isContentWriteRequest(event)) invalidatePublicSearchIndex();
  });
  await bootTheiServer();
});
