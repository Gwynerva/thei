import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ogTemplateSignature } from '#thei/og-signature';
import { AssetType } from '#layers/thei/shared/asset';
import { buildOgImagePath } from '#layers/thei/shared/og-url';
import { withProcessingSlot } from '../assets/queue';
import { OG_CARDS_DIR, THEI_CONTENT_DIRS } from '../content-layout';
import { composeOgCard } from './compose';
import { resolveOgContent } from './content';
import type { OgCardContent } from './model';
import { renderOgPng } from './render';
import type { OgTarget } from './targets';
import { ogCardVersion, ogContentKey } from './version';

/**
 * Rendered cards, kept on disk under `generated-media`.
 *
 * They are derived files: reproducible from the content at any time, excluded
 * from backups by the content layout, and safe to delete. A file is named
 * after what the card shows, so a card whose title, artwork or numbers
 * changed is a different file and is drawn once; the old one is swept when
 * nothing has asked for it in a long while.
 */
const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function ogDirectory() {
  return THEI_SERVER.contentPath(
    THEI_CONTENT_DIRS.generatedMedia,
    OG_CARDS_DIR,
  );
}

export interface OgImageFile {
  filePath: string;
  etag: string;
}

/** A card as a page names it: its address with its version, and its words. */
export interface OgCardInfo {
  content: OgCardContent;
  version: string;
  url: string;
  alt: string;
}

/**
 * What a target's card is, without drawing it: `undefined` exactly where the
 * picture itself would be refused.
 */
export async function resolveOgCardInfo(
  target: OgTarget,
): Promise<OgCardInfo | undefined> {
  const content = await resolveOgContent(target);
  if (!content) return undefined;
  const version = ogCardVersion(content);
  return {
    content,
    version,
    url: `${buildOgImagePath(target)}?v=${version.slice(0, 12)}`,
    alt: content.alt,
  };
}

/**
 * Drops every card once, when the drawing code itself has changed.
 *
 * A file is named after what it shows, not after how it was drawn — no
 * generation of the engine belongs in a path on disk — so the sidecar holds
 * the drawing's own signature, checked once per process: the code cannot
 * change while it runs.
 */
let templateChecked: Promise<void> | undefined;
function ensureCurrentTemplate() {
  templateChecked ??= (async () => {
    const directory = ogDirectory();
    const signaturePath = join(directory, '.signature');
    const stored = await readFile(signaturePath, 'utf8').catch(() => '');
    if (stored === ogTemplateSignature) return;
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    await mkdir(directory, { recursive: true }).catch(() => {});
    await writeFile(signaturePath, ogTemplateSignature, 'utf8').catch(() => {});
  })();
  return templateChecked;
}

/** Cards being drawn right now, so a burst of requests draws each once. */
const drawing = new Map<string, Promise<void>>();

async function draw(content: OgCardContent, filePath: string) {
  // Drawing decodes pictures and rasterises the card: it waits its turn with
  // the rest of the media work, so a feed crawling every link at once cannot
  // take the site down.
  const buffer = await withProcessingSlot(AssetType.Image, async () =>
    renderOgPng((await composeOgCard(content)).node),
  );
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, buffer);
  await rename(tempPath, filePath).catch(async (error) => {
    await rm(tempPath, { force: true }).catch(() => {});
    const written = await stat(filePath).catch(() => undefined);
    if (!written) throw error;
  });
}

export async function ensureOgImage(
  target: OgTarget,
): Promise<OgImageFile | undefined> {
  await ensureCurrentTemplate();
  const info = await resolveOgCardInfo(target);
  if (!info) return undefined;
  const key = ogContentKey(info.content);
  const filePath = join(ogDirectory(), `${key}.png`);
  const etag = `"${info.version}"`;

  const existing = await stat(filePath).catch(() => undefined);
  if (existing) {
    // Touched at most once a day: the sweep below reads mtime, and a popular
    // card should not rewrite its own timestamp on every request.
    if (Date.now() - existing.mtimeMs > TOUCH_INTERVAL_MS)
      await utimes(filePath, new Date(), new Date()).catch(() => {});
    return { filePath, etag };
  }

  let pending = drawing.get(key);
  if (!pending) {
    pending = draw(info.content, filePath).finally(() => drawing.delete(key));
    drawing.set(key, pending);
  }
  await pending;
  return { filePath, etag };
}

/** Drops cards nothing has asked for in two months. */
export async function cleanupOgImages(): Promise<void> {
  const directory = ogDirectory();
  const entries = await readdir(directory).catch(() => []);
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const entry of entries) {
    // The sidecar is not a card: losing it would only force a needless redraw.
    if (entry === '.signature') continue;
    const filePath = join(directory, entry);
    const info = await stat(filePath).catch(() => undefined);
    if (info && info.isFile() && info.mtimeMs < cutoff)
      await rm(filePath, { force: true }).catch(() => {});
  }
}
