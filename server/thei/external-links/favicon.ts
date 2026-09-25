import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import {
  normalizeImageAccent,
  type ImageAccent,
} from '#layers/thei/shared/accent-color';
import type { ExternalLink } from '#layers/thei/shared/external-link';
import { iconSymbols } from '#thei/icon-symbols';
import { extractImageAccent } from '../assets/image-color';
import { THEI_CONTENT_DIRS } from '../content-layout';

export const EXTERNAL_LINK_FAVICON_SIZE = 48;
export const EXTERNAL_LINK_FAVICON_QUALITY = 80;
/**
 * WebP, not AVIF, and deliberately so. At 48px AVIF's container overhead makes
 * the file larger rather than smaller, and its lossy alpha plane leaves a faint
 * haze across what should be fully transparent padding around an icon.
 */
export const EXTERNAL_LINK_FAVICON_EXTENSION = 'webp';

export function externalLinkKey(url: string) {
  return createHash('sha256').update(url).digest('hex');
}

export function externalLinkFaviconDir() {
  return THEI_SERVER.contentPath(THEI_CONTENT_DIRS.externalLinkFavicons);
}

export function externalLinkFaviconPath(key: string) {
  return join(
    externalLinkFaviconDir(),
    `${key}.${EXTERNAL_LINK_FAVICON_EXTENSION}`,
  );
}

export function externalLinkMedia(
  faviconKey: string,
  accent: ImageAccent | undefined,
  touchedAt?: number,
): ExternalLink['faviconMedia'] {
  const version = touchedAt ? `?v=${touchedAt}` : '';
  const src = `/media/external-link-favicons/${faviconKey}.${EXTERNAL_LINK_FAVICON_EXTENSION}${version}`;
  return {
    src,
    previewSrc: src,
    kind: 'image',
    ...(accent === undefined ? {} : { accent }),
    width: EXTERNAL_LINK_FAVICON_SIZE,
    height: EXTERNAL_LINK_FAVICON_SIZE,
  };
}

export async function writeExternalLinkFavicon(url: string, source?: Buffer) {
  const faviconKey = externalLinkKey(url);
  const { buffer, accent } = await prepareExternalLinkFavicon(source);
  await writeExternalLinkFaviconFile(faviconKey, buffer);
  return { faviconKey, accent };
}

/**
 * The stored form of an icon: the tile size, WebP, with its accent read
 * off it. Anything that cannot be read as an image gets the neutral tile.
 */
export async function prepareExternalLinkFavicon(source?: Buffer) {
  let accent: ImageAccent | undefined;
  let buffer: Buffer;
  try {
    if (!source) throw new Error('Missing favicon');
    buffer = await convertExternalLinkFavicon(source);
    accent = await extractImageAccent(buffer);
  } catch {
    accent = undefined;
    buffer = await fallbackFaviconTile();
  }
  accent = normalizeImageAccent(accent);
  return { buffer, accent };
}

async function writeExternalLinkFaviconFile(
  faviconKey: string,
  buffer: Buffer,
) {
  const path = externalLinkFaviconPath(faviconKey);
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, buffer);
  await rename(temporaryPath, path).catch(async (error) => {
    const destinationExists = await readFile(path)
      .then(() => true)
      .catch(() => false);
    if (!destinationExists) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
    try {
      await rm(path, { force: true });
      await rename(temporaryPath, path);
    } catch (replaceError) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      throw replaceError;
    }
  });
}

export async function convertExternalLinkFavicon(source: Buffer) {
  return await sharp(source, { failOn: 'error' })
    .resize(EXTERNAL_LINK_FAVICON_SIZE, EXTERNAL_LINK_FAVICON_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .webp({
      quality: EXTERNAL_LINK_FAVICON_QUALITY,
      alphaQuality: 100,
      effort: 6,
    })
    .toBuffer();
}

let fallbackTile: Promise<Buffer> | undefined;

/**
 * The tile a link without an icon of its own gets, rendered once. It also
 * stands in for a stored file that has gone missing.
 */
export function fallbackFaviconTile(): Promise<Buffer> {
  fallbackTile ??= sharp(Buffer.from(fallbackSvg()))
    .resize(EXTERNAL_LINK_FAVICON_SIZE, EXTERNAL_LINK_FAVICON_SIZE)
    .webp({ quality: EXTERNAL_LINK_FAVICON_QUALITY, effort: 6 })
    .toBuffer()
    .catch((error) => {
      fallbackTile = undefined;
      throw error;
    });
  return fallbackTile;
}

/** The interface's own external-link icon on a neutral tile. */
function fallbackSvg() {
  const icon = iconSymbols['external-link'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 960">
    <rect width="960" height="960" rx="200" fill="#52525b"/>
    <svg width="960" height="960" viewBox="${icon?.viewBox ?? '0 0 24 24'}">
      <g fill="#e4e4e7">${(icon?.body ?? '').replaceAll('currentColor', '#e4e4e7')}</g>
    </svg>
  </svg>`;
}
