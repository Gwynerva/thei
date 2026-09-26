import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { THEI_CONTENT_DIRS } from '../content-layout';
import { getProfile } from '../profile';
import { assetFilePath } from '../assets/file-path';
import { svgDensityFor } from '../assets/svg-density';

/**
 * The set of icons a site needs in 2026, and no more.
 *
 * - `favicon.ico` with 16, 32 and 48 px frames. Browsers ask for it by
 *   themselves, feed readers and old bookmarks still use it, and 48 px is what
 *   Google wants for the icon beside a search result.
 * - `icon.svg` when the uploaded file is an SVG, so the tab icon stays sharp at
 *   any scale; otherwise a 192 px PNG, which is also the minimum Yandex will
 *   show in its results.
 * - `apple-touch-icon.png`, 180 px and **opaque**: iOS paints transparency
 *   black, so the icon is centred on a plate tinted from its own colour.
 *
 * No web manifest: Thei is a site, not an installable app, and a manifest
 * exists to make one installable.
 */
export const FAVICON_SIZES = { ico: [16, 32, 48], png: 192, apple: 180 };

/** Apple's icon is padded, so the artwork is not clipped by the rounded mask. */
const APPLE_PADDING = 0.12;

/** How bright the plate behind the touch icon is allowed to get, out of 255. */
const PLATE_LUMINANCE = 56;

export type FaviconVariant = 'ico' | 'icon' | 'apple';

export interface FaviconSource {
  /** Content hash of the icon the set is drawn from, uploaded or shipped. */
  key: string;
  extension: string;
  filePath: string;
  isSvg: boolean;
}

/** Everything the head needs: which files exist and the version they are at. */
export interface FaviconSet {
  source: FaviconSource;
  /** `icon.svg` when the source is an SVG, `icon.png` otherwise. */
  iconExtension: 'svg' | 'png';
  version: string;
}

/**
 * Whose icon a page wears: the site's own on public pages, Thei's on the
 * engine's — the admin, the installer, the update screen and sign-in.
 */
export type FaviconOwner = 'site' | 'thei';

export async function resolveFaviconSource(
  owner: FaviconOwner = 'site',
): Promise<FaviconSource> {
  if (owner === 'site') {
    // Before installation there is no profile to read, and the installer's
    // tab still deserves an icon: the shipped one stands in.
    let assetUuid: string | null = null;
    try {
      assetUuid = getProfile().faviconAssetUuid;
    } catch {}
    if (assetUuid) {
      const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
      if (asset)
        return {
          key: asset.contentHash,
          extension: asset.extension,
          filePath: assetFilePath(asset.contentHash, asset.extension),
          isSvg: asset.extension === 'svg',
        };
    }
  }
  return theiFaviconSource();
}

let theiSource: Promise<FaviconSource> | undefined;

/**
 * The icon Thei ships with, keyed by its bytes like an upload is, so a release
 * that redraws it is fetched anew rather than served from yesterday's cache.
 */
function theiFaviconSource() {
  theiSource ??= loadTheiFaviconSource().catch((error) => {
    theiSource = undefined;
    throw error;
  });
  return theiSource;
}

async function loadTheiFaviconSource(): Promise<FaviconSource> {
  const filePath = THEI_SERVER.theiPath('public', 'favicon.svg');
  const bytes = await readFile(filePath);
  return {
    key: createHash('sha256').update(bytes).digest('hex'),
    extension: 'svg',
    filePath,
    isSvg: true,
  };
}

export async function resolveFaviconSet(
  owner: FaviconOwner = 'site',
): Promise<FaviconSet> {
  const source = await resolveFaviconSource(owner);
  return {
    source,
    iconExtension: source.isSvg ? 'svg' : 'png',
    // Short, and derived only from the bytes the icons are made of: a new
    // upload changes it, so browsers and search engines fetch the new icon
    // instead of the one they cached.
    version: createHash('sha256').update(source.key).digest('hex').slice(0, 12),
  };
}

function faviconDirectory(key: string) {
  return THEI_SERVER.contentPath(
    THEI_CONTENT_DIRS.generatedMedia,
    'favicon',
    key,
  );
}

function variantFileName(variant: FaviconVariant, set: FaviconSet) {
  if (variant === 'ico') return 'favicon.ico';
  if (variant === 'apple') return 'apple-touch-icon.png';
  return `icon.${set.iconExtension}`;
}

/**
 * The derived icon, built once and kept in `generated-media`.
 *
 * These are not library assets: nothing else uses them, they are reproducible
 * from the uploaded icon, and they have no business in backups. The template
 * lives in a sidecar signature rather than in the path, so redrawing them is a
 * matter of the file no longer matching, not of new paths appearing.
 */
export async function ensureFaviconVariant(
  variant: FaviconVariant,
  set: FaviconSet,
): Promise<{ filePath: string; etag: string; contentType: string }> {
  const directory = faviconDirectory(set.source.key);
  const filePath = join(directory, variantFileName(variant, set));
  const signaturePath = `${filePath}.signature`;
  const signature = faviconTemplateSignature();
  const contentType =
    variant === 'ico'
      ? 'image/x-icon'
      : variant === 'icon' && set.iconExtension === 'svg'
        ? 'image/svg+xml'
        : 'image/png';
  const etag = `"${createHash('sha256')
    .update(`${set.source.key}:${variant}:${signature}`)
    .digest('hex')}"`;

  const [exists, storedSignature] = await Promise.all([
    stat(filePath)
      .then(() => true)
      .catch(() => false),
    readFile(signaturePath, 'utf8').catch(() => ''),
  ]);
  if (exists && storedSignature === signature)
    return { filePath, etag, contentType };

  const buffer = await renderFaviconVariant(variant, set);
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, buffer);
  await rename(tempPath, filePath).catch(async (error) => {
    await rm(tempPath, { force: true }).catch(() => {});
    const written = await stat(filePath)
      .then(() => true)
      .catch(() => false);
    if (!written) throw error;
  });
  await writeFile(signaturePath, signature, 'utf8');
  return { filePath, etag, contentType };
}

async function renderFaviconVariant(
  variant: FaviconVariant,
  set: FaviconSet,
): Promise<Buffer> {
  if (variant === 'icon' && set.iconExtension === 'svg')
    return readFile(set.source.filePath);
  if (variant === 'icon') return renderSquarePng(set.source, FAVICON_SIZES.png);
  if (variant === 'ico') {
    const frames = await Promise.all(
      FAVICON_SIZES.ico.map((size) => renderSquarePng(set.source, size)),
    );
    return packIco(frames, FAVICON_SIZES.ico);
  }
  return renderAppleTouchIcon(set.source);
}

/**
 * The artwork on a transparent square. An SVG is drawn at the icon's own
 * size — at librsvg's default 72 dpi a small drawing would be blurred at
 * anything larger, and a fixed high density would turn a large drawing into
 * a raster too big to hold.
 */
async function loadSquare(source: FaviconSource, size: number) {
  const density = source.isSvg
    ? await svgDensityFor(source.filePath, size)
    : undefined;
  return sharp(source.filePath, { density }).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
}

async function renderSquarePng(source: FaviconSource, size: number) {
  return (await loadSquare(source, size))
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The touch icon: the artwork, padded, on an opaque plate.
 *
 * The plate is tinted from the icon's own dominant colour and kept dark, so
 * light artwork stays visible and the tile does not glare on a home screen in
 * either theme.
 */
async function renderAppleTouchIcon(source: FaviconSource): Promise<Buffer> {
  const size = FAVICON_SIZES.apple;
  const inner = Math.round(size * (1 - APPLE_PADDING * 2));
  const [artwork, background] = await Promise.all([
    loadSquare(source, inner).then((square) => square.png().toBuffer()),
    faviconPlateColor(source),
  ]);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: artwork, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The plate colour: the icon's own dominant colour, darkened.
 *
 * Keeping the colour and only lowering its brightness means the tile still
 * looks like the icon, while artwork of any lightness stays legible on it.
 */
async function faviconPlateColor(source: FaviconSource) {
  const stats = await sharp(source.filePath, {
    density: source.isSvg
      ? await svgDensityFor(source.filePath, 32)
      : undefined,
  })
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .stats()
    .catch(() => undefined);
  const dominant = stats?.dominant;
  if (!dominant) return { r: 24, g: 24, b: 27, alpha: 1 };
  const luminance =
    0.2126 * dominant.r + 0.7152 * dominant.g + 0.0722 * dominant.b;
  const factor = luminance > 0 ? Math.min(1, PLATE_LUMINANCE / luminance) : 1;
  return {
    r: Math.round(dominant.r * factor),
    g: Math.round(dominant.g * factor),
    b: Math.round(dominant.b * factor),
    alpha: 1,
  };
}

function faviconTemplateSignature() {
  return createHash('sha256')
    .update(
      [
        JSON.stringify(FAVICON_SIZES),
        String(APPLE_PADDING),
        String(PLATE_LUMINANCE),
        renderFaviconVariant.toString(),
        loadSquare.toString(),
        renderSquarePng.toString(),
        renderAppleTouchIcon.toString(),
        packIco.toString(),
        faviconPlateColor.toString(),
      ].join(':'),
    )
    .digest('hex');
}

/**
 * Wraps PNG frames in an ICO container.
 *
 * sharp cannot write ICO, and the format needs nothing more than this: a
 * six-byte header, one sixteen-byte directory entry per frame, and the PNG
 * bytes themselves, which every browser since Vista reads inside an ICO.
 */
export function packIco(frames: Buffer[], sizes: number[]): Buffer {
  const count = frames.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const directory = Buffer.alloc(16 * count);
  let offset = header.length + directory.length;
  frames.forEach((frame, index) => {
    const size = sizes[index]!;
    const entry = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, entry); // width
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height
    directory.writeUInt8(0, entry + 2); // palette size
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(frame.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });

  return Buffer.concat([header, directory, ...frames]);
}
