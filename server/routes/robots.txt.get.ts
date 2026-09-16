import { SiteAccessLevel } from '#layers/thei/shared/access-level';
import { siteUrl } from '../thei/site-url';

const DISALLOWED = [
  '/sign-in/',
  '/sign-out/',
  '/admin/',
  '/install/',
  '/update/',
  '/test/',
  '/api/',
];

export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8');

  // Same caveat as the sitemap: the global middleware skips single-segment
  // paths with an extension, so the access check belongs here.
  if (THEI_SERVER.config.siteAccessLevel === SiteAccessLevel.Private) {
    return 'User-agent: *\nDisallow: /\n';
  }

  const sitemap = siteUrl(event, '/sitemap.xml');
  return `User-agent: *\n${DISALLOWED.map((path) => `Disallow: ${path}`).join('\n')}\n\nSitemap: ${sitemap}\n`;
});
