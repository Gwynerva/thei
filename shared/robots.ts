/**
 * Paths crawlers have no business in. They are site paths, so the base path of
 * a site served from a subfolder is added when the file is written.
 */
export const ROBOTS_DISALLOWED = [
  '/sign-in/',
  '/sign-out/',
  '/admin/',
  '/install/',
  '/update/',
  '/test/',
  '/api/',
  '/share/',
];

/**
 * The body of `robots.txt`.
 *
 * Shared with the settings page: a site served from a subfolder cannot publish
 * a `robots.txt` crawlers will read — they only ever fetch the one at the
 * domain root — so the panel shows this same text for the operator to paste
 * into the root file of whatever serves the domain.
 */
export function robotsTxtBody(basePath: string, sitemapUrl: string): string {
  const prefix = basePath.replace(/\/$/, '');
  const rules = ROBOTS_DISALLOWED.map(
    (path) => `Disallow: ${prefix}${path}`,
  ).join('\n');
  return `User-agent: *\n${rules}\n\nSitemap: ${sitemapUrl}\n`;
}
