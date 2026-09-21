import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import { siteUrl, sitePath } from '../thei/site-url';
import { robotsTxtBody } from '#layers/thei/shared/robots';

export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8');

  // Same caveat as the sitemap: the global middleware skips single-segment
  // paths with an extension, so the access check belongs here.
  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private) {
    return 'User-agent: *\nDisallow: /\n';
  }

  return robotsTxtBody(sitePath('/'), siteUrl(event, '/sitemap.xml'));
});
