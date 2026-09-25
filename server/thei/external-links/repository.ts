import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import {
  normalizeImageAccent,
  type ImageAccent,
} from '#layers/thei/shared/accent-color';
import { collectContentExternalLinkUrls } from '#layers/thei/shared/content';
import type { ResolvedContentLink } from '#layers/thei/shared/content-link';
import {
  normalizeExternalLinkUrl,
  type ExternalLink,
  type ExternalLinkListItem,
  type ExternalLinkStatus,
} from '#layers/thei/shared/external-link';
import { withExternalLinkSlot } from '../assets/queue';
import { collectExternalLink } from './fetch';
import {
  EXTERNAL_LINK_FAVICON_EXTENSION,
  externalLinkFaviconDir,
  externalLinkFaviconPath,
  externalLinkMedia,
  writeExternalLinkFavicon,
} from './favicon';

/**
 * A row younger than this is never swept: it may belong to a link that is
 * being added right now and has not been saved into anything yet.
 */
const SWEEP_GRACE_MS = 60_000;
/** How long after a save the sweep runs, so a burst of saves costs one. */
const SWEEP_DELAY_MS = 60_000;
const FAVICON_FILE = new RegExp(
  `^([a-f0-9]{64})\\.${EXTERNAL_LINK_FAVICON_EXTENSION}$`,
);

interface ExternalLinkRow {
  url: string;
  title: string | null;
  description: string | null;
  faviconKey: string;
  accent: ImageAccent | null;
  status: ExternalLinkStatus;
  touchedAt: number;
}

export function toExternalLink(row: ExternalLinkRow): ExternalLink {
  return {
    url: row.url,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    faviconMedia: externalLinkMedia(
      row.faviconKey,
      normalizeImageAccent(row.accent),
      row.touchedAt,
    ),
    status: row.status,
    touchedAt: row.touchedAt,
  };
}

export async function findExternalLink(
  url: string,
): Promise<ExternalLink | undefined> {
  const { db, schema } = THEI_SERVER.useDb();
  const row = await db.query.externalLinks.findFirst({
    where: eq(schema.externalLinks.url, url),
  });
  return row ? toExternalLink(row) : undefined;
}

export async function findExternalLinks(
  urls: Iterable<string>,
): Promise<Map<string, ExternalLink>> {
  const unique = [...new Set(urls)];
  if (!unique.length) return new Map();
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.externalLinks)
    .where(inArray(schema.externalLinks.url, unique))
    .all();
  return new Map(rows.map((row) => [row.url, toExternalLink(row)]));
}

/**
 * A loader for the links of one piece of content: every address is read
 * from the database once, however many blocks and anchors carry it.
 */
export function createExternalLinkLoader() {
  const cache = new Map<string, Promise<ExternalLink | undefined>>();
  return (url: string) => {
    let pending = cache.get(url);
    if (!pending) {
      pending = findExternalLink(url);
      cache.set(url, pending);
    }
    return pending;
  };
}

export function upsertExternalLink(data: {
  url: string;
  title?: string;
  description?: string;
  faviconKey: string;
  accent?: ImageAccent;
  status?: ExternalLinkStatus;
  touchedAt: number;
}) {
  const { db, schema } = THEI_SERVER.useDb();
  const status = data.status ?? 'complete';
  db.insert(schema.externalLinks)
    .values({ ...data, status })
    .onConflictDoUpdate({
      target: schema.externalLinks.url,
      set: {
        title: data.title,
        description: data.description,
        faviconKey: data.faviconKey,
        accent: data.accent ?? null,
        status,
        touchedAt: data.touchedAt,
      },
    })
    .run();
}

const inFlight = new Map<string, Promise<ExternalLink>>();

/**
 * Reads the site and stores what it said — the one way a remote page is
 * ever read. Callers asking about the same address at the same time share
 * one read, so nothing is fetched or written twice.
 */
export function refreshExternalLink(rawUrl: unknown): Promise<ExternalLink> {
  const url = normalizeExternalLinkUrl(rawUrl);
  const pending = inFlight.get(url);
  if (pending) return pending;
  const request = withExternalLinkSlot(() => storeExternalLink(url)).finally(
    () => {
      if (inFlight.get(url) === request) inFlight.delete(url);
    },
  );
  inFlight.set(url, request);
  return request;
}

async function storeExternalLink(url: string): Promise<ExternalLink> {
  const collected = await collectExternalLink(url);
  const { faviconKey, accent } = await writeExternalLinkFavicon(
    url,
    collected.favicon,
  );
  const touchedAt = Date.now();
  upsertExternalLink({
    url,
    title: collected.title,
    description: collected.description,
    faviconKey,
    accent,
    status: collected.status,
    touchedAt,
  });
  return {
    url,
    title: collected.title,
    description: collected.description,
    faviconMedia: externalLinkMedia(faviconKey, accent, touchedAt),
    status: collected.status,
    touchedAt,
  };
}

/** The stored record, read from the site only when there is none yet. */
export async function lookupExternalLink(
  rawUrl: unknown,
): Promise<ExternalLink> {
  const url = normalizeExternalLinkUrl(rawUrl);
  return (await findExternalLink(url)) ?? (await refreshExternalLink(url));
}

/**
 * Makes sure every address has a record, reading only the ones without
 * one. A site that cannot be read still gets a record, so a save never
 * fails over a link and the same site is never asked again on its own.
 */
export async function ensureExternalLinks(
  urls: Iterable<string>,
): Promise<void> {
  const unique = [...new Set(urls)];
  if (!unique.length) return;
  const known = await findExternalLinks(unique);
  await Promise.all(
    unique
      .filter((url) => !known.has(url))
      .map(async (url) => {
        try {
          await refreshExternalLink(url);
        } catch (error) {
          warn(`Failed to read ${url}`, error);
        }
      }),
  );
}

/** Every address an entity's manual links and action button point at. */
export function entityExternalLinkUrls(
  links: ExternalLinkListItem[] | undefined,
  action: { externalUrl?: string } | undefined,
): string[] {
  const urls = (links ?? []).map((link) => link.url);
  if (action?.externalUrl) urls.push(action.externalUrl);
  return urls;
}

export function toResolvedExternalLink(
  link: ExternalLink,
): ResolvedContentLink {
  return {
    kind: 'external',
    url: link.url,
    state: 'resolved',
    href: link.url,
    title: link.title,
    description: link.description,
    iconMedia: link.faviconMedia,
  };
}

/**
 * Every address something on the site still points at. This is the one list
 * of places a link can live: a row missing from it is an orphan, so a new
 * home for links has to be added here.
 */
export function collectUsedExternalLinkUrls(): Set<string> {
  const { db, schema } = THEI_SERVER.useDb();
  const used = new Set<string>();
  for (const table of [
    schema.projectExternalLinks,
    schema.eventExternalLinks,
    schema.profileExternalLinks,
  ]) {
    for (const row of db.select({ url: table.url }).from(table).all())
      used.add(row.url);
  }
  for (const { action } of [
    ...db
      .select({ action: schema.projects.action })
      .from(schema.projects)
      .all(),
    ...db.select({ action: schema.events.action }).from(schema.events).all(),
  ]) {
    if (typeof action?.externalUrl === 'string') used.add(action.externalUrl);
  }
  for (const row of db
    .select({ data: schema.content.data })
    .from(schema.content)
    .all()) {
    try {
      for (const url of collectContentExternalLinkUrls(row.data)) used.add(url);
    } catch (error) {
      warn('Skipped malformed content during the sweep', error);
    }
  }
  return used;
}

/**
 * Forgets links nothing points at any more, and the files of links that are
 * gone. Deletes only; a site is never read from here.
 */
export async function sweepExternalLinks(): Promise<void> {
  const { db, schema } = THEI_SERVER.useDb();
  const cutoff = Date.now() - SWEEP_GRACE_MS;
  const rows = db
    .select({
      url: schema.externalLinks.url,
      faviconKey: schema.externalLinks.faviconKey,
      touchedAt: schema.externalLinks.touchedAt,
    })
    .from(schema.externalLinks)
    .all();
  const used = collectUsedExternalLinkUrls();
  const kept = new Set<string>();
  const removed: string[] = [];
  for (const row of rows) {
    if (used.has(row.url) || row.touchedAt >= cutoff) {
      kept.add(row.faviconKey);
      continue;
    }
    try {
      db.delete(schema.externalLinks)
        .where(eq(schema.externalLinks.url, row.url))
        .run();
      removed.push(row.faviconKey);
    } catch (error) {
      // Something still points here that the list above does not know.
      kept.add(row.faviconKey);
      warn(`Could not forget ${row.url}`, error);
    }
  }
  await Promise.all(
    removed.map((key) =>
      rm(externalLinkFaviconPath(key), { force: true }).catch(() => {}),
    ),
  );
  await removeStrayFaviconFiles(kept, cutoff);
}

/**
 * Files no row points at, left behind by a crash between a delete and its
 * removal. A file still being written is protected by the same grace as a
 * fresh row, and anything that is not a favicon is left alone.
 */
async function removeStrayFaviconFiles(kept: Set<string>, cutoff: number) {
  const directory = externalLinkFaviconDir();
  const names = await readdir(directory).catch(() => [] as string[]);
  for (const name of names) {
    const key = FAVICON_FILE.exec(name)?.[1];
    if (!key || kept.has(key)) continue;
    const path = join(directory, name);
    const info = await stat(path).catch(() => undefined);
    if (!info || info.mtimeMs >= cutoff) continue;
    await rm(path, { force: true }).catch(() => {});
  }
}

/** A sweep that tells the log about a failure instead of throwing. */
export async function runExternalLinkSweep(): Promise<void> {
  try {
    await sweepExternalLinks();
  } catch (error) {
    warn('Failed to sweep external links', error);
  }
}

let sweepTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Runs a sweep once things have settled. Called after a save; a burst of
 * saves costs one sweep, and no request ever waits for it.
 */
export function scheduleExternalLinkSweep() {
  if (sweepTimer) return;
  sweepTimer = setTimeout(() => {
    sweepTimer = undefined;
    void runExternalLinkSweep();
  }, SWEEP_DELAY_MS);
  sweepTimer.unref?.();
}

function warn(message: string, error: unknown) {
  try {
    THEI_SERVER.console.tag('External links').warn(message, error);
  } catch {
    // Nothing to tell: the server is gone, as it is at the end of a test.
  }
}
