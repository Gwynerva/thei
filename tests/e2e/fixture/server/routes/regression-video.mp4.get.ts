import { join } from 'node:path';
import { sendAssetFile } from '#layers/thei/server/thei/assets/send-file';

// Sent the way the site sends its own assets: a production build serves
// public/ without byte ranges, and a video that cannot seek fails the tests
// for a reason no real page has.
export default defineEventHandler((event) =>
  sendAssetFile(
    event,
    join(useRuntimeConfig().fixtureMedia, 'regression-video.mp4'),
    'mp4',
    { cacheControl: 'no-store' },
  ),
);
