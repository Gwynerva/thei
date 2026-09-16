import { describe, expect, it } from 'vitest';
import { normalizeSiteUrl, resolveSiteUrl } from '../../shared/site-url';

describe('normalizeSiteUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['https://example.com/', 'https://example.com'],
    ['  http://example.com:8080  ', 'http://example.com:8080'],
    ['https://blog.example.com', 'https://blog.example.com'],
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
    ['https://example.com/blog'],
    ['https://example.com/?utm=1'],
    ['https://example.com/#top'],
    ['not a url'],
  ])('rejects %s', (input) => {
    expect(normalizeSiteUrl(input)).toBeUndefined();
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
