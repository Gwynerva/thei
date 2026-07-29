import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { stringColorHue } from '#layers/thei/shared/utils/string-color';

export type GeneratedIconKind = 'project' | 'author';

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
  const src = `/media/generated-icons/${kind}/${key}.webp`;
  return {
    src,
    previewSrc: src,
    kind: 'image',
    accentHue,
    width: GENERATED_ICON_SIZE,
    height: GENERATED_ICON_SIZE,
  };
}

export function generatedIconFilePath(kind: GeneratedIconKind, key: string) {
  return THEI_SERVER.contentPath('generated-media', kind, `${key}.webp`);
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
    .webp({ quality: 82, effort: 6 })
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
      `${GENERATED_ICON_SIZE}:webp82:${buildIconSvg.toString()}:${hslToHex.toString()}`,
    )
    .digest('hex');
}

function generatedIconEtag(key: string, signature: string) {
  return `"${createHash('sha256').update(`${key}:${signature}`).digest('hex')}"`;
}

function buildIconSvg(kind: GeneratedIconKind, hue: number) {
  const backgroundDark = hslToHex(hue, 62, 38);
  const backgroundLight = hslToHex(hue, 72, 72);
  const foreground = hslToHex(hue, 76, 12);
  const path =
    kind === 'project'
      ? 'M441.67 764.62v-262.58l-230-133.21v262.58l230 133.21Zm76.66 0 230-133.21V368.83l-230 133.21v262.58Zm-76.66 88.17L173.34 698.5c-12.14-7.02-21.56-16.29-28.27-27.79s-10.06-24.27-10.06-38.33V327.63c0-14.06 3.35-26.83 10.06-38.33s16.13-20.77 28.27-27.79l268.33-154.3c12.14-7.02 24.92-10.54 38.33-10.54s26.19 3.52 38.33 10.54l268.33 154.3c12.14 7.02 21.56 16.29 28.27 27.79s10.06 24.27 10.06 38.33v304.75c0 14.06-3.35 26.83-10.06 38.33s-16.13 20.77-28.27 27.79L518.33 852.79c-12.14 7.02-24.92 10.54-38.33 10.54s-26.19-3.52-38.33-10.54Zm191.66-506 73.79-42.17L480 173.33l-74.75 43.12 228.08 130.34ZM480 435.92l74.75-43.12-227.12-131.29-74.75 43.12L480 435.92Z'
      : 'M480 581.43c-52.05 0-96.61-18.53-133.68-55.6-37.07-37.07-55.6-81.63-55.6-133.68s18.53-96.61 55.6-133.68c37.07-37.07 81.63-55.6 133.68-55.6s96.61 18.53 133.68 55.6c37.07 37.07 55.6 81.63 55.6 133.68s-18.53 96.61-55.6 133.68c-37.07 37.07-81.63 55.6-133.68 55.6ZM101.43 960V827.5c0-26.03 6.7-50.48 20.11-73.35 13.41-22.87 31.94-40.22 55.6-52.05 40.22-20.51 85.57-37.86 136.05-52.05 50.48-14.2 106.08-21.29 166.81-21.29s116.33 7.1 166.81 21.29 95.82 31.55 136.05 52.05c23.66 11.83 42.19 29.18 55.6 52.05 13.41 22.87 20.11 47.32 20.11 73.35V960H101.43Z';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 960">
    <defs><linearGradient id="g" x1="0" y1="960" x2="960" y2="0">
      <stop offset="0" stop-color="${backgroundDark}"/>
      <stop offset="1" stop-color="${backgroundLight}"/>
    </linearGradient></defs>
    <rect width="960" height="960" fill="url(#g)"/>
    <path fill="${foreground}" d="${path}"/>
  </svg>`;
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((value) =>
      Math.round((value + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
