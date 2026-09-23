import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { THEI_CONTENT_DIRS } from '../content-layout';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { oklchToHex } from '#layers/thei/shared/accent-color';
import { stringColorHue } from '#layers/thei/shared/utils/string-color';

export const GENERATED_ICON_EXTENSION = 'avif';

/**
 * Every kind of thing that gets a drawn picture when it has none of its own.
 *
 * Projects and pages stand in for a missing icon; events, stages, sections
 * and diary entries for a body that opens without a picture. They all get the
 * same drawing — their kind's glyph, dark, on a field of their own accent — so
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
      `${GENERATED_ICON_SIZE}:${GENERATED_ICON_EXTENSION}50:${buildIconSvg.toString()}:${JSON.stringify(ICON_GLYPHS)}:${GLYPH_SIZE}:${oklchToHex.toString()}`,
    )
    .digest('hex');
}

function generatedIconEtag(key: string, signature: string) {
  return `"${createHash('sha256').update(`${key}:${signature}`).digest('hex')}"`;
}

/**
 * A glyph and the box its ink occupies in its own coordinates, so every kind
 * is drawn at the same visual size however its source was drawn.
 */
type IconGlyph = {
  paths: string[];
  /** `[x, y, width, height]` of the ink. */
  box: [number, number, number, number];
  /** Drawn as it is, edge to edge, instead of centred: the author silhouette. */
  fullBleed?: boolean;
};

const ICON_GLYPHS: Record<GeneratedIconKind, IconGlyph> = {
  project: {
    paths: [
      'M441.67 764.62v-262.58l-230-133.21v262.58l230 133.21Zm76.66 0 230-133.21V368.83l-230 133.21v262.58Zm-76.66 88.17L173.34 698.5c-12.14-7.02-21.56-16.29-28.27-27.79s-10.06-24.27-10.06-38.33V327.63c0-14.06 3.35-26.83 10.06-38.33s16.13-20.77 28.27-27.79l268.33-154.3c12.14-7.02 24.92-10.54 38.33-10.54s26.19 3.52 38.33 10.54l268.33 154.3c12.14 7.02 21.56 16.29 28.27 27.79s10.06 24.27 10.06 38.33v304.75c0 14.06-3.35 26.83-10.06 38.33s-16.13 20.77-28.27 27.79L518.33 852.79c-12.14 7.02-24.92 10.54-38.33 10.54s-26.19-3.52-38.33-10.54Zm191.66-506 73.79-42.17L480 173.33l-74.75 43.12 228.08 130.34ZM480 435.92l74.75-43.12-227.12-131.29-74.75 43.12L480 435.92Z',
    ],
    box: [135, 96, 690, 767],
  },
  page: {
    paths: [
      'M17.744 1.996a2.25 2.25 0 0 1 2.245 2.096l.005.154v15.498a2.25 2.25 0 0 1-2.096 2.245l-.154.005h-11.5A2.25 2.25 0 0 1 4 19.898l-.005-.154V4.246A2.25 2.25 0 0 1 6.09 2.001l.154-.005zm0 1.5h-11.5a.75.75 0 0 0-.743.648l-.007.102v15.498c0 .38.282.694.648.743l.102.007h11.5a.75.75 0 0 0 .743-.648l.007-.102V4.246a.75.75 0 0 0-.648-.743zM13.018 16.02a.75.75 0 0 1-.623-.858l.104-.66h-1.481l-.142.895a.75.75 0 1 1-1.481-.235l.104-.66h-.75a.75.75 0 0 1 0-1.5h.988l.237-1.5H9.25a.75.75 0 0 1 0-1.5h.963l.2-1.26a.75.75 0 0 1 1.48.235L11.73 10h1.482l.2-1.259a.75.75 0 0 1 1.48.235L14.73 10h.52a.75.75 0 0 1 0 1.5h-.757l-.238 1.5h.494a.75.75 0 0 1 0 1.5h-.731l-.142.896a.75.75 0 0 1-.858.623M11.493 11.5l-.238 1.5h1.482l.237-1.5z',
    ],
    box: [3.99, 1.99, 16, 20],
  },
  event: {
    paths: [
      'M232 144C218.7 144 208 154.7 208 168L208 472C208 480.4 206.6 488.5 203.9 496L504 496C517.3 496 528 485.3 528 472L528 168C528 154.7 517.3 144 504 144L232 144zM136 544C96.2 544 64 511.8 64 472L64 176C64 162.7 74.7 152 88 152C101.3 152 112 162.7 112 176L112 472C112 485.3 122.7 496 136 496C149.3 496 160 485.3 160 472L160 168C160 128.2 192.2 96 232 96L504 96C543.8 96 576 128.2 576 168L576 472C576 511.8 543.8 544 504 544L136 544zM256 216C256 202.7 266.7 192 280 192L328 192C341.3 192 352 202.7 352 216L352 264C352 277.3 341.3 288 328 288L280 288C266.7 288 256 277.3 256 264L256 216zM408 240L456 240C469.3 240 480 250.7 480 264C480 277.3 469.3 288 456 288L408 288C394.7 288 384 277.3 384 264C384 250.7 394.7 240 408 240zM280 320L456 320C469.3 320 480 330.7 480 344C480 357.3 469.3 368 456 368L280 368C266.7 368 256 357.3 256 344C256 330.7 266.7 320 280 320zM280 400L456 400C469.3 400 480 410.7 480 424C480 437.3 469.3 448 456 448L280 448C266.7 448 256 437.3 256 424C256 410.7 266.7 400 280 400z',
    ],
    box: [64, 96, 512, 448],
  },
  'project-stage': {
    paths: [
      'M11.2,14.4h-1.1c-.6,0-1.1.5-1.1,1.1s.5,1.1,1.1,1.1h1.1c.6,0,1.1-.5,1.1-1.1s-.5-1.1-1.1-1.1M16.5,14.4h-1.1c-.6,0-1.1.5-1.1,1.1s.5,1.1,1.1,1.1h1.1c.6,0,1.1-.5,1.1-1.1s-.5-1.1-1.1-1.1M21.9,14.4h-1.1c-.6,0-1.1.5-1.1,1.1s.5,1.1,1.1,1.1h1.1c.6,0,1.1-.5,1.1-1.1s-.5-1.1-1.1-1.1M11.2,18.7h-1.1c-.6,0-1.1.5-1.1,1.1s.5,1.1,1.1,1.1h1.1c.6,0,1.1-.5,1.1-1.1s-.5-1.1-1.1-1.1M16.5,18.7h-1.1c-.6,0-1.1.5-1.1,1.1s.5,1.1,1.1,1.1h1.1c.6,0,1.1-.5,1.1-1.1s-.5-1.1-1.1-1.1M21.9,18.7h-1.1c-.6,0-1.1.5-1.1,1.1s.5,1.1,1.1,1.1h1.1c.6,0,1.1-.5,1.1-1.1s-.5-1.1-1.1-1.1M11.2,22.9h-1.1c-.6,0-1.1.5-1.1,1.1s.5,1.1,1.1,1.1h1.1c.6,0,1.1-.5,1.1-1.1s-.5-1.1-1.1-1.1M16.5,22.9h-1.1c-.6,0-1.1.5-1.1,1.1s.5,1.1,1.1,1.1h1.1c.6,0,1.1-.5,1.1-1.1s-.5-1.1-1.1-1.1M21.9,22.9h-1.1c-.6,0-1.1.5-1.1,1.1s.5,1.1,1.1,1.1h1.1c.6,0,1.1-.5,1.1-1.1s-.5-1.1-1.1-1.1',
      'M26.1,6.4h-2.9c-.1,0-.3-.1-.3-.3v-1.9c0-.6-.5-1.1-1.1-1.1s-1.1.5-1.1,1.1v5.1c0,.4-.4.8-.8.8s-.8-.4-.8-.8v-2.4c0-.3-.2-.5-.5-.5h-6.7c-.1,0-.3-.1-.3-.3v-1.9c0-.6-.5-1.1-1.1-1.1s-1.1.5-1.1,1.1v5.1c0,.4-.4.8-.8.8s-.8-.4-.8-.8v-2.4c0-.3-.2-.5-.5-.5h-1.6c-1.2,0-2.1,1-2.1,2.1v18.2c0,1.2,1,2.1,2.1,2.1h20.3c1.2,0,2.1-1,2.1-2.1V8.5c0-1.2-1-2.1-2.1-2.1M26.1,26.1c0,.3-.2.5-.5.5H6.4c-.3,0-.5-.2-.5-.5v-12.8c0-.3.2-.5.5-.5h19.2c.3,0,.5.2.5.5v12.8Z',
    ],
    box: [3.8, 3.1, 24.4, 25.6],
  },
  'project-section': {
    paths: [
      'M427.4,41.7H84.6l-28.6,142.9v128.6h400v-128.6l-28.6-142.9ZM416.7,184.6h-103.6c0,31.6-25.6,57.1-57.1,57.1s-57.1-25.6-57.1-57.1h-103.6l19.6-105.4h282.1l19.6,105.4ZM313.1,341.7c0,31.6-25.6,57.1-57.1,57.1s-57.1-25.6-57.1-57.1H56v128.6h400v-128.6h-142.9Z',
    ],
    box: [56, 41.7, 400, 428.6],
  },
  'diary-entry': {
    paths: [
      'M300 96c-53.4 0-98.6 34.9-114.1 83.1C132.3 184.6 90 230.4 90 286c0 59.6 48.4 108 108 108h214c61.9 0 112-50.1 112-112 0-49.2-31.7-91-75.8-106.1C440.6 129.1 396.9 96 345.6 96c-16.3 0-31.8 3.3-45.9 9.3C296.8 101.8 298.4 96 300 96zm-4 48c37.7 0 69.7 24.2 81.4 57.9 3.6 10.4 13.8 17 24.8 16.1 2.5-.2 5.1-.3 7.8-.3 35.3 0 64 28.7 64 64s-28.7 64-64 64H198c-33.1 0-60-26.9-60-60s26.9-60 60-60c2.8 0 5.6.2 8.3.6 12.1 1.7 23.5-5.9 26.6-17.7C241.3 172.5 266.2 144 296 144z',
      'M238 452a38 38 0 1 1 76 0 38 38 0 0 1-76 0zM154 516a28 28 0 1 1 56 0 28 28 0 0 1-56 0zM92 560a18 18 0 1 1 36 0 18 18 0 0 1-36 0z',
    ],
    box: [74, 96, 450, 482],
  },
  author: {
    paths: [
      'M480 581.43c-52.05 0-96.61-18.53-133.68-55.6-37.07-37.07-55.6-81.63-55.6-133.68s18.53-96.61 55.6-133.68c37.07-37.07 81.63-55.6 133.68-55.6s96.61 18.53 133.68 55.6c37.07 37.07 55.6 81.63 55.6 133.68s-18.53 96.61-55.6 133.68c-37.07 37.07-81.63 55.6-133.68 55.6ZM101.43 960V827.5c0-26.03 6.7-50.48 20.11-73.35 13.41-22.87 31.94-40.22 55.6-52.05 40.22-20.51 85.57-37.86 136.05-52.05 50.48-14.2 106.08-21.29 166.81-21.29s116.33 7.1 166.81 21.29 95.82 31.55 136.05 52.05c23.66 11.83 42.19 29.18 55.6 52.05 13.41 22.87 20.11 47.32 20.11 73.35V960H101.43Z',
    ],
    box: [0, 0, 960, 960],
    fullBleed: true,
  },
  secret: {
    paths: [
      'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm296.5-143.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z',
    ],
    box: [160, -920, 640, 840],
  },
};

/** How much of the 960-unit square the longer side of a glyph's ink takes. */
const GLYPH_SIZE = 500;

function buildIconSvg(kind: GeneratedIconKind, hue: number) {
  // Bright where the glyph is, deepening toward the edges: the light gathers
  // on the icon, which is the one thing the picture has to say.
  const center = oklchToHex(0.74, 0.12, hue);
  const edge = oklchToHex(0.44, 0.15, hue);
  const foreground = oklchToHex(0.18, 0.04, hue);
  const glyph = ICON_GLYPHS[kind];
  const [x, y, width, height] = glyph.box;
  const scale = GLYPH_SIZE / Math.max(width, height);
  const transform = glyph.fullBleed
    ? ''
    : ` transform="translate(480 480) scale(${scale}) translate(${-(x + width / 2)} ${-(y + height / 2)})"`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 960">
    <defs><radialGradient id="g" cx="480" cy="480" r="680" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${center}"/>
      <stop offset="1" stop-color="${edge}"/>
    </radialGradient></defs>
    <rect width="960" height="960" fill="url(#g)"/>
    <g fill="${foreground}"${transform}>${glyph.paths
      .map((path) => `<path d="${path}"/>`)
      .join('')}</g>
  </svg>`;
}
