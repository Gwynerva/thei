import { describe, expect, it } from 'vitest';
import { robotsTxtBody } from '../../shared/robots';

describe('robotsTxtBody', () => {
  it('writes rules for a site at the domain root', () => {
    const body = robotsTxtBody('/', 'https://example.com/sitemap.xml');
    expect(body).toContain('Disallow: /admin/');
    expect(body).toContain('Sitemap: https://example.com/sitemap.xml');
  });

  it('prefixes every rule for a site in a subfolder', () => {
    const body = robotsTxtBody(
      '/diary/',
      'https://example.com/diary/sitemap.xml',
    );
    expect(body).toContain('Disallow: /diary/admin/');
    expect(body).not.toMatch(/Disallow: \/admin\//);
  });
});
