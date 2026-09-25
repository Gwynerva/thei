import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  convertExternalLinkFavicon,
  EXTERNAL_LINK_FAVICON_SIZE,
  externalLinkMedia,
  fallbackFaviconTile,
  prepareExternalLinkFavicon,
} from '../../server/thei/external-links/favicon';
import { extractImageAccent } from '../../server/thei/assets/image-color';

describe('external link favicon files', () => {
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
    const hue = (await extractImageAccent(converted))?.hue;
    expect(hue).toBeGreaterThan(220);
    expect(hue).toBeLessThan(280);
  });

  it('cache-busts a refreshed favicon URL', () => {
    expect(externalLinkMedia('key', { hue: 240, chroma: 0.15 }, 123).src).toBe(
      '/media/external-link-favicons/key.webp?v=123',
    );
  });

  it('preserves a neutral favicon accent', async () => {
    const prepared = await prepareExternalLinkFavicon(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="48" height="48" fill="#777"/></svg>',
      ),
    );
    expect(prepared.accent).toEqual({ hue: 0, chroma: 0 });
  });

  it('falls back to the shared tile for a broken favicon, and serves the same tile on its own', async () => {
    const prepared = await prepareExternalLinkFavicon(
      Buffer.from('not an image'),
    );
    const metadata = await sharp(prepared.buffer).metadata();
    expect(metadata).toMatchObject({
      format: 'webp',
      width: EXTERNAL_LINK_FAVICON_SIZE,
      height: EXTERNAL_LINK_FAVICON_SIZE,
    });
    expect(prepared.accent).toBeUndefined();
    expect(prepared.buffer.equals(await fallbackFaviconTile())).toBe(true);
    expect(await fallbackFaviconTile()).toBe(await fallbackFaviconTile());
  });
});
