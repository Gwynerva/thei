import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const globals = globalThis as Record<string, unknown>;

beforeAll(() => {
  globals.tryUseNuxtApp = () => ({ $config: { app: { baseURL: '/blog/' } } });
});

afterAll(() => {
  delete globals.tryUseNuxtApp;
});

describe('siteCssUrl', () => {
  it('adds the base path a style needs to reach the file', async () => {
    const { siteCssUrl } = await import('../../../app/composables/site-url');
    expect(siteCssUrl('/projects/x/media/action-background/a.webp')).toBe(
      'url("/blog/projects/x/media/action-background/a.webp")',
    );
  });

  it('escapes what would end the quoted address', async () => {
    const { siteCssUrl } = await import('../../../app/composables/site-url');
    expect(siteCssUrl('/a"b\\c\nd.webp')).toBe(
      'url("/blog/a\\"b\\\\c\\\nd.webp")',
    );
  });

  it('leaves an absolute address without the base', async () => {
    const { siteCssUrl } = await import('../../../app/composables/site-url');
    expect(siteCssUrl('https://example.com/icon.png')).toBe(
      'url("https://example.com/icon.png")',
    );
  });
});
