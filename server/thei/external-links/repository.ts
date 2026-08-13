import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { contentInlineLinksFromData } from '#layers/thei/shared/content-link';
import {
  EXTERNAL_LINK_ICON_PATH,
  normalizeExternalLinkAccentHue,
  type ExternalLink,
} from '#layers/thei/shared/external-link';
import { extractImageAccentHue } from '../assets/image-color';

export const EXTERNAL_LINK_FAVICON_SIZE = 48;
export const EXTERNAL_LINK_FAVICON_QUALITY = 80;
const ORPHAN_CLEANUP_GRACE_MS = 60_000;

export function externalLinkKey(url: string) {
  return createHash('sha256').update(url).digest('hex');
}

export function externalLinkFaviconPath(key: string) {
  return THEI_SERVER.contentPath('external-link-favicons', `${key}.webp`);
}

export function externalLinkMedia(
  faviconKey: string,
  accentHue: number | undefined,
  touchedAt?: number,
): ExternalLink['faviconMedia'] {
  const version = touchedAt ? `?v=${touchedAt}` : '';
  const src = `/media/external-link-favicons/${faviconKey}.webp${version}`;
  return {
    src,
    previewSrc: src,
    kind: 'image',
    ...(accentHue === undefined ? {} : { accentHue }),
    width: EXTERNAL_LINK_FAVICON_SIZE,
    height: EXTERNAL_LINK_FAVICON_SIZE,
  };
}

export function externalLinkPreviewMedia(
  buffer: Buffer,
  accentHue: number | undefined,
): ExternalLink['faviconMedia'] {
  const src = `data:image/webp;base64,${buffer.toString('base64')}`;
  return {
    src,
    previewSrc: src,
    kind: 'image',
    ...(accentHue === undefined ? {} : { accentHue }),
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
    .select({ action: schema.projects.action })
    .from(schema.projects)
    .all();
  for (const row of actionRows) {
    const action = row.action as { externalUrl?: unknown } | null;
    if (typeof action?.externalUrl === 'string')
      usedUrls.add(action.externalUrl);
  }
  const contentRows = db
    .select({ data: schema.content.data })
    .from(schema.content)
    .all();
  for (const row of contentRows) {
    collectContentExternalLinkUrls(row.data, usedUrls);
    if (
      row.data &&
      typeof row.data === 'object' &&
      'blocks' in row.data &&
      Array.isArray(row.data.blocks)
    ) {
      const blocks = row.data.blocks.flatMap((block) =>
        block &&
        typeof block === 'object' &&
        'data' in block &&
        block.data &&
        typeof block.data === 'object'
          ? [{ data: block.data as Record<string, unknown> }]
          : [],
      );
      for (const link of contentInlineLinksFromData({ blocks })) {
        if (link.kind === 'external') usedUrls.add(link.url);
      }
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

function collectContentExternalLinkUrls(value: unknown, urls: Set<string>) {
  if (!value || typeof value !== 'object') return;
  if (
    'type' in value &&
    value.type === 'externalLink' &&
    'data' in value &&
    value.data &&
    typeof value.data === 'object' &&
    'url' in value.data &&
    typeof value.data.url === 'string'
  ) {
    urls.add(value.data.url);
  }
  for (const nested of Object.values(value)) {
    collectContentExternalLinkUrls(nested, urls);
  }
}

export function toExternalLink(row: {
  url: string;
  title: string | null;
  description: string | null;
  faviconKey: string;
  accentHue: number | null;
  touchedAt: number;
}): ExternalLink {
  return {
    url: row.url,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    faviconMedia: externalLinkMedia(
      row.faviconKey,
      normalizeExternalLinkAccentHue(row.accentHue),
      row.touchedAt,
    ),
    touchedAt: row.touchedAt,
  };
}

export function upsertExternalLink(
  data: Omit<ExternalLink, 'faviconMedia'> & {
    faviconKey: string;
    accentHue?: number;
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
        accentHue: data.accentHue,
        touchedAt: data.touchedAt,
      },
    })
    .run();
}

export async function writeExternalLinkFavicon(url: string, source?: Buffer) {
  const faviconKey = externalLinkKey(url);
  const { buffer, accentHue } = await prepareExternalLinkFavicon(source);
  await writeExternalLinkFaviconFile(faviconKey, buffer);
  return { faviconKey, accentHue };
}

export async function prepareExternalLinkFavicon(source?: Buffer) {
  let accentHue: number | undefined;
  let buffer: Buffer;
  try {
    if (!source) throw new Error('Missing favicon');
    buffer = await convertExternalLinkFavicon(source);
    accentHue = await extractImageAccentHue(buffer);
  } catch {
    accentHue = undefined;
    buffer = await sharp(Buffer.from(fallbackSvg()))
      .resize(EXTERNAL_LINK_FAVICON_SIZE, EXTERNAL_LINK_FAVICON_SIZE)
      .webp({ quality: EXTERNAL_LINK_FAVICON_QUALITY, effort: 6 })
      .toBuffer();
  }
  accentHue = normalizeExternalLinkAccentHue(accentHue);
  return { buffer, accentHue };
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
