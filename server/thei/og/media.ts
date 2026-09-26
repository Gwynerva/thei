import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { AssetType } from '#layers/thei/shared/asset';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { assetFilePath } from '../assets/file-path';
import { svgDensityFor } from '../assets/svg-density';
import {
  ensureGeneratedIcon,
  GENERATED_ICON_EXTENSION,
  isGeneratedIconKind,
} from '../media/generated-icon';

/**
 * Turning what a page shows into pixels the card can use.
 *
 * Everything public is addressed by URL rather than by file, so a card starts
 * from the same `MediaDescriptor` the page renders and walks back to the bytes
 * behind it. A video's poster frame is used in place of the video, since a
 * card is a still image.
 */
const GENERATED_ICON_PATTERN =
  /^\/media\/generated-icons\/([a-z-]+)\/([a-f0-9]{64})\./;

export async function resolveMediaFile(
  media: MediaDescriptor | undefined,
): Promise<string | undefined> {
  if (!media?.src) return undefined;
  const generated = GENERATED_ICON_PATTERN.exec(media.src);
  if (generated) {
    const [, kind, key] = generated;
    if (!isGeneratedIconKind(kind)) return undefined;
    const file = await ensureGeneratedIcon(kind, key!).catch(() => undefined);
    return file?.filePath;
  }
  // Every other public media URL ends in the asset's own slug.
  const name = media.src.split('?')[0]!.split('/').pop() ?? '';
  const slug = name.slice(0, name.lastIndexOf('.'));
  if (!slug) return undefined;
  const asset = await THEI_SERVER.assets.findBySlug(slug);
  if (!asset) return undefined;
  if (asset.type === AssetType.Video) {
    const preview = (
      await THEI_SERVER.assets.usages.findByContainer('asset', asset.assetUuid)
    ).find((usage) => usage.role === 'preview')?.asset;
    if (!preview) return undefined;
    return assetFilePath(preview.contentHash, preview.extension);
  }
  if (asset.type !== AssetType.Image) return undefined;
  return assetFilePath(asset.contentHash, asset.extension);
}

/**
 * A PNG data URI at the size the card draws it.
 *
 * Satori reads PNG, JPEG and SVG, and nothing else — AVIF and WebP, which is
 * what the library mostly holds, have to be decoded first. Sharp does that and
 * the resize in one pass.
 */
export async function mediaDataUri(
  filePath: string | undefined,
  options: { width: number; height: number; fit?: 'cover' | 'contain' },
): Promise<string | undefined> {
  if (!filePath) return undefined;
  // An SVG is drawn at the size the card shows it; anything else needs no
  // density at all.
  const density = await svgDensityFor(
    filePath,
    Math.max(options.width, options.height),
  );
  const buffer = await sharp(filePath, { density })
    .resize(options.width, options.height, {
      fit: options.fit ?? 'cover',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 6 })
    .toBuffer()
    .catch(() => undefined);
  if (!buffer) return undefined;
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/**
 * One of the engine's own icons, recoloured for the card.
 *
 * Used where an entity has no artwork: a plate in its colour with the icon of
 * what it is still says more than an empty rectangle.
 */
export async function glyphDataUri(
  icon: string,
  color: string,
): Promise<string | undefined> {
  if (!/^[a-z0-9-]+$/.test(icon)) return undefined;
  const source = await readFile(
    THEI_SERVER.theiPath('app', 'assets', 'icons', `${icon}.svg`),
    'utf8',
  ).catch(() => undefined);
  if (!source) return undefined;
  const svg = source
    .replace(/fill="[^"]*"/g, `fill="${color}"`)
    .replace(/<svg /, `<svg fill="${color}" `);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export const OG_GENERATED_ICON_EXTENSION = GENERATED_ICON_EXTENSION;
