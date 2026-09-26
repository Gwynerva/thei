import { stat } from 'node:fs/promises';
import { withExternalLinkSlot } from '../assets/queue';
import type { externalLinks } from '../db/schema/external-links';
import { collectExternalLink } from './fetch';
import { externalLinkFaviconPath, writeExternalLinkFavicon } from './favicon';
import { upsertExternalLink } from './repository';

/** How many sites one step of the pass reads before reporting progress. */
const REFRESH_BATCH = 5;

export interface RefreshStoredExternalLinksOptions {
  /** Told after each batch, and once before the first. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
}

/**
 * Reads every stored site again, a few at a time: the one-off pass an update
 * makes over links an older version read another way, with other favicons,
 * or whose icon files an older backup left out.
 *
 * What a site said is never traded for less. A site that cannot be read now
 * keeps its stored title, description and state; only a favicon missing on
 * disk is replaced, with whatever icon can still be found. A link that fails
 * outright is skipped and keeps its record. Reads share the external-link
 * lane, so no more sites are asked at once than anywhere else.
 */
export async function refreshStoredExternalLinks(
  options: RefreshStoredExternalLinksOptions = {},
): Promise<{ total: number; failed: number }> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.externalLinks)
    .orderBy(schema.externalLinks.touchedAt)
    .all();
  const console = THEI_SERVER.console.tag('External links');
  await options.onProgress?.(0, rows.length);

  let done = 0;
  let failed = 0;
  for (let start = 0; start < rows.length; start += REFRESH_BATCH) {
    const batch = rows.slice(start, start + REFRESH_BATCH);
    await Promise.all(
      batch.map(async (row) => {
        try {
          await refreshStoredExternalLink(row);
        } catch (error) {
          failed += 1;
          console.error(
            `Could not read ${row.url} again: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
    done += batch.length;
    await options.onProgress?.(done, rows.length);
  }
  return { total: rows.length, failed };
}

async function refreshStoredExternalLink(
  row: typeof externalLinks.$inferSelect,
) {
  const collected = await withExternalLinkSlot(() =>
    collectExternalLink(row.url),
  );
  if (collected.status === 'fallback' && row.status !== 'fallback') {
    const hasIcon = await stat(externalLinkFaviconPath(row.faviconKey)).then(
      () => true,
      () => false,
    );
    if (hasIcon) return;
    const { faviconKey, accent } = await writeExternalLinkFavicon(
      row.url,
      collected.favicon,
    );
    upsertExternalLink({
      url: row.url,
      title: row.title ?? undefined,
      description: row.description ?? undefined,
      faviconKey,
      accent,
      status: row.status,
      touchedAt: Date.now(),
    });
    return;
  }
  const { faviconKey, accent } = await writeExternalLinkFavicon(
    row.url,
    collected.favicon,
  );
  upsertExternalLink({
    url: row.url,
    title: collected.title,
    description: collected.description,
    faviconKey,
    accent,
    status: collected.status,
    touchedAt: Date.now(),
  });
}
