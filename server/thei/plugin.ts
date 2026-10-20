import { flushSessionsBeforeExit } from './admin-session';
import { bootTheiServer } from './boot/process';
import { invalidateOgCardInfo } from './og/cache';
import { invalidateMcpDocuments } from './mcp/documents';
import { invalidateLifeIndex } from './public/life';
import { isContentWriteRequest } from './read-only-request';
import { rememberRequestClient } from './request';
import { markSearchStale } from './search/indexer';
import { invalidateTagRecommendationIndex } from './tag-recommendations';

export default defineNitroPlugin(async (nitroApp) => {
  // Modules that must also load outside a Nuxt build — the scratch directory
  // above all — find the server through the global, as tests provide it.
  // Without it they fell back to the system temp directory, which on a VPS is
  // usually a tmpfs: staged uploads went straight back into RAM.
  (globalThis as { THEI_SERVER?: typeof THEI_SERVER }).THEI_SERVER =
    THEI_SERVER;
  THEI_SERVER.console.log('Server plugin started.');
  // A page's own visitor, before anything runs: what the page fetches of the
  // API while it is rendered stands for them (`requestClient`).
  nitroApp.hooks.hook('request', rememberRequestClient);
  // Every content write goes through the API, so any write drops the indexes
  // built over the content; each is rebuilt lazily by its next reader. The
  // search index catches up in the background, once the writing pauses.
  nitroApp.hooks.hook('afterResponse', (event) => {
    if (!isContentWriteRequest(event)) return;
    markSearchStale();
    invalidateLifeIndex();
    invalidateTagRecommendationIndex();
    invalidateOgCardInfo();
    invalidateMcpDocuments();
  });
  // Admin sessions are written every 30 s. What the last seconds changed is
  // written as the server stops: on Nitro's close, after a stop signal or in a
  // dev reload, and on exit, which an update and the panel's restart reach
  // through `process.exit`.
  nitroApp.hooks.hook('close', flushSessionsBeforeExit);
  process.once('exit', flushSessionsBeforeExit);
  await bootTheiServer();
});
