import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { oklchToHex } from '#layers/thei/shared/accent-color';
import { stringColorHue } from '#layers/thei/shared/utils/string-color';

export const GENERATED_ICON_KINDS = ['project', 'page', 'author'] as const;

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

export function resolveEntityIconMedia(
  kind: GeneratedIconKind,
  seed: string,
  uploadedMedia?: MediaDescriptor,
): MediaDescriptor {
  return uploadedMedia ?? resolveGeneratedIcon(kind, seed);
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
      `${GENERATED_ICON_SIZE}:webp82:${buildIconSvg.toString()}:${oklchToHex.toString()}`,
    )
    .digest('hex');
}

function generatedIconEtag(key: string, signature: string) {
  return `"${createHash('sha256').update(`${key}:${signature}`).digest('hex')}"`;
}

function buildIconSvg(kind: GeneratedIconKind, hue: number) {
  const backgroundDark = oklchToHex(0.42, 0.15, hue);
  const backgroundLight = oklchToHex(0.72, 0.12, hue);
  const foreground = oklchToHex(0.16, 0.035, hue);
  const path =
    kind === 'project'
      ? 'M441.67 764.62v-262.58l-230-133.21v262.58l230 133.21Zm76.66 0 230-133.21V368.83l-230 133.21v262.58Zm-76.66 88.17L173.34 698.5c-12.14-7.02-21.56-16.29-28.27-27.79s-10.06-24.27-10.06-38.33V327.63c0-14.06 3.35-26.83 10.06-38.33s16.13-20.77 28.27-27.79l268.33-154.3c12.14-7.02 24.92-10.54 38.33-10.54s26.19 3.52 38.33 10.54l268.33 154.3c12.14 7.02 21.56 16.29 28.27 27.79s10.06 24.27 10.06 38.33v304.75c0 14.06-3.35 26.83-10.06 38.33s-16.13 20.77-28.27 27.79L518.33 852.79c-12.14 7.02-24.92 10.54-38.33 10.54s-26.19-3.52-38.33-10.54Zm191.66-506 73.79-42.17L480 173.33l-74.75 43.12 228.08 130.34ZM480 435.92l74.75-43.12-227.12-131.29-74.75 43.12L480 435.92Z'
      : kind === 'page'
        ? 'M17.744 1.996a2.25 2.25 0 0 1 2.245 2.096l.005.154v15.498a2.25 2.25 0 0 1-2.096 2.245l-.154.005h-11.5A2.25 2.25 0 0 1 4 19.898l-.005-.154V4.246A2.25 2.25 0 0 1 6.09 2.001l.154-.005zm0 1.5h-11.5a.75.75 0 0 0-.743.648l-.007.102v15.498c0 .38.282.694.648.743l.102.007h11.5a.75.75 0 0 0 .743-.648l.007-.102V4.246a.75.75 0 0 0-.648-.743zM13.018 16.02a.75.75 0 0 1-.623-.858l.104-.66h-1.481l-.142.895a.75.75 0 1 1-1.481-.235l.104-.66h-.75a.75.75 0 0 1 0-1.5h.988l.237-1.5H9.25a.75.75 0 0 1 0-1.5h.963l.2-1.26a.75.75 0 0 1 1.48.235L11.73 10h1.482l.2-1.259a.75.75 0 0 1 1.48.235L14.73 10h.52a.75.75 0 0 1 0 1.5h-.757l-.238 1.5h.494a.75.75 0 0 1 0 1.5h-.731l-.142.896a.75.75 0 0 1-.858.623M11.493 11.5l-.238 1.5h1.482l.237-1.5z'
        : 'M480 581.43c-52.05 0-96.61-18.53-133.68-55.6-37.07-37.07-55.6-81.63-55.6-133.68s18.53-96.61 55.6-133.68c37.07-37.07 81.63-55.6 133.68-55.6s96.61 18.53 133.68 55.6c37.07 37.07 55.6 81.63 55.6 133.68s-18.53 96.61-55.6 133.68c-37.07 37.07-81.63 55.6-133.68 55.6ZM101.43 960V827.5c0-26.03 6.7-50.48 20.11-73.35 13.41-22.87 31.94-40.22 55.6-52.05 40.22-20.51 85.57-37.86 136.05-52.05 50.48-14.2 106.08-21.29 166.81-21.29s116.33 7.1 166.81 21.29 95.82 31.55 136.05 52.05c23.66 11.83 42.19 29.18 55.6 52.05 13.41 22.87 20.11 47.32 20.11 73.35V960H101.43Z';
  const transform = kind === 'page' ? ' transform="scale(40)"' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 960">
    <defs><linearGradient id="g" x1="0" y1="960" x2="960" y2="0">
      <stop offset="0" stop-color="${backgroundDark}"/>
      <stop offset="1" stop-color="${backgroundLight}"/>
    </linearGradient></defs>
    <rect width="960" height="960" fill="url(#g)"/>
    <path fill="${foreground}" d="${path}"${transform}/>
  </svg>`;
}
