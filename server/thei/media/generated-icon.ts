import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { THEI_CONTENT_DIRS } from '../content-layout';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { oklchToHex } from '#layers/thei/shared/accent-color';
import { stringColorHue } from '#layers/thei/shared/utils/string-color';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { IconSymbol } from '#layers/thei/shared/icon-svg';
import { iconSymbols } from '#thei/icon-symbols';

export const GENERATED_ICON_EXTENSION = 'avif';

/**
 * Every kind of thing that gets a drawn picture when it has none of its own.
 *
 * Projects and pages stand in for a missing icon; events, stages, sections
 * and diary entries for a body that opens without a picture. They all get the
 * same drawing — their kind's icon, dark, on a field of their own accent — so
 * a card, a tile or a link without a picture looks the same whatever it is.
 */
export const GENERATED_ICON_KINDS = [
  'project',
  'page',
  'event',
  'project-stage',
  'project-section',
  'diary-entry',
  'author',
  'secret',
] as const;

export type GeneratedIconKind = (typeof GENERATED_ICON_KINDS)[number];

export function isGeneratedIconKind(
  value: unknown,
): value is GeneratedIconKind {
  return GENERATED_ICON_KINDS.includes(value as GeneratedIconKind);
}

const GENERATED_ICON_SIZE = 256;

export function normalizeGeneratedIconSeed(
  kind: GeneratedIconKind,
  seed: string,
) {
  const normalized = seed.trim().normalize('NFKC');
  return kind === 'author' ? normalized.toLocaleLowerCase() : normalized;
}

export function generatedIconKey(kind: GeneratedIconKind, seed: string) {
  return createHash('sha256')
    .update(`${kind}:${normalizeGeneratedIconSeed(kind, seed)}`)
    .digest('hex');
}

export function resolveGeneratedIcon(
  kind: GeneratedIconKind,
  seed: string,
): MediaDescriptor {
  const key = generatedIconKey(kind, seed);
  const accentHue = stringColorHue(key);
  const src = `/media/generated-icons/${kind}/${key}.${GENERATED_ICON_EXTENSION}`;
  return {
    src,
    previewSrc: src,
    kind: 'image',
    accent: { hue: accentHue, chroma: 0.15 },
    width: GENERATED_ICON_SIZE,
    height: GENERATED_ICON_SIZE,
    generated: true,
  };
}

export function resolveEntityIconMedia(
  kind: GeneratedIconKind,
  seed: string,
  uploadedMedia?: MediaDescriptor,
): MediaDescriptor {
  return uploadedMedia ?? resolveGeneratedIcon(kind, seed);
}

export function generatedIconFilePath(kind: GeneratedIconKind, key: string) {
  return THEI_SERVER.contentPath(
    THEI_CONTENT_DIRS.generatedMedia,
    kind,
    `${key}.${GENERATED_ICON_EXTENSION}`,
  );
}

export async function ensureGeneratedIcon(
  kind: GeneratedIconKind,
  key: string,
): Promise<{ filePath: string; etag: string }> {
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw createError({ statusCode: 404 });
  }
  const filePath = generatedIconFilePath(kind, key);
  const signaturePath = `${filePath}.signature`;
  const templateSignature = generatedIconTemplateSignature();
  const [fileExists, storedSignature] = await Promise.all([
    readFile(filePath)
      .then(() => true)
      .catch(() => false),
    readFile(signaturePath, 'utf8').catch(() => ''),
  ]);
  if (fileExists && storedSignature === templateSignature) {
    return {
      filePath,
      etag: generatedIconEtag(key, templateSignature),
    };
  }

  const accentHue = stringColorHue(key);
  const svg = buildIconSvg(kind, accentHue);
  const buffer = await sharp(Buffer.from(svg))
    .resize(GENERATED_ICON_SIZE, GENERATED_ICON_SIZE)
    .avif({ quality: 50, effort: 4 })
    .toBuffer();
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tempPath, buffer);
  await rename(tempPath, filePath).catch(async (error) => {
    await rm(tempPath, { force: true }).catch(() => {});
    const exists = await readFile(filePath)
      .then(() => true)
      .catch(() => false);
    if (!exists) throw error;
  });
  await writeFile(signaturePath, templateSignature, 'utf8');
  return {
    filePath,
    etag: generatedIconEtag(key, templateSignature),
  };
}

function generatedIconTemplateSignature() {
  return createHash('sha256')
    .update(
      `${GENERATED_ICON_SIZE}:${GENERATED_ICON_EXTENSION}50:${buildIconSvg.toString()}:${JSON.stringify(GENERATED_ICON_KINDS.map(kindSymbol))}:${GLYPH_SIZE}:${oklchToHex.toString()}`,
    )
    .digest('hex');
}

function generatedIconEtag(key: string, signature: string) {
  return `"${createHash('sha256').update(`${key}:${signature}`).digest('hex')}"`;
}

/**
 * The icon each kind is drawn with: the one the interface names that kind by,
 * read from the bundled icons at build time. Changing an entity's icon
 * therefore changes its fallback picture too — the template signature below
 * covers the icon's markup, so pictures already on disk are redrawn.
 */
const KIND_ICONS: Record<Exclude<GeneratedIconKind, 'author'>, string> = {
  project: entityTypeIcon('project'),
  page: entityTypeIcon('page'),
  event: entityTypeIcon('event'),
  'project-stage': entityTypeIcon('project-stage'),
  'project-section': entityTypeIcon('project-section'),
  'diary-entry': entityTypeIcon('diary-entry'),
  secret: 'lock-close',
};

/**
 * The author is not a kind of entity but a person, and is drawn as a
 * silhouette filling the square rather than as an icon on a field.
 */
const AUTHOR_SILHOUETTE =
  'M480 581.43c-52.05 0-96.61-18.53-133.68-55.6-37.07-37.07-55.6-81.63-55.6-133.68s18.53-96.61 55.6-133.68c37.07-37.07 81.63-55.6 133.68-55.6s96.61 18.53 133.68 55.6c37.07 37.07 55.6 81.63 55.6 133.68s-18.53 96.61-55.6 133.68c-37.07 37.07-81.63 55.6-133.68 55.6ZM101.43 960V827.5c0-26.03 6.7-50.48 20.11-73.35 13.41-22.87 31.94-40.22 55.6-52.05 40.22-20.51 85.57-37.86 136.05-52.05 50.48-14.2 106.08-21.29 166.81-21.29s116.33 7.1 166.81 21.29 95.82 31.55 136.05 52.05c23.66 11.83 42.19 29.18 55.6 52.05 13.41 22.87 20.11 47.32 20.11 73.35V960H101.43Z';

function kindSymbol(kind: GeneratedIconKind): IconSymbol {
  if (kind === 'author')
    return {
      viewBox: '0 0 960 960',
      body: `<path d="${AUTHOR_SILHOUETTE}"/>`,
    };
  return iconSymbols[KIND_ICONS[kind]] ?? { viewBox: '0 0 24 24', body: '' };
}

/**
 * How much of the 960-unit square the longer side of an icon's box takes.
 * Icons keep a little air inside their box, so the ink itself ends up at
 * about half the picture.
 */
const GLYPH_SIZE = 600;

export function buildIconSvg(kind: GeneratedIconKind, hue: number) {
  // Bright where the glyph is, deepening toward the edges: the light gathers
  // on the icon, which is the one thing the picture has to say.
  const center = oklchToHex(0.74, 0.12, hue);
  const edge = oklchToHex(0.44, 0.15, hue);
  const foreground = oklchToHex(0.18, 0.04, hue);
  const symbol = kindSymbol(kind);
  const [x = 0, y = 0, width = 24, height = 24] = symbol.viewBox
    .split(/[\s,]+/)
    .map(Number);
  const scale = GLYPH_SIZE / Math.max(width, height);
  const transform =
    kind === 'author'
      ? ''
      : ` transform="translate(480 480) scale(${scale}) translate(${-(x + width / 2)} ${-(y + height / 2)})"`;
  // An icon painted in `currentColor` takes the foreground the same way an
  // unpainted one takes the group's fill.
  const body = symbol.body.replaceAll('currentColor', foreground);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 960">
    <defs><radialGradient id="g" cx="480" cy="480" r="680" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${center}"/>
      <stop offset="1" stop-color="${edge}"/>
    </radialGradient></defs>
    <rect width="960" height="960" fill="url(#g)"/>
    <g fill="${foreground}"${transform}>${body}</g>
  </svg>`;
}
