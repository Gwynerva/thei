import { createHash } from 'node:crypto';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import {
  normalizeImageAccent,
  type ImageAccent,
} from '#layers/thei/shared/accent-color';
import type { ExternalLink } from '#layers/thei/shared/external-link';
import { iconSymbols } from '#thei/icon-symbols';
import { extractImageAccent } from '../assets/image-color';
import { svgDensityFor } from '../assets/svg-density';
import { svgBufferForRaster } from '../assets/svg-raster-input';
import { THEI_CONTENT_DIRS } from '../content-layout';
import { decodeIco, isIco } from './ico';

export const EXTERNAL_LINK_FAVICON_SIZE = 48;
export const EXTERNAL_LINK_FAVICON_QUALITY = 80;
/**
 * WebP, not AVIF, and deliberately so. At 48px AVIF's container overhead makes
 * the file larger rather than smaller, and its lossy alpha plane leaves a faint
 * haze across what should be fully transparent padding around an icon.
 */
export const EXTERNAL_LINK_FAVICON_EXTENSION = 'webp';

export function externalLinkFaviconDir() {
  return THEI_SERVER.contentPath(THEI_CONTENT_DIRS.externalLinkFavicons);
}

export function externalLinkFaviconPath(key: string) {
  return join(
    externalLinkFaviconDir(),
    `${key}.${EXTERNAL_LINK_FAVICON_EXTENSION}`,
  );
}

/**
 * The address of a stored icon. The file is named after its own bytes, so
 * the address changes exactly when the icon does and needs no version.
 */
export function externalLinkMedia(
  faviconKey: string,
  accent: ImageAccent | undefined,
): ExternalLink['faviconMedia'] {
  const src = `/media/external-link-favicons/${faviconKey}.${EXTERNAL_LINK_FAVICON_EXTENSION}`;
  return {
    src,
    previewSrc: src,
    kind: 'image',
    ...(accent === undefined ? {} : { accent }),
    width: EXTERNAL_LINK_FAVICON_SIZE,
    height: EXTERNAL_LINK_FAVICON_SIZE,
  };
}

let filesLock: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` alone among the others given here. Icon files are shared by
 * every link whose icon is the same, so storing one and pointing a row at
 * it has to happen as one step with respect to the sweep; otherwise the
 * sweep could take a file between the two, just as a new link claims it.
 */
export function withExternalLinkFavicons<T>(
  task: () => Promise<T> | T,
): Promise<T> {
  const result = filesLock.then(task);
  filesLock = result.catch(() => {});
  return result;
}

/**
 * Stores a prepared icon under the hash of its bytes and says which it is.
 * Links with the same icon share one file, which is written only once;
 * call it inside `withExternalLinkFavicons`, together with the row that
 * will point at the file.
 */
export async function storeExternalLinkFavicon(
  prepared: PreparedExternalLinkFavicon,
) {
  const faviconKey = createHash('sha256').update(prepared.buffer).digest('hex');
  await writeExternalLinkFaviconFile(faviconKey, prepared.buffer);
  return { faviconKey, accent: prepared.accent };
}

export type PreparedExternalLinkFavicon = Awaited<
  ReturnType<typeof prepareExternalLinkFavicon>
>;

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

/**
 * A file named after its content is never replaced: one that is already
 * there holds these very bytes.
 */
async function writeExternalLinkFaviconFile(
  faviconKey: string,
  buffer: Buffer,
) {
  const path = externalLinkFaviconPath(faviconKey);
  if (await fileExists(path)) return;
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, buffer);
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    if (!(await fileExists(path))) throw error;
  }
}

function fileExists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

export async function convertExternalLinkFavicon(source: Buffer) {
  const image = await openFavicon(source);
  return await image
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

/** The icon opened for sharp, whatever format the site keeps it in. */
async function openFavicon(source: Buffer) {
  if (isIco(source)) {
    const image = decodeIco(source, EXTERNAL_LINK_FAVICON_SIZE);
    return image.kind === 'png'
      ? sharp(image.data, { failOn: 'error' })
      : sharp(image.data, {
          raw: { width: image.width, height: image.height, channels: 4 },
        });
  }
  // A site's SVG icon is drawn at the tile's size, not at its own units,
  // which for many icons are 16 px and would come out blurred.
  const density = await svgDensityFor(source, EXTERNAL_LINK_FAVICON_SIZE);
  return sharp(svgBufferForRaster(source), { failOn: 'error', density });
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
