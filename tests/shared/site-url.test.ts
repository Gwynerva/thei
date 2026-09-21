import { describe, expect, it } from 'vitest';
import {
  normalizeBasePath,
  normalizeSiteUrl,
  resolveSiteUrl,
  siteUrlBasePath,
  siteUrlOrigin,
  withSiteBase,
  withoutSiteBase,
} from '../../shared/site-url';

describe('normalizeSiteUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['https://example.com/', 'https://example.com'],
    ['  http://example.com:8080  ', 'http://example.com:8080'],
    ['https://blog.example.com', 'https://blog.example.com'],
    ['https://example.com/diary', 'https://example.com/diary'],
    ['https://example.com/diary/', 'https://example.com/diary'],
    ['https://example.com/a/b', 'https://example.com/a/b'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeSiteUrl(input)).toBe(expected);
  });

  it('treats an empty field as "derive it from the request"', () => {
    expect(normalizeSiteUrl('')).toBe('');
    expect(normalizeSiteUrl('   ')).toBe('');
  });

  it.each([
    ['example.com'],
    ['ftp://example.com'],
    ['javascript:alert(1)'],
    ['https://user:pass@example.com'],
    ['https://example.com/?utm=1'],
    ['https://example.com/#top'],
    ['https://example.com/a b'],
    ['not a url'],
  ])('rejects %s', (input) => {
    expect(normalizeSiteUrl(input)).toBeUndefined();
  });
});

describe('base paths', () => {
  it('splits an address into an origin and a base path', () => {
    expect(siteUrlOrigin('https://example.com/diary')).toBe(
      'https://example.com',
    );
    expect(siteUrlOrigin('')).toBe('');
    expect(siteUrlBasePath('https://example.com/diary')).toBe('/diary/');
    expect(siteUrlBasePath('https://example.com')).toBe('/');
    expect(siteUrlBasePath('')).toBe('/');
  });

  it.each([
    ['diary', '/diary/'],
    ['/diary', '/diary/'],
    ['/diary/', '/diary/'],
    ['', '/'],
    ['/', '/'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });

  it('adds and removes the base path', () => {
    expect(withSiteBase('/projects/', '/diary/')).toBe('/diary/projects/');
    expect(withSiteBase('/', '/diary/')).toBe('/diary/');
    expect(withSiteBase('/projects/', '/')).toBe('/projects/');
    expect(withoutSiteBase('/diary/projects/', '/diary/')).toBe('/projects/');
    expect(withoutSiteBase('/diary', '/diary/')).toBe('/');
    expect(withoutSiteBase('/diary/', '/diary/')).toBe('/');
    expect(withoutSiteBase('/projects/', '/')).toBe('/projects/');
    // A path that never carried the base is left alone.
    expect(withoutSiteBase('/other/', '/diary/')).toBe('/other/');
  });
});

describe('resolveSiteUrl', () => {
  it.each([
    ['https://example.com', '/', 'https://example.com/'],
    ['https://example.com', '/projects/', 'https://example.com/projects/'],
    [
      'https://example.com',
      '/tags/a-b/?page=2',
      'https://example.com/tags/a-b/?page=2',
    ],
    // A base carrying a path keeps it, which `new URL(path, base)` would not.
    [
      'https://example.com/blog',
      '/projects/',
      'https://example.com/blog/projects/',
    ],
  ])('joins %s and %s', (base, path, expected) => {
    expect(resolveSiteUrl(base, path)).toBe(expected);
  });
});
