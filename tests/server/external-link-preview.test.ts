import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  discoverFavicons,
  externalLinkFaviconCandidates,
  googleFaviconUrl,
  isReservedAddress,
} from '../../server/thei/external-links/preview';
import {
  convertExternalLinkFavicon,
  EXTERNAL_LINK_FAVICON_SIZE,
  externalLinkMedia,
  externalLinkPreviewMedia,
  prepareExternalLinkFavicon,
} from '../../server/thei/external-links/repository';
import { extractImageAccentHue } from '../../server/thei/assets/image-color';

describe('external link SSRF protection', () => {
  it.each([
    '127.0.0.1',
    '10.2.3.4',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
    'fe80::1',
  ])('rejects reserved address %s', (address) => {
    expect(isReservedAddress(address)).toBe(true);
  });

  it.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => {
      expect(isReservedAddress(address)).toBe(false);
    },
  );
});

describe('external link favicon discovery and conversion', () => {
  it('builds a keyless Google favicon fallback for the exact page URL', () => {
    const url = new URL(
      googleFaviconUrl('https://radkopeter.ru/projects/dodem/'),
    );
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://www.google.com/s2/favicons',
    );
    expect(url.searchParams.get('domain_url')).toBe(
      'https://radkopeter.ru/projects/dodem/',
    );
    expect(url.searchParams.get('sz')).toBe('64');
  });

  it('keeps page-specific icons ahead of root and exact-URL fallbacks', () => {
    const pageUrl = 'https://example.com/products/item?variant=2#details';
    expect(
      externalLinkFaviconCandidates(
        [
          'https://cdn.example.com/item.svg',
          'https://cdn.example.com/item-48.png',
          'https://cdn.example.com/item-32.png',
          'https://cdn.example.com/ignored.png',
        ],
        pageUrl,
      ),
    ).toEqual([
      'https://cdn.example.com/item.svg',
      'https://cdn.example.com/item-48.png',
      'https://example.com/favicon.ico',
      'https://example.com/favicon.svg',
      googleFaviconUrl(pageUrl),
    ]);
  });

  it('discovers and prioritizes declared relative favicon variants', async () => {
    const icons = await discoverFavicons({
      url: 'https://example.com/some/page',
      headers: {},
      data: `<html><head>
        <link rel="icon" sizes="32x32" href="/icon-32.png">
        <link rel="shortcut icon" sizes="48x48" href="/icon-48.png">
        <link rel="icon" sizes="any" href="/icon.svg">
        <link rel="apple-touch-icon" href="/apple.png">
        <meta name="msapplication-TileImage" content="/tile.png">
      </head></html>`,
    });
    expect(icons[0]).toBe('https://example.com/icon-48.png');
    expect(icons).toContain('https://example.com/icon.svg');
    expect(icons).toContain('https://example.com/apple.png');
    expect(icons).toContain('https://example.com/tile.png');
  });

  it('converts SVG to 48px WebP and preserves transparency', async () => {
    const source = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12">
        <circle cx="12" cy="6" r="5" fill="red"/>
      </svg>`,
    );
    const converted = await convertExternalLinkFavicon(source);
    const metadata = await sharp(converted).metadata();
    expect(metadata).toMatchObject({
      format: 'webp',
      width: EXTERNAL_LINK_FAVICON_SIZE,
      height: EXTERNAL_LINK_FAVICON_SIZE,
      hasAlpha: true,
    });
    const pixels = await sharp(converted).ensureAlpha().raw().toBuffer();
    expect(pixels[3]).toBe(0);
    const center =
      ((EXTERNAL_LINK_FAVICON_SIZE / 2) * EXTERNAL_LINK_FAVICON_SIZE +
        EXTERNAL_LINK_FAVICON_SIZE / 2) *
        4 +
      3;
    expect(pixels[center]).toBeGreaterThan(0);
  });

  it('extracts the visible brand color instead of transparent padding', async () => {
    const source = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48">
        <circle cx="24" cy="24" r="12" fill="#168de2"/>
      </svg>`,
    );
    const converted = await convertExternalLinkFavicon(source);
    const hue = await extractImageAccentHue(converted);
    expect(hue).toBeGreaterThan(220);
    expect(hue).toBeLessThan(280);
  });

  it('cache-busts a refreshed favicon URL', () => {
    expect(externalLinkMedia('key', 240, 123).src).toBe(
      '/media/external-link-favicons/key.webp?v=123',
    );
  });

  it('omits accent hue for a neutral favicon', async () => {
    const prepared = await prepareExternalLinkFavicon(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" fill="#777"/></svg>',
      ),
    );
    expect(prepared.accentHue).toBeUndefined();
    expect(
      externalLinkPreviewMedia(prepared.buffer, prepared.accentHue),
    ).not.toHaveProperty('accentHue');
  });

  it('uses an inline preview favicon without writing a permanent file', async () => {
    const prepared = await prepareExternalLinkFavicon(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="red"/></svg>',
      ),
    );
    const media = externalLinkPreviewMedia(prepared.buffer, prepared.accentHue);
    expect(media.src).toMatch(/^data:image\/webp;base64,/);
    expect(media.accentHue).toBeGreaterThanOrEqual(0);
    expect(media.accentHue).toBeLessThan(360);
  });

  it('creates the shared external-link fallback for a broken favicon', async () => {
    const prepared = await prepareExternalLinkFavicon(
      Buffer.from('not an image'),
    );
    const metadata = await sharp(prepared.buffer).metadata();
    expect(metadata).toMatchObject({
      format: 'webp',
      width: EXTERNAL_LINK_FAVICON_SIZE,
      height: EXTERNAL_LINK_FAVICON_SIZE,
    });
    expect(prepared.accentHue).toBeUndefined();
  });
});
