import { createError } from 'h3';
import type Database from 'better-sqlite3';
import { inArray } from 'drizzle-orm';
import { AssetType, type AssetUsageMeta } from '../../../shared/asset';
import { resolveAdminPagination } from '../../../shared/admin/entity-list';
import {
  assetSelectionError,
  assetSourceKey,
  summarizeAssetUsages,
  type AssetSource,
  type AssetPlacement,
  type AssetLibraryItem,
  type AssetSelectionConstraints,
  type AssetLibraryAvailability,
  type AssetLibraryFilesResponse,
  type AssetLibraryFacets,
  type AssetLibraryFeedResponse,
  type AssetLibraryEntry,
  type AssetLibraryHere,
  type AssetLibraryOrder,
  type AssetLibraryPlace,
  ASSET_LIBRARY_FEED_PAGE,
  ASSET_LIBRARY_UTC_OFFSET_MAX,
  type AssetLibrarySourceFilter,
  type AssetUsagesResponse,
} from '../../../shared/asset-library';
import { normalizeAssetExtension } from '../../../shared/assets/formats';
import {
  dayQueryRank,
  parseDayQuery,
  shiftDay,
} from '../../../shared/day-query';
import {
  readLibrarySearch,
  type LibrarySearch,
  type LibrarySearchPart,
  type LibrarySearchPartKind,
} from '../../../shared/asset-library-search';
import { richTextToPlainText } from '../../../shared/rich-text';
import { useWordsSql } from '../search/words-sql';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '../../../shared/project-url';
import { buildEventUrl } from '../../../shared/event-url';
import { buildPageUrl } from '../../../shared/page-url';
import { buildDiaryUrl } from '../../../shared/diary-url';
import { buildTagUrl } from '../../../shared/tag-url';
import {
  buildExcerptAdminPath,
  buildExcerptParentUrl,
  buildExcerptUrl,
  type ExcerptParentAddress,
} from '../../../shared/excerpt-url';
import type { ExcerptParentType } from '../../../shared/excerpt';
import { describeStoredAsset } from './storage';
import { readAssetRetention } from './retention';

export interface LibraryQuery extends AssetSelectionConstraints {
  q?: string;
  type?: string;
  usage?: string;
  /** Only the groups of this kind of entity; sections listing only. */
  source?: AssetLibrarySourceFilter;
  page?: number;
}

// An excerpt about something private is private with it (`excerptAccess`).
const EXCERPT_SUBJECT_PRIVATE_SQL = ['first', 'second']
  .map((side) => {
    const other = side === 'first' ? 'second' : 'first';
    return `(r.${side}Type='excerpt' AND r.${side}Id=x.excerptUuid AND (
      (r.${other}Type='project' AND r.${other}Id IN (SELECT projectUuid FROM projects WHERE access='private'))
      OR (r.${other}Type='event' AND r.${other}Id IN (SELECT eventUuid FROM events WHERE access='private'))
      OR (r.${other}Type='diary-entry' AND r.${other}Id IN (SELECT diaryUuid FROM "diary-entries" WHERE access='private'))))`;
  })
  .join(' OR ');
const EXCERPT_PRIVATE_SQL = `(x.isPrivate OR EXISTS (SELECT 1 FROM "entity-relations" r WHERE ${EXCERPT_SUBJECT_PRIVATE_SQL}))`;

// Resolve owners in SQL. Only page assets and their placements are materialized;
// rendering the library never hydrates content or invokes media processing.
// A section or an excerpt is a source of its own, carrying what it is a part of as the parent; a private parent makes everything in it private, and a private subject its excerpts.
const ownersSql = `
WITH sources AS (
  SELECT 'project' AS sourceType, projectUuid AS sourceId, title, summary,
    humanReadableSlug AS slug, publicId, updatedAt, access='private' AS sourcePrivate,
    '' AS parentId, '' AS parentTitle, '' AS parentSlug, '' AS parentPublicId, '' AS parentType FROM projects
  UNION ALL SELECT 'event',eventUuid,title,summary,humanReadableSlug,publicId,updatedAt,access='private','','','','','' FROM events
  UNION ALL SELECT 'page',pageUuid,title,summary,slug,'',updatedAt,access='private','','','','','' FROM pages
  UNION ALL SELECT 'diary-entry',diaryUuid,date,'',date,'',updatedAt,access='private','','','','','' FROM "diary-entries"
  UNION ALL SELECT 'tag',tagUuid,title,description,slug,publicId,0,0,'','','','','' FROM tags
  UNION ALL SELECT 'profile',profileId,displayName,slogan,'','',0,0,'','','','','' FROM profiles
  UNION ALL SELECT 'ai-session',sessionUuid,title,'','','',lastActiveAt,1,'','','','','' FROM "ai-sessions"
  UNION ALL SELECT 'project-section',se.sectionUuid,se.title,se.summary,se.humanReadableSlug,se.publicId,se.updatedAt,
    (se.isPrivate OR p.access='private'),p.projectUuid,p.title,p.humanReadableSlug,p.publicId,'project'
    FROM "project-content-sections" se JOIN projects p ON p.projectUuid=se.projectUuid
  UNION ALL SELECT 'excerpt',x.excerptUuid,x.title,x.summary,x.humanReadableSlug,x.publicId,x.updatedAt,
    (${EXCERPT_PRIVATE_SQL} OR p.access='private'),p.projectUuid,p.title,p.humanReadableSlug,p.publicId,'project'
    FROM excerpts x JOIN projects p ON x.parentType='project' AND p.projectUuid=x.parentId
  UNION ALL SELECT 'excerpt',x.excerptUuid,x.title,x.summary,x.humanReadableSlug,x.publicId,x.updatedAt,
    (${EXCERPT_PRIVATE_SQL} OR e.access='private'),e.eventUuid,e.title,e.humanReadableSlug,e.publicId,'event'
    FROM excerpts x JOIN events e ON x.parentType='event' AND e.eventUuid=x.parentId
  UNION ALL SELECT 'excerpt',x.excerptUuid,x.title,x.summary,x.humanReadableSlug,x.publicId,x.updatedAt,
    (${EXCERPT_PRIVATE_SQL} OR d.access='private'),d.diaryUuid,d.date,d.date,'','diary-entry'
    FROM excerpts x JOIN "diary-entries" d ON x.parentType='diary-entry' AND d.diaryUuid=x.parentId
),
contexts AS (
  SELECT sourceType AS containerType,sourceId AS containerId,sourceType,sourceId,'' AS detail,'' AS description FROM sources
  UNION ALL SELECT 'content',c.contentUuid,c.ownerType,c.ownerId,'','' FROM content c
  UNION ALL SELECT 'profile-avatar',a.id,'profile',p.profileId,'avatar','' FROM "profile-avatars" a CROSS JOIN profiles p
  UNION ALL SELECT 'profile-status',a.id,'profile',a.ownerId,'status',coalesce(a.text,'') FROM statuses a WHERE a.ownerType='profile'
  UNION ALL SELECT 'project-status',a.id,'project',a.ownerId,'status',coalesce(a.text,'') FROM statuses a WHERE a.ownerType='project'
),
placements AS (
  SELECT u.assetUuid,u.role,u.meta,u.containerType,u.containerId,s.*,c.detail,c.description
  FROM "asset-usages" u JOIN contexts c ON c.containerType=u.containerType AND c.containerId=u.containerId
  JOIN sources s ON s.sourceType=c.sourceType AND s.sourceId=c.sourceId
),
members AS (
  SELECT DISTINCT assetUuid,sourceType,sourceId FROM placements
  UNION ALL SELECT a.assetUuid,'unused','all' FROM assets a
    WHERE a.settings IS NOT NULL AND NOT EXISTS (SELECT 1 FROM placements p WHERE p.assetUuid=a.assetUuid)
)
`;
/**
 * Matches an asset by the text the site itself gives it: captions and titles
 * of its placements, captions and titles inside editor blocks — of a file in
 * a group, the group's title too — and the titles of whatever holds it. A diary entry has no title: it is found by its day, written in
 * any way (`day-query.ts`), and never by the characters of its stored date,
 * so a lone `0` or `-` does not find every entry. What the uploaded file
 * was called is never kept, so it is never searchable. The file's own
 * description, kept for its family, finds it wherever it is placed.
 * `scoped` restricts the match by placements to the member row's own
 * source. Takes the query five times. Words are found as words
 * (`thei_words`, `server/thei/search/words-sql.ts`).
 */
function siteTextMatchSql(scoped: boolean) {
  const scope = scoped
    ? ' AND p.sourceType=m.sourceType AND p.sourceId=m.sourceId'
    : '';
  return `(EXISTS (
      SELECT 1 FROM placements p WHERE p.assetUuid=a.assetUuid${scope}
      AND (thei_words(asset_search_text(CASE WHEN p.sourceType='diary-entry' THEN '' ELSE coalesce(p.title,'') END || ' ' || coalesce(p.summary,'') || ' ' || p.description || ' ' || coalesce(json_extract(p.meta,'$.caption'),'') || ' ' || coalesce(json_extract(p.meta,'$.title'),'')),?)
        OR (p.sourceType='diary-entry' AND asset_day_match(p.slug,?))))
    OR EXISTS (
      SELECT 1 FROM placements p JOIN content c ON p.containerType='content' AND c.contentUuid=p.containerId,
        json_each(c.data,'$.blocks') b
      WHERE p.assetUuid=a.assetUuid${scope} AND (
        (json_extract(b.value,'$.data.asset.assetUuid')=a.assetUuid AND
          thei_words(asset_search_text(coalesce(json_extract(b.value,'$.data.caption'),'') || ' ' || coalesce(json_extract(b.value,'$.data.title'),'')),?))
        OR EXISTS (SELECT 1 FROM json_each(b.value,'$.data.items') i
          WHERE json_extract(i.value,'$.asset.assetUuid')=a.assetUuid
            AND thei_words(asset_search_text(coalesce(json_extract(i.value,'$.caption'),'') || ' ' || coalesce(json_extract(i.value,'$.title'),'') || ' ' || coalesce(json_extract(b.value,'$.data.title'),'')),?))
      )
    )
    OR EXISTS (
      SELECT 1 FROM "asset-descriptions" d WHERE d.familyUuid=a.familyUuid
      AND thei_words(d.text,?)
    ))`;
}
const registered = new WeakSet<Database.Database>();
function connection() {
  const context = THEI_SERVER.useDb();
  if (!registered.has(context.rawDb)) {
    context.rawDb.function(
      'asset_search_text',
      { deterministic: true },
      // Captions are rich text: their markup is not what anyone searches for.
      (value: unknown) =>
        typeof value === 'string' ? richTextToPlainText(value) : '',
    );
    useWordsSql(context.rawDb);
    // Asked once per diary placement with the same query each time, so the
    // query is read once.
    let lastQuery: string | undefined;
    let lastDay: ReturnType<typeof parseDayQuery>;
    context.rawDb.function(
      'asset_day_match',
      { deterministic: true },
      (date: unknown, query: unknown) => {
        if (typeof date !== 'string' || typeof query !== 'string') return 0;
        if (query !== lastQuery) {
          lastQuery = query;
          lastDay = parseDayQuery(query);
        }
        return lastDay && dayQueryRank(date, lastDay) !== undefined ? 1 : 0;
      },
    );
    registered.add(context.rawDb);
  }
  return context;
}
/**
 * What a listing matches. `scoped` reads it per member row, a file in one
 * source, as the groups are listed; otherwise per file. A kind of entity
 * (`source`) is the member row's kind in a group listing, and any placement
 * of the file in an entity of that kind in a flat one.
 */
function matchSql(query: LibraryQuery, scoped = false) {
  const parts = ['a.settings IS NOT NULL'];
  const args: (string | number)[] = [];
  if (query.imageOnly) {
    parts.push('a.type=?');
    args.push(AssetType.Image);
  } else if (query.sizeLimitPolicy === 'media') {
    parts.push('a.type IN (?,?)');
    args.push(AssetType.Image, AssetType.Video);
  }
  if (query.acceptedExtensions && query.acceptedExtensions !== '*') {
    const extensions = [
      ...new Set(
        query.acceptedExtensions.map(normalizeAssetExtension).filter(Boolean),
      ),
    ];
    if (!extensions.length) parts.push('0');
    else {
      parts.push(
        `lower(a.extension) IN (${extensions.map(() => '?').join(',')})`,
      );
      args.push(...extensions);
    }
  }
  if (query.type) {
    parts.push('a.type=?');
    args.push(query.type);
  }
  const q = (query.q ?? '').replace(/\s+/g, ' ').trim();
  if (q) {
    parts.push(siteTextMatchSql(scoped));
    args.push(q, q, q, q, q);
  }
  if (query.source) {
    parts.push(
      scoped
        ? 'm.sourceType=?'
        : 'EXISTS (SELECT 1 FROM placements p WHERE p.assetUuid=a.assetUuid AND p.sourceType=?)',
    );
    args.push(query.source);
  }
  if (query.usage === 'used')
    parts.push(
      'EXISTS (SELECT 1 FROM placements p WHERE p.assetUuid=a.assetUuid)',
    );
  if (query.usage === 'unused')
    parts.push(
      'NOT EXISTS (SELECT 1 FROM placements p WHERE p.assetUuid=a.assetUuid)',
    );
  return { where: parts.join(' AND '), args };
}
interface SourceRow {
  sourceType: AssetSource['type'];
  sourceId: string;
  title: string | null;
  summary: string | null;
  slug: string;
  publicId: string;
  updatedAt: number;
  sourcePrivate: number;
  /** The project of a section, the parent of an excerpt; empty for every other source. */
  parentId: string;
  parentTitle: string;
  parentSlug: string;
  parentPublicId: string;
  /** Which kind the parent of an excerpt is; empty otherwise. */
  parentType: '' | ExcerptParentType;
}
interface PlacementRow extends SourceRow {
  assetUuid: string;
  role: AssetPlacement['role'];
  meta: string | null;
  detail: '' | 'avatar' | 'status';
}
function sourceInfo(row: SourceRow): AssetSource {
  const { sourceType: type, sourceId: id, slug, publicId } = row;
  const base = {
    type,
    id,
    title: row.title ?? '',
    summary: row.summary ?? '',
    updatedAt: row.updatedAt,
  };
  if (type === 'project-section') {
    // A section has no editor of its own: the project's editor opens with
    // its modal already up, as the admin bar does.
    return {
      ...base,
      url: buildProjectSectionUrl(
        row.parentSlug,
        row.parentPublicId,
        slug,
        publicId,
      ),
      editUrl: `/admin/projects/${row.parentId}/edit/?section=${encodeURIComponent(publicId)}`,
      parent: {
        title: row.parentTitle,
        url: buildProjectUrl(row.parentSlug, row.parentPublicId),
      },
    };
  }
  if (type === 'excerpt' && row.parentType) {
    // An excerpt has no editor of its own either: its parent's form opens
    // with its modal already up. A diary parent is named by its day.
    const parent: ExcerptParentAddress =
      row.parentType === 'diary-entry'
        ? { type: 'diary-entry', date: row.parentSlug }
        : {
            type: row.parentType,
            humanReadableSlug: row.parentSlug,
            publicId: row.parentPublicId,
          };
    return {
      ...base,
      url: buildExcerptUrl(parent, slug, publicId),
      editUrl: buildExcerptAdminPath(row.parentType, row.parentId, publicId),
      parent: { title: row.parentTitle, url: buildExcerptParentUrl(parent) },
    };
  }
  const url =
    type === 'project'
      ? buildProjectUrl(slug, publicId)
      : type === 'event'
        ? buildEventUrl(slug, publicId)
        : type === 'page'
          ? buildPageUrl(slug)
          : type === 'diary-entry'
            ? buildDiaryUrl(slug)
            : type === 'tag'
              ? buildTagUrl(slug, publicId)
              : type === 'profile'
                ? '/'
                : undefined;
  if (type === 'ai-session')
    return { ...base, editUrl: `/admin/ai/?session=${encodeURIComponent(id)}` };
  const editUrl =
    type === 'unused'
      ? undefined
      : type === 'profile'
        ? '/admin/about/'
        : type === 'diary-entry'
          ? `/admin/diary/${id}/edit/`
          : `/admin/${type === 'page' ? 'pages' : type === 'tag' ? 'tags' : type + 's'}/${id}/edit/`;
  return { ...base, url, editUrl };
}
/**
 * One use of a file with what holds it, as the library resolves it: the
 * place, the container the use is kept in, its meta, and the text of a
 * status the file is the picture of. What a place says of the file is read
 * from these (`place-words.ts`).
 */
export interface AssetPlaceUse {
  source: AssetSource;
  role: AssetPlacement['role'];
  containerType: string;
  containerId: string;
  meta: AssetUsageMeta | null;
  /** The whole place is the owner's alone. */
  sourcePrivate: boolean;
  statusText?: string;
}
export function readAssetPlaceUses(assetUuid: string): AssetPlaceUse[] {
  const rows = connection()
    .rawDb.prepare(
      ownersSql +
        `SELECT * FROM placements WHERE assetUuid=? ORDER BY sourceType,sourceId,containerType,containerId,role`,
    )
    .all(assetUuid) as (PlacementRow & {
    containerType: string;
    containerId: string;
    description: string;
  })[];
  return rows.map((row) => ({
    source: sourceInfo(row),
    role: row.role,
    containerType: row.containerType,
    containerId: row.containerId,
    meta: row.meta ? (JSON.parse(row.meta) as AssetUsageMeta) : null,
    sourcePrivate: Boolean(row.sourcePrivate),
    ...(row.detail === 'status' && row.description
      ? { statusText: row.description }
      : {}),
  }));
}
/** Where each of the files is placed, by the file's uuid. */
export function readPlacements(ids: string[]) {
  const result = new Map<string, AssetPlacement[]>();
  if (!ids.length) return result;
  const rows = connection()
    .rawDb.prepare(
      ownersSql +
        `SELECT * FROM placements WHERE assetUuid IN (${ids.map(() => '?').join(',')}) ORDER BY sourceType,sourceId,containerType,containerId,role`,
    )
    .all(...ids) as PlacementRow[];
  for (const row of rows) {
    const meta = row.meta ? (JSON.parse(row.meta) as AssetUsageMeta) : null;
    const refs = meta && 'refs' in meta ? meta.refs : undefined;
    const base: Omit<AssetPlacement, 'count' | 'isPrivate'> = {
      source: sourceInfo(row),
      role: row.role,
      detail: row.detail || undefined,
    };
    const uses = result.get(row.assetUuid) ?? [];
    const parentPrivate = Boolean(row.sourcePrivate);
    const groups = refs
      ? [false, true].map((isPrivate) => ({
          count: refs.filter((r) => Boolean(r.isPrivate) === isPrivate).length,
          isPrivate: parentPrivate || isPrivate,
        }))
      : [
          {
            count: 1,
            isPrivate:
              parentPrivate ||
              Boolean(meta && 'isPrivate' in meta && meta.isPrivate),
          },
        ];
    for (const group of groups)
      if (group.count) uses.push({ ...base, ...group });
    result.set(row.assetUuid, uses);
  }
  return result;
}
function readItems(
  ids: string[],
  query: AssetSelectionConstraints = {},
  placements = readPlacements(ids),
) {
  if (!ids.length) return [];
  const { db, schema } = connection();
  const rows = db
    .select()
    .from(schema.assets)
    .where(inArray(schema.assets.assetUuid, ids))
    .all();
  const previews = db
    .select()
    .from(schema.assetUsages)
    .where(inArray(schema.assetUsages.containerId, ids))
    .all()
    .filter((u) => u.containerType === 'asset' && u.role === 'preview');
  const retention = readAssetRetention(rows);
  const items = new Map<string, AssetLibraryItem>();
  for (const row of rows) {
    const uses = placements.get(row.assetUuid) ?? [];
    items.set(row.assetUuid, {
      asset: describeStoredAsset(
        row,
        previews.find((p) => p.containerId === row.assetUuid)?.assetUuid,
      ),
      touchedAt: row.touchedAt,
      ...retention.get(row.assetUuid),
      ...summarizeAssetUsages(uses),
      roles: [...new Set(uses.map((p) => p.role))],
      selectionError: assetSelectionError(row, query),
    });
  }
  return ids.flatMap((id) => {
    const item = items.get(id);
    return item ? [item] : [];
  });
}
function pageIds(
  from: string,
  args: (string | number)[],
  query: LibraryQuery,
  pageSize: number,
) {
  const { rawDb } = connection();
  const total = (
    rawDb
      .prepare(ownersSql + `SELECT count(*) AS total FROM (${from})`)
      .get(...args) as { total: number }
  ).total;
  const page = resolveAdminPagination(total, { page: query.page, pageSize });
  const rows = rawDb
    .prepare(
      ownersSql +
        from +
        ' ORDER BY a.touchedAt DESC,a.assetUuid LIMIT ? OFFSET ?',
    )
    .all(...args, page.pageSize, (page.page - 1) * page.pageSize) as {
    assetUuid: string;
  }[];
  return { ...page, ids: rows.map((r) => r.assetUuid) };
}
/**
 * The library as a flat list of files, the ones used last first, a page at
 * a time: what an app finds files by (`find_files`).
 */
export function listLibraryAssets(
  query: LibraryQuery = {},
): AssetLibraryFilesResponse {
  const { where, args } = matchSql(query);
  const { ids, ...page } = pageIds(
    `SELECT a.assetUuid,a.touchedAt FROM assets a WHERE ${where}`,
    args,
    query,
    40,
  );
  return { ...page, items: readItems(ids, query) };
}
/** The days places stand at (`AssetLibraryPlace`), to follow `ownersSql`. */
const placeDatesSql = `,
event_dates AS (SELECT ownerId AS id,min(startDate) AS date FROM periods WHERE ownerType='event' GROUP BY ownerId),
section_dates AS (SELECT ownerId AS id,min(startDate) AS date FROM periods WHERE ownerType='project-section' GROUP BY ownerId),
project_dates AS (SELECT se.projectUuid AS id,min(sd.date) AS date
  FROM "project-content-sections" se JOIN section_dates sd ON sd.id=se.sectionUuid GROUP BY se.projectUuid)
`;
/**
 * The reader's day of a moment kept in milliseconds, as SQL. The offset is a
 * whole number of minutes, so it goes into the statement as a number.
 */
function readerDaySql(column: string, utcOffset: number) {
  const seconds = utcOffset * 60;
  const shift = seconds ? `${seconds > 0 ? '+' : '-'}${Math.abs(seconds)}` : '';
  return `date(${column}/1000${shift},'unixepoch')`;
}
/**
 * The day a place stands at: a dated entity's own; a file nothing holds, the
 * day it was uploaded, and a session, the day it was last active — both as
 * the reader's calendar reads them.
 */
function placeDateSql(utcOffset: number) {
  return `CASE m.sourceType
  WHEN 'diary-entry' THEN s.slug
  WHEN 'event' THEN (SELECT date FROM event_dates WHERE id=m.sourceId)
  WHEN 'project' THEN (SELECT date FROM project_dates WHERE id=m.sourceId)
  WHEN 'project-section' THEN coalesce((SELECT date FROM section_dates WHERE id=m.sourceId),
    (SELECT date FROM project_dates WHERE id=s.parentId))
  WHEN 'excerpt' THEN CASE s.parentType
    WHEN 'diary-entry' THEN s.parentSlug
    WHEN 'event' THEN (SELECT date FROM event_dates WHERE id=s.parentId)
    WHEN 'project' THEN (SELECT date FROM project_dates WHERE id=s.parentId) END
  WHEN 'unused' THEN ${readerDaySql('a.createdAt', utcOffset)}
  WHEN 'ai-session' THEN ${readerDaySql('s.updatedAt', utcOffset)}
END`;
}

export interface LibraryFeedQuery extends LibraryQuery {
  order?: AssetLibraryOrder;
  /** Where in the whole run the answer starts. */
  offset?: number;
  /** Start at the first place of this year instead, `YYYY`. */
  year?: string;
  /** The first answer of a search: facets, years, here and recent too. */
  head?: boolean;
  here?: AssetLibraryHere;
  /**
   * The reader's clock, in minutes ahead of UTC (UTC+3 is 180): the days of
   * uploads and sessions are theirs, and «вчера» is counted from their
   * today. UTC's by default.
   */
  utcOffset?: number;
}
/** The reader's offset from UTC, a whole number of minutes within reach. */
function readerOffset(query: LibraryFeedQuery): number {
  const minutes = Math.trunc(query.utcOffset ?? 0);
  return Number.isFinite(minutes) &&
    Math.abs(minutes) <= ASSET_LIBRARY_UTC_OFFSET_MAX
    ? minutes
    : 0;
}
/** The reader's today. */
function readerToday(utcOffset: number) {
  return new Date(Date.now() + utcOffset * 60_000).toISOString().slice(0, 10);
}
interface FeedRow {
  sourceType: AssetSource['type'];
  sourceId: string;
  assetUuid: string;
  touchedAt: number;
  placeDate: string | null;
  /** The place is named by the words of the search. */
  titleHit?: number;
}
/**
 * Every file in each of its places that the search finds, with the day of
 * the place: what the library runs through. `without` leaves out one filter,
 * for counting what each of its choices would give.
 */
function feedSql(
  query: LibraryFeedQuery,
  search: LibrarySearch,
  without?: 'type' | 'where',
) {
  const base = matchSql(
    {
      ...query,
      q: search.words,
      ...(without === 'type' ? { type: undefined } : {}),
      ...(without === 'where' ? { source: undefined, usage: undefined } : {}),
    },
    true,
  );
  const parts = [base.where];
  const args: (string | number)[] = [...base.args];
  const utcOffset = readerOffset(query);
  const today = readerToday(utcOffset);
  // A word read as a filter may as well be one the owner wrote: «вчера» in a
  // caption, «видео» in a description. Each part is its filter or its own
  // words, and the parts of one kind are any of them — so reading a search
  // never loses what its words alone would find.
  const kinds = new Map<LibrarySearchPartKind, LibrarySearchPart[]>();
  for (const part of search.parts) {
    if (part.kind === 'type' && without === 'type') continue;
    if (part.kind === 'place' && without === 'where') continue;
    kinds.set(part.kind, [...(kinds.get(part.kind) ?? []), part]);
  }
  for (const group of kinds.values()) {
    const either: string[] = [];
    for (const part of group) {
      const filter = partFilterSql(part, today, utcOffset);
      either.push(filter.sql, siteTextMatchSql(true));
      args.push(...filter.args, ...Array<string>(5).fill(part.text));
    }
    parts.push(`(${either.join(' OR ')})`);
  }
  // A place whose own name holds the words — a section, an event, with its
  // project — is what the search most likely means: it comes first. A diary
  // entry is named by its day, which the day of a search finds instead.
  const titleHit = search.words
    ? `CASE WHEN m.sourceType IN ('diary-entry','unused') THEN 0 ELSE
        thei_words(asset_search_text(coalesce(s.title,'') || ' ' || coalesce(s.parentTitle,'')),?) END`
    : '0';
  const titleArgs = search.words ? [search.words] : [];
  return {
    // A file's family stands together in a place, as long ago as the one of
    // it used last, its variants first and the file as uploaded last: an
    // upload stores its variant and its original in one go, in either order.
    sql: `SELECT m.sourceType,m.sourceId,a.assetUuid,a.touchedAt,a.type AS assetType,
      a.familyUuid,a.createdAt,
      coalesce(json_extract(a.settings,'$.type')='original',0) AS isOriginal,
      max(a.touchedAt) OVER (PARTITION BY m.sourceType,m.sourceId,a.familyUuid) AS familyTouchedAt,
      ${placeDateSql(utcOffset)} AS placeDate,${titleHit} AS titleHit
      FROM members m JOIN assets a ON a.assetUuid=m.assetUuid
      LEFT JOIN sources s ON s.sourceType=m.sourceType AND s.sourceId=m.sourceId
      WHERE ${parts.join(' AND ')}`,
    args: [...titleArgs, ...args],
  };
}
/** What one part of a search narrows to, over a member row and its file. */
function partFilterSql(
  part: LibrarySearchPart,
  today: string,
  utcOffset: number,
): { sql: string; args: (string | number)[] } {
  switch (part.kind) {
    case 'date':
      return {
        sql: `asset_day_match(${placeDateSql(utcOffset)},?)`,
        args: [part.value],
      };
    case 'uploaded':
      return {
        sql: `${readerDaySql('a.createdAt', utcOffset)}=?`,
        args: [shiftDay(today, part.value)],
      };
    case 'type':
      return { sql: 'a.type=?', args: [part.value] };
    case 'extension':
      return { sql: 'lower(a.extension)=?', args: [part.value] };
    case 'place':
      return {
        sql: `m.sourceType IN (${part.value.map(() => '?').join(',')})`,
        args: part.value,
      };
  }
}
const FEED_PREFIX = () => ownersSql + placeDatesSql;
/**
 * Files in one place: the families used last first, each together, its
 * variants newest first and the file as uploaded last — so a variant always
 * stands before its original, whenever either was stored.
 */
const FAMILY_ORDER =
  'familyTouchedAt DESC,familyUuid,isOriginal,createdAt DESC,assetUuid';
function feedOrder(order: AssetLibraryOrder = 'new') {
  const way = order === 'old' ? 'ASC' : 'DESC';
  // Places the search names come first, then the run through time.
  return ` ORDER BY titleHit DESC,placeDate IS NULL,placeDate ${way},sourceType,sourceId,${FAMILY_ORDER}`;
}
/** The places of rows, read with what the library says of them. */
function readFeedPlaces(rows: FeedRow[]) {
  const places = new Map<string, AssetLibraryPlace>();
  const keys = [
    ...new Set(
      rows
        .filter((row) => row.sourceType !== 'unused')
        .map((row) => `${row.sourceType}:${row.sourceId}`),
    ),
  ];
  if (keys.length) {
    const sources = connection()
      .rawDb.prepare(
        ownersSql +
          `SELECT * FROM sources WHERE sourceType||':'||sourceId IN (${keys.map(() => '?').join(',')})`,
      )
      .all(...keys) as SourceRow[];
    for (const row of sources)
      places.set(`${row.sourceType}:${row.sourceId}`, sourceInfo(row));
  }
  places.set('unused:all', {
    type: 'unused',
    id: 'all',
    title: '',
    summary: '',
    updatedAt: 0,
  });
  return places;
}
/** Rows as entries: each file once per place, with its roles there. */
function readFeedEntries(
  rows: FeedRow[],
  query: LibraryFeedQuery,
): AssetLibraryEntry[] {
  const ids = [...new Set(rows.map((row) => row.assetUuid))];
  const placements = readPlacements(ids);
  const items = new Map(
    readItems(ids, query, placements).map((item) => [
      item.asset.assetUuid,
      item,
    ]),
  );
  const places = readFeedPlaces(rows);
  return rows.flatMap((row) => {
    const item = items.get(row.assetUuid);
    const key = `${row.sourceType}:${row.sourceId}`;
    const place = places.get(key);
    if (!item || !place) return [];
    return [
      {
        ...item,
        roles: [
          ...new Set(
            (placements.get(row.assetUuid) ?? [])
              .filter((p) => assetSourceKey(p.source) === key)
              .map((p) => p.role),
          ),
        ],
        place: {
          ...place,
          ...(row.placeDate ? { date: row.placeDate } : {}),
          ...(row.titleHit ? { named: true } : {}),
        },
      },
    ];
  });
}
/**
 * What is being edited and what it reaches: the entity, its sections and
 * excerpts, and every entity it is related to either way.
 */
function hereKeys(here: AssetLibraryHere): string[] {
  const { rawDb } = connection();
  const keys = new Set([`${here.type}:${here.id}`]);
  if (here.type === 'project')
    for (const row of rawDb
      .prepare(
        `SELECT sectionUuid AS id FROM "project-content-sections" WHERE projectUuid=?`,
      )
      .all(here.id) as { id: string }[])
      keys.add(`project-section:${row.id}`);
  for (const row of rawDb
    .prepare(
      `SELECT excerptUuid AS id FROM excerpts WHERE parentType=? AND parentId=?`,
    )
    .all(here.type, here.id) as { id: string }[])
    keys.add(`excerpt:${row.id}`);
  for (const row of rawDb
    .prepare(
      `SELECT secondType AS type,secondId AS id FROM "entity-relations" WHERE firstType=? AND firstId=?
       UNION SELECT firstType,firstId FROM "entity-relations" WHERE secondType=? AND secondId=?`,
    )
    .all(here.type, here.id, here.type, here.id) as {
    type: string;
    id: string;
  }[])
    keys.add(`${row.type}:${row.id}`);
  return [...keys];
}
const HERE_LIMIT = 48;
const RECENT_LIMIT = 12;
/**
 * The library as one run through time (`AssetLibraryFeedResponse`): files in
 * their places, the places by their days, the newest first unless asked
 * otherwise; places without a day come last. A file the selection cannot
 * take by its kind is not listed at all; one too large still is, since a
 * smaller variant of it can be made.
 */
export function listLibraryFeed(
  query: LibraryFeedQuery = {},
): AssetLibraryFeedResponse {
  const { rawDb } = connection();
  const search = readLibrarySearch(query.q ?? '');
  const feed = feedSql(query, search);
  const prefix = FEED_PREFIX();
  const total = (
    rawDb
      .prepare(prefix + `SELECT count(*) AS total FROM (${feed.sql})`)
      .get(...feed.args) as { total: number }
  ).total;
  let offset = Math.max(0, Math.floor(query.offset ?? 0));
  if (query.year && /^\d{4}$/.test(query.year)) {
    const before = query.order === 'old' ? '<' : '>';
    offset = (
      rawDb
        .prepare(
          prefix +
            `SELECT count(*) AS count FROM (${feed.sql}) WHERE titleHit=1 OR substr(placeDate,1,4)${before}?`,
        )
        .get(...feed.args, query.year) as { count: number }
    ).count;
  }
  const rows = rawDb
    .prepare(
      prefix +
        `SELECT sourceType,sourceId,assetUuid,touchedAt,placeDate,titleHit FROM (${feed.sql})` +
        feedOrder(query.order) +
        ' LIMIT ? OFFSET ?',
    )
    .all(...feed.args, ASSET_LIBRARY_FEED_PAGE, offset) as FeedRow[];
  const result: AssetLibraryFeedResponse = {
    entries: readFeedEntries(rows, query),
    offset,
    total,
  };
  if (!query.head) return result;
  result.facets = feedFacets(query, search);
  const years = rawDb
    .prepare(
      prefix +
        `SELECT coalesce(substr(placeDate,1,4),'') AS year,count(*) AS count FROM (${feed.sql})
         GROUP BY year ORDER BY year='',year ${query.order === 'old' ? 'ASC' : 'DESC'}`,
    )
    .all(...feed.args) as { year: string; count: number }[];
  result.years = years;
  // What is here and what was used lately stand above the run while the
  // search is still empty: the files most often wanted.
  if (search.words || search.parts.length) return result;
  if (query.here) {
    const keys = hereKeys(query.here);
    const own = `${query.here.type}:${query.here.id}`;
    const here = rawDb
      .prepare(
        prefix +
          `SELECT sourceType,sourceId,assetUuid,touchedAt,placeDate FROM (${feed.sql})
           WHERE sourceType||':'||sourceId IN (${keys.map(() => '?').join(',')})
           ORDER BY sourceType||':'||sourceId=? DESC,placeDate IS NULL,placeDate DESC,sourceType,sourceId,${FAMILY_ORDER}
           LIMIT ?`,
      )
      .all(...feed.args, ...keys, own, HERE_LIMIT * 2) as FeedRow[];
    const seen = new Set<string>();
    const unique = here
      .filter((row) => !seen.has(row.assetUuid) && seen.add(row.assetUuid))
      .slice(0, HERE_LIMIT);
    result.here = readFeedEntries(unique, query);
  }
  const recent = rawDb
    .prepare(
      prefix +
        // The files used last, a family together as in a place: its
        // variants before the file as uploaded.
        `SELECT assetUuid,familyTouchedAt,familyUuid,isOriginal,createdAt FROM (
           SELECT assetUuid,familyUuid,isOriginal,createdAt,
             max(max(touchedAt)) OVER (PARTITION BY familyUuid) AS familyTouchedAt
           FROM (${feed.sql}) GROUP BY assetUuid)
         ORDER BY ${FAMILY_ORDER} LIMIT ?`,
    )
    .all(...feed.args, RECENT_LIMIT) as { assetUuid: string }[];
  result.recent = readItems(
    recent.map((row) => row.assetUuid),
    query,
  );
  return result;
}
/**
 * How many files each choice of the filters would give, each filter counted
 * with the rest of the search applied but itself.
 */
function feedFacets(
  query: LibraryFeedQuery,
  search: LibrarySearch,
): AssetLibraryFacets {
  const { rawDb } = connection();
  const prefix = FEED_PREFIX();
  const counted = <T>(without: 'type' | 'where', select: string) => {
    const feed = feedSql(query, search, without);
    return rawDb
      .prepare(prefix + select.replace('$FEED', `(${feed.sql})`))
      .all(...feed.args) as T[];
  };
  const types = counted<{ value: AssetType; count: number }>(
    'type',
    'SELECT assetType AS value,count(DISTINCT assetUuid) AS count FROM $FEED GROUP BY assetType',
  );
  const places = counted<{ value: AssetSource['type']; count: number }>(
    'where',
    'SELECT sourceType AS value,count(DISTINCT assetUuid) AS count FROM $FEED GROUP BY sourceType',
  );
  const anywhere = counted<{ count: number }>(
    'where',
    'SELECT count(DISTINCT assetUuid) AS count FROM $FEED',
  )[0]!.count;
  return {
    types: Object.fromEntries(types.map((row) => [row.value, row.count])),
    sources: Object.fromEntries(places.map((row) => [row.value, row.count])),
    anywhere,
  };
}
export function getAssetUsages(id: string): AssetUsagesResponse {
  const item = readItems([id])[0];
  if (!item?.asset.settings)
    throw createError({ statusCode: 404, message: 'Asset not found' });
  return {
    asset: item.asset,
    placements: readPlacements([id]).get(id) ?? [],
    counts: item.counts,
    entityCount: item.entityCount,
    ...(item.inHistory ? { inHistory: item.inHistory } : {}),
    ...(item.heldByAi ? { heldByAi: item.heldByAi } : {}),
  };
}

export function getLibraryAvailability(
  constraints: AssetSelectionConstraints = {},
): AssetLibraryAvailability {
  const { rawDb } = connection();
  const { where, args } = matchSql(constraints);
  const rows = rawDb
    .prepare(
      `SELECT a.type,count(*) AS count FROM assets a WHERE ${where} GROUP BY a.type`,
    )
    .all(...args) as { type: AssetType; count: number }[];
  const types: AssetLibraryAvailability['types'] = {};
  let total = 0;
  for (const row of rows) {
    types[row.type] = row.count;
    total += row.count;
  }
  return { total, types };
}
