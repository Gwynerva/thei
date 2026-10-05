import { and, asc, count, eq, gt, inArray, ne } from 'drizzle-orm';
import { canonicalizeContentData } from '#layers/thei/shared/content';
import type {
  OtherAssetUsageMeta,
  ShowcaseAssetUsageMeta,
} from '#layers/thei/shared/asset';
import {
  normalizePeriods,
  PERIOD_OWNER_TYPES,
} from '#layers/thei/shared/period';
import {
  normalizeCaptionText,
  normalizeHeadingText,
} from '#layers/thei/shared/terminal-punctuation';
import { refreshContentHistoryFingerprints } from './content/history';
import { periodsEqual, readPeriodsOf, replacePeriods } from './periods';

const PAGE_SIZE = 200;

type Db = ReturnType<typeof THEI_SERVER.useDb>['db'];
type Schema = ReturnType<typeof THEI_SERVER.useDb>['schema'];

export interface StoredPunctuationOptions {
  onProgress: (done: number, total: number) => void | Promise<void>;
  log: (message: string) => void;
}

/**
 * Settles the ending of every caption and heading stored before the rule
 * existed, as a save would settle it now (`shared/terminal-punctuation.ts`):
 * texts and their kept drafts and versions, the titles of projects, events,
 * pages and sections, the captions and titles of showcase tiles and files,
 * period labels, statuses and link notes.
 *
 * Only rows that change are written, and `updatedAt` is left alone: the words
 * are the owner's as they were, only their last mark moved. Running it again
 * writes nothing.
 */
export async function punctuateStoredTexts({
  onProgress,
  log,
}: StoredPunctuationOptions) {
  const { db, schema } = THEI_SERVER.useDb();
  const sources = countSources(db, schema);
  const total = Object.values(sources).reduce((sum, value) => sum + value, 0);
  const changed: Record<string, number> = {};
  let done = 0;
  const advance = async (by: number) => {
    done += by;
    await onProgress(done, total);
  };

  changed.texts = await punctuateContent(db, schema, log, advance);

  const historyStart = done;
  const history = await refreshContentHistoryFingerprints(
    (index) => onProgress(historyStart + index, total),
    (id) =>
      log(
        `A draft or version (${id}) could not be read and was left as it was.`,
      ),
  );
  changed.drafts = history.refreshed;
  done = historyStart + sources.history;

  changed.files = punctuateAssetUsages(db, schema);
  await advance(sources.files);

  changed.titles = punctuateTitles(db, schema);
  await advance(sources.titles);

  changed.periods = punctuatePeriods(db, schema, log);
  await advance(sources.periods);

  changed.statuses = rewriteColumn(
    db,
    db
      .select({ id: schema.statuses.id, text: schema.statuses.text })
      .from(schema.statuses)
      .where(eq(schema.statuses.kind, 'regular'))
      .all(),
    (row) => row.text,
    normalizeCaptionText,
    (tx, row, text) =>
      tx
        .update(schema.statuses)
        .set({ text })
        .where(eq(schema.statuses.id, row.id))
        .run(),
  );
  await advance(sources.statuses);

  changed.links = punctuateLinkNotes(db, schema);
  await advance(sources.links);

  return { changed, total };
}

function countSources(db: Db, schema: Schema) {
  const rows = (table: any, where?: any) =>
    db.select({ value: count() }).from(table).where(where).get()?.value ?? 0;
  return {
    content: rows(schema.content),
    history: rows(schema.contentHistory),
    files: rows(
      schema.assetUsages,
      inArray(schema.assetUsages.role, ['showcase-asset', 'other-asset']),
    ),
    titles:
      rows(schema.projects) +
      rows(schema.events) +
      rows(schema.pages) +
      rows(schema.projectContentSections),
    periods: rows(schema.periods),
    statuses: rows(schema.statuses, eq(schema.statuses.kind, 'regular')),
    links:
      rows(
        schema.projectExternalLinks,
        ne(schema.projectExternalLinks.note, ''),
      ) +
      rows(schema.eventExternalLinks, ne(schema.eventExternalLinks.note, '')) +
      rows(
        schema.profileExternalLinks,
        ne(schema.profileExternalLinks.note, ''),
      ),
  };
}

/** The saved texts, a page at a time: they are the largest rows there are. */
async function punctuateContent(
  db: Db,
  schema: Schema,
  log: (message: string) => void,
  advance: (by: number) => Promise<void>,
) {
  let changed = 0;
  let cursor = '';
  while (true) {
    const rows = db
      .select({
        contentUuid: schema.content.contentUuid,
        data: schema.content.data,
      })
      .from(schema.content)
      .where(gt(schema.content.contentUuid, cursor))
      .orderBy(asc(schema.content.contentUuid))
      .limit(PAGE_SIZE)
      .all();
    if (!rows.length) return changed;
    cursor = rows.at(-1)!.contentUuid;
    db.transaction((tx) => {
      for (const row of rows) {
        let data;
        try {
          data = canonicalizeContentData(row.data);
        } catch {
          log(
            `The text ${row.contentUuid} could not be read and was left as it was.`,
          );
          continue;
        }
        if (JSON.stringify(data) === JSON.stringify(row.data)) continue;
        tx.update(schema.content)
          .set({ data })
          .where(eq(schema.content.contentUuid, row.contentUuid))
          .run();
        changed++;
      }
    });
    await advance(rows.length);
  }
}

/** Showcase captions, and the titles and descriptions of other files. */
function punctuateAssetUsages(db: Db, schema: Schema) {
  const rows = db
    .select()
    .from(schema.assetUsages)
    .where(inArray(schema.assetUsages.role, ['showcase-asset', 'other-asset']))
    .all();
  return rewriteColumn(
    db,
    rows,
    (row) => JSON.stringify(row.meta),
    (value) => {
      const meta = JSON.parse(value) as
        ShowcaseAssetUsageMeta | OtherAssetUsageMeta | null;
      if (!meta) return value;
      const next = { ...meta };
      if (typeof meta.caption === 'string') {
        const caption = normalizeCaptionText(meta.caption);
        if (caption) next.caption = caption;
        else delete next.caption;
      }
      if ('title' in next && typeof next.title === 'string')
        next.title = normalizeHeadingText(next.title);
      return JSON.stringify(next);
    },
    (tx, row, meta) =>
      tx
        .update(schema.assetUsages)
        .set({ meta: JSON.parse(meta) })
        .where(
          and(
            eq(schema.assetUsages.assetUuid, row.assetUuid),
            eq(schema.assetUsages.containerType, row.containerType),
            eq(schema.assetUsages.containerId, row.containerId),
            eq(schema.assetUsages.role, row.role),
          ),
        )
        .run(),
  );
}

function punctuateTitles(db: Db, schema: Schema) {
  const tables = [
    [schema.projects, schema.projects.projectUuid],
    [schema.events, schema.events.eventUuid],
    [schema.pages, schema.pages.pageUuid],
    [schema.projectContentSections, schema.projectContentSections.sectionUuid],
  ] as const;
  let changed = 0;
  for (const [table, key] of tables) {
    const rows: { id: string; title: string }[] = db
      .select({ id: key, title: (table as any).title })
      .from(table as any)
      .all();
    changed += rewriteColumn(
      db,
      rows,
      (row) => row.title,
      normalizeHeadingText,
      (tx, row, title) =>
        tx
          .update(table as any)
          .set({ title })
          .where(eq(key, row.id))
          .run(),
    );
  }
  return changed;
}

/**
 * Period labels, owner by owner: two overlapping periods named alike once
 * their endings agree are one stretch, so each list is folded again as a
 * save would fold it.
 */
function punctuatePeriods(
  db: Db,
  schema: Schema,
  log: (message: string) => void,
) {
  let changed = 0;
  for (const ownerType of PERIOD_OWNER_TYPES) {
    const ownerIds = db
      .selectDistinct({ ownerId: schema.periods.ownerId })
      .from(schema.periods)
      .where(eq(schema.periods.ownerType, ownerType))
      .all()
      .map((row) => row.ownerId);
    for (let start = 0; start < ownerIds.length; start += PAGE_SIZE) {
      const owners = readPeriodsOf(
        db,
        schema,
        ownerType,
        ownerIds.slice(start, start + PAGE_SIZE),
      );
      db.transaction((tx) => {
        for (const [ownerId, periods] of owners) {
          let next;
          try {
            next = normalizePeriods(periods);
          } catch {
            log(
              `The periods of ${ownerType} ${ownerId} could not be read and were left as they were.`,
            );
            continue;
          }
          if (periodsEqual(periods, next)) continue;
          replacePeriods(tx, schema, ownerType, ownerId, next);
          changed++;
          if (next.length < periods.length)
            log(
              `The periods of ${ownerType} ${ownerId} named alike once their endings were settled were joined: ${periods.length} became ${next.length}.`,
            );
        }
      });
    }
  }
  return changed;
}

function punctuateLinkNotes(db: Db, schema: Schema) {
  const project = schema.projectExternalLinks;
  const event = schema.eventExternalLinks;
  const profile = schema.profileExternalLinks;
  return (
    rewriteColumn(
      db,
      db
        .select({
          owner: project.projectUuid,
          url: project.url,
          note: project.note,
        })
        .from(project)
        .where(ne(project.note, ''))
        .all(),
      (row) => row.note,
      normalizeCaptionText,
      (tx, row, note) =>
        tx
          .update(project)
          .set({ note })
          .where(
            and(eq(project.projectUuid, row.owner), eq(project.url, row.url)),
          )
          .run(),
    ) +
    rewriteColumn(
      db,
      db
        .select({ owner: event.eventUuid, url: event.url, note: event.note })
        .from(event)
        .where(ne(event.note, ''))
        .all(),
      (row) => row.note,
      normalizeCaptionText,
      (tx, row, note) =>
        tx
          .update(event)
          .set({ note })
          .where(and(eq(event.eventUuid, row.owner), eq(event.url, row.url)))
          .run(),
    ) +
    rewriteColumn(
      db,
      db
        .select({ url: profile.url, note: profile.note })
        .from(profile)
        .where(ne(profile.note, ''))
        .all(),
      (row) => row.note,
      normalizeCaptionText,
      (tx, row, note) =>
        tx.update(profile).set({ note }).where(eq(profile.url, row.url)).run(),
    )
  );
}

/** Writes back, in one transaction, every value the rule changes. */
function rewriteColumn<Row>(
  db: Db,
  rows: Row[],
  read: (row: Row) => string,
  normalize: (value: string) => string,
  write: (tx: any, row: Row, value: string) => void,
) {
  let changed = 0;
  db.transaction((tx) => {
    for (const row of rows) {
      const value = read(row);
      const next = normalize(value);
      if (next === value) continue;
      write(tx, row, next);
      changed++;
    }
  });
  return changed;
}
