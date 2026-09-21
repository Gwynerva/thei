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
import { THEI_CONTENT_DIRS } from '../content-layout';
import {
  ogCardsSignature,
  ogSignatureHash,
  resolveOgCard,
  type OgTarget,
} from './cards';
import { renderOgPng } from './render';
import { buildOgCard, ogTemplateSignature } from './templates';

/**
 * Rendered cards, kept on disk under `generated-media`.
 *
 * They are derived files: reproducible from the content at any time, excluded
 * from backups by the content layout, and safe to delete. The file name is a
 * hash of everything the drawing depends on, so a card whose title, artwork or
 * site name changed is a different file and is drawn once; the old one is
 * swept when nothing has asked for it in a long while.
 */
const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function ogDirectory() {
  return THEI_SERVER.contentPath(THEI_CONTENT_DIRS.generatedMedia, 'og');
}

export interface OgImageFile {
  filePath: string;
  etag: string;
}

/**
 * Drops every card once, when the drawing code itself has changed.
 *
 * A file is named after what it shows, not after how it was drawn, so an
 * updated layout would keep serving the old pictures until they expired. The
 * sidecar holds the drawing's own hash; checked once per process, because the
 * code cannot change while it runs.
 */
let templateChecked: Promise<void> | undefined;
function ensureCurrentTemplate() {
  templateChecked ??= (async () => {
    const directory = ogDirectory();
    const signaturePath = join(directory, '.signature');
    const signature = ogSignatureHash(
      `${ogTemplateSignature()}|${ogCardsSignature()}`,
    );
    const stored = await readFile(signaturePath, 'utf8').catch(() => '');
    if (stored === signature) return;
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    await mkdir(directory, { recursive: true }).catch(() => {});
    await writeFile(signaturePath, signature, 'utf8').catch(() => {});
  })();
  return templateChecked;
}

export async function ensureOgImage(
  target: OgTarget,
): Promise<OgImageFile | undefined> {
  await ensureCurrentTemplate();
  const resolved = await resolveOgCard(target);
  if (!resolved) return undefined;
  const key = ogSignatureHash(resolved.signature);
  const filePath = join(ogDirectory(), `${key}.png`);
  const etag = `"${key}"`;

  const existing = await stat(filePath).catch(() => undefined);
  if (existing) {
    // Touched at most once a day: the sweep below reads mtime, and a popular
    // card should not rewrite its own timestamp on every request.
    if (Date.now() - existing.mtimeMs > TOUCH_INTERVAL_MS)
      await utimes(filePath, new Date(), new Date()).catch(() => {});
    return { filePath, etag };
  }

  const buffer = await renderOgPng(await buildOgCard(resolved.card));
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, buffer);
  await rename(tempPath, filePath).catch(async (error) => {
    await rm(tempPath, { force: true }).catch(() => {});
    const written = await stat(filePath).catch(() => undefined);
    if (!written) throw error;
  });
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
