import { normalizeImageAccent } from '#layers/thei/shared/accent-color';
import type { ImageAccent } from '#layers/thei/shared/accent-color';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { collectContentExternalLinkUrls } from '#layers/thei/shared/content';
import {
  EXTERNAL_LINK_ICON_PATH,
  type ExternalLink,
} from '#layers/thei/shared/external-link';
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
const ORPHAN_CLEANUP_GRACE_MS = 60_000;

export function externalLinkKey(url: string) {
  return createHash('sha256').update(url).digest('hex');
}

export function externalLinkFaviconPath(key: string) {
  return THEI_SERVER.contentPath(
    THEI_CONTENT_DIRS.externalLinkFavicons,
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

export function externalLinkPreviewMedia(
  buffer: Buffer,
  accent: ImageAccent | undefined,
): ExternalLink['faviconMedia'] {
  const src = `data:image/${EXTERNAL_LINK_FAVICON_EXTENSION};base64,${buffer.toString('base64')}`;
  return {
    src,
    previewSrc: src,
    kind: 'image',
    ...(accent === undefined ? {} : { accent }),
    width: EXTERNAL_LINK_FAVICON_SIZE,
    height: EXTERNAL_LINK_FAVICON_SIZE,
  };
}

export async function findExternalLink(url: string) {
  const { db, schema } = THEI_SERVER.useDb();
  const row = await db.query.externalLinks.findFirst({
    where: eq(schema.externalLinks.url, url),
  });
  return row ? toExternalLink(row) : undefined;
}

export async function cleanupOrphanExternalLinks() {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({
      url: schema.externalLinks.url,
      faviconKey: schema.externalLinks.faviconKey,
      touchedAt: schema.externalLinks.touchedAt,
    })
    .from(schema.externalLinks)
    .all();
  if (!rows.length) return;

  const usedUrls = new Set(
    db
      .select({ url: schema.projectExternalLinks.url })
      .from(schema.projectExternalLinks)
      .all()
      .map((row) => row.url),
  );
  const actionRows = db
    .select({ url: schema.profileExternalLinks.url })
    .from(schema.profileExternalLinks)
    .all();
  for (const row of actionRows) usedUrls.add(row.url);
  const projectActionRows = db
    .select({ action: schema.projects.action })
    .from(schema.projects)
    .all();
  for (const row of projectActionRows) {
    const action = row.action as { externalUrl?: unknown } | null;
    if (typeof action?.externalUrl === 'string')
      usedUrls.add(action.externalUrl);
  }
  const contentRows = db
    .select({ data: schema.content.data })
    .from(schema.content)
    .all();
  for (const row of contentRows) {
    try {
      for (const url of collectContentExternalLinkUrls(row.data)) {
        usedUrls.add(url);
      }
    } catch (error) {
      THEI_SERVER.console
        .tag('External links')
        .warn('Skipped malformed content during preview cleanup', error);
    }
  }

  const cleanupBefore = Date.now() - ORPHAN_CLEANUP_GRACE_MS;
  const orphaned = rows.filter(
    (row) => !usedUrls.has(row.url) && row.touchedAt < cleanupBefore,
  );
  if (!orphaned.length) return;

  db.transaction((tx) => {
    for (const row of orphaned) {
      tx.delete(schema.externalLinks)
        .where(eq(schema.externalLinks.url, row.url))
        .run();
    }
  });
  await Promise.all(
    orphaned.map((row) =>
      rm(externalLinkFaviconPath(row.faviconKey), { force: true }).catch(
        () => {},
      ),
    ),
  );
}

export function toExternalLink(row: {
  url: string;
  title: string | null;
  description: string | null;
  faviconKey: string;
  accent: ImageAccent | null;
  touchedAt: number;
}): ExternalLink {
  return {
    url: row.url,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    faviconMedia: externalLinkMedia(
      row.faviconKey,
      normalizeImageAccent(row.accent),
      row.touchedAt,
    ),
    touchedAt: row.touchedAt,
  };
}

export function upsertExternalLink(
  data: Omit<ExternalLink, 'faviconMedia'> & {
    faviconKey: string;
    accent?: ImageAccent;
  },
) {
  const { db, schema } = THEI_SERVER.useDb();
  db.insert(schema.externalLinks)
    .values(data)
    .onConflictDoUpdate({
      target: schema.externalLinks.url,
      set: {
        title: data.title,
        description: data.description,
        faviconKey: data.faviconKey,
        accent: data.accent ?? null,
        touchedAt: data.touchedAt,
      },
    })
    .run();
}

export async function writeExternalLinkFavicon(url: string, source?: Buffer) {
  const faviconKey = externalLinkKey(url);
  const { buffer, accent } = await prepareExternalLinkFavicon(source);
  await writeExternalLinkFaviconFile(faviconKey, buffer);
  return { faviconKey, accent };
}

export async function prepareExternalLinkFavicon(source?: Buffer) {
  let accent: ImageAccent | undefined;
  let buffer: Buffer;
  try {
    if (!source) throw new Error('Missing favicon');
    buffer = await convertExternalLinkFavicon(source);
    accent = await extractImageAccent(buffer);
  } catch {
    accent = undefined;
    buffer = await sharp(Buffer.from(fallbackSvg()))
      .resize(EXTERNAL_LINK_FAVICON_SIZE, EXTERNAL_LINK_FAVICON_SIZE)
      .webp({ quality: EXTERNAL_LINK_FAVICON_QUALITY, effort: 6 })
      .toBuffer();
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

function fallbackSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">
    <rect x="0" y="-960" width="960" height="960" rx="200" fill="#52525b"/>
    <path d="${EXTERNAL_LINK_ICON_PATH}" fill="#e4e4e7"/>
  </svg>`;
}
