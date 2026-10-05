import { createError } from 'h3';
import type Database from 'better-sqlite3';
import { inArray } from 'drizzle-orm';
import { AssetType, type AssetUsageMeta } from '../../../shared/asset';
import {
  normalizeAdminSearchText,
  resolveAdminPagination,
} from '../../../shared/admin/entity-list';
import {
  assetSelectionError,
  assetSourceKey,
  summarizeAssetUsages,
  type AssetSource,
  type AssetPlacement,
  type AssetLibraryItem,
  type AssetSelectionConstraints,
  type AssetLibraryAvailability,
  type AssetLibraryAssetsResponse,
  type AssetLibraryFacets,
  type AssetLibraryResponse,
  type AssetLibrarySourceFilter,
} from '../../../shared/asset-library';
import { normalizeAssetExtension } from '../../../shared/assets/formats';
import { dayQueryRank, parseDayQuery } from '../../../shared/day-query';
import { richTextToPlainText } from '../../../shared/rich-text';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '../../../shared/project-url';
import { buildEventUrl } from '../../../shared/event-url';
import { buildPageUrl } from '../../../shared/page-url';
import { buildDiaryUrl } from '../../../shared/diary-url';
import { buildTagUrl } from '../../../shared/tag-url';
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

// Resolve owners in SQL. Only page assets and their placements are materialized;
// rendering the library never hydrates content or invokes media processing.
// A section is a source of its own, carrying its project as the parent; a private project makes everything in it private.
const ownersSql = `
WITH sources AS (
  SELECT 'project' AS sourceType, projectUuid AS sourceId, title, summary,
    humanReadableSlug AS slug, publicId, updatedAt, access='private' AS sourcePrivate,
    '' AS parentId, '' AS parentTitle, '' AS parentSlug, '' AS parentPublicId FROM projects
  UNION ALL SELECT 'event',eventUuid,title,summary,humanReadableSlug,publicId,updatedAt,access='private','','','','' FROM events
  UNION ALL SELECT 'page',pageUuid,title,summary,slug,'',updatedAt,access='private','','','','' FROM pages
  UNION ALL SELECT 'diary-entry',diaryUuid,date,'',date,'',updatedAt,access='private','','','','' FROM "diary-entries"
  UNION ALL SELECT 'tag',tagUuid,title,description,slug,publicId,0,0,'','','','' FROM tags
  UNION ALL SELECT 'profile',profileId,displayName,slogan,'','',0,0,'','','','' FROM profiles
  UNION ALL SELECT 'project-section',se.sectionUuid,se.title,se.summary,se.humanReadableSlug,se.publicId,se.updatedAt,
    (se.isPrivate OR p.access='private'),p.projectUuid,p.title,p.humanReadableSlug,p.publicId
    FROM "project-content-sections" se JOIN projects p ON p.projectUuid=se.projectUuid
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
 * of its placements, captions inside editor blocks, and the titles of whatever
 * holds it. A diary entry has no title: it is found by its day, written in
 * any way (`day-query.ts`), and never by the characters of its stored date,
 * so a lone `0` or `-` does not find every entry. What the uploaded file
 * was called is never kept, so it is never searchable. `scoped` restricts the
 * match to the member row's own source. Takes the query four times.
 */
function siteTextMatchSql(scoped: boolean) {
  const scope = scoped
    ? ' AND p.sourceType=m.sourceType AND p.sourceId=m.sourceId'
    : '';
  return `(EXISTS (
      SELECT 1 FROM placements p WHERE p.assetUuid=a.assetUuid${scope}
      AND (instr(asset_search_text(CASE WHEN p.sourceType='diary-entry' THEN '' ELSE coalesce(p.title,'') END || ' ' || coalesce(p.summary,'') || ' ' || p.description || ' ' || coalesce(json_extract(p.meta,'$.caption'),'') || ' ' || coalesce(json_extract(p.meta,'$.title'),'')),?)>0
        OR (p.sourceType='diary-entry' AND asset_day_match(p.slug,?))))
    OR EXISTS (
      SELECT 1 FROM placements p JOIN content c ON p.containerType='content' AND c.contentUuid=p.containerId,
        json_each(c.data,'$.blocks') b
      WHERE p.assetUuid=a.assetUuid${scope} AND (
        (json_extract(b.value,'$.data.asset.assetUuid')=a.assetUuid AND
          instr(asset_search_text(coalesce(json_extract(b.value,'$.data.caption'),'') || ' ' || coalesce(json_extract(b.value,'$.data.title'),'')),?)>0)
        OR EXISTS (SELECT 1 FROM json_each(b.value,'$.data.items') i
          WHERE json_extract(i.value,'$.asset.assetUuid')=a.assetUuid
            AND instr(asset_search_text(json_extract(i.value,'$.caption')),?)>0)
      )
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
        normalizeAdminSearchText(
          typeof value === 'string' ? richTextToPlainText(value) : '',
        ),
    );
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
  const q = normalizeAdminSearchText(query.q ?? '');
  if (q) {
    parts.push(siteTextMatchSql(scoped));
    args.push(q, q, q, q);
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
  /** The project of a section; empty for every other source. */
  parentId: string;
  parentTitle: string;
  parentSlug: string;
  parentPublicId: string;
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
function readPlacements(ids: string[]) {
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
  sourceKey?: string,
) {
  if (!ids.length) return [];
  const { db, schema } = connection();
  const rows = db
    .select()
    .from(schema.assets)
    .where(inArray(schema.assets.assetUuid, ids))
    .all();
  const placements = readPlacements(ids);
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
      roles: [
        ...new Set(
          uses
            .filter((p) => !sourceKey || assetSourceKey(p.source) === sourceKey)
            .map((p) => p.role),
        ),
      ],
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
 * How many results each choice of the filters would give: each filter counted
 * with everything else applied but itself (`AssetLibraryFacets`). `scoped`
 * counts places by groups, as the reuse picker lists them; otherwise by files.
 */
function libraryFacets(
  query: LibraryQuery,
  scoped: boolean,
): AssetLibraryFacets {
  const { rawDb } = connection();
  const counted = <T>(sql: string, args: (string | number)[]) =>
    rawDb.prepare(ownersSql + sql).all(...args) as T[];
  const files = 'FROM members m JOIN assets a ON a.assetUuid=m.assetUuid';
  const byType = matchSql({ ...query, type: undefined }, scoped);
  const types = counted<{ value: AssetType; count: number }>(
    `SELECT a.type AS value,count(DISTINCT a.assetUuid) AS count ${files} WHERE ${byType.where} GROUP BY a.type`,
    byType.args,
  );
  const byPlace = matchSql(
    { ...query, source: undefined, usage: undefined },
    scoped,
  );
  const places = scoped
    ? counted<{ value: AssetSource['type']; count: number }>(
        `SELECT sourceType AS value,count(*) AS count FROM (SELECT m.sourceType ${files} WHERE ${byPlace.where} GROUP BY m.sourceType,m.sourceId) GROUP BY sourceType`,
        byPlace.args,
      )
    : counted<{ value: AssetSource['type']; count: number }>(
        `SELECT m.sourceType AS value,count(DISTINCT a.assetUuid) AS count ${files} WHERE ${byPlace.where} GROUP BY m.sourceType`,
        byPlace.args,
      );
  const anywhere = scoped
    ? places.reduce((sum, row) => sum + row.count, 0)
    : (
        rawDb
          .prepare(
            ownersSql +
              `SELECT count(*) AS count FROM assets a WHERE ${byPlace.where}`,
          )
          .get(...byPlace.args) as { count: number }
      ).count;
  return {
    types: Object.fromEntries(types.map((row) => [row.value, row.count])),
    sources: Object.fromEntries(places.map((row) => [row.value, row.count])),
    anywhere,
  };
}
export function listLibraryAssets(
  query: LibraryQuery = {},
): AssetLibraryAssetsResponse {
  const { where, args } = matchSql(query);
  const { ids, ...page } = pageIds(
    `SELECT a.assetUuid,a.touchedAt FROM assets a WHERE ${where}`,
    args,
    query,
    40,
  );
  return {
    ...page,
    items: readItems(ids, query),
    facets: libraryFacets(query, false),
  };
}
/**
 * The groups of files the reuse picker lists: files nothing holds first, then
 * every entity holding a matching file, the one changed last first. The
 * profile and tags keep no date of change; they follow, the one whose files
 * were placed most recently first.
 */
export function listLibrarySections(
  query: LibraryQuery = {},
): AssetLibraryResponse {
  const { rawDb } = connection();
  const { where, args } = matchSql(query, true);
  const from = `SELECT * FROM (SELECT m.sourceType,m.sourceId,s.title,s.summary,s.slug,s.publicId,s.sourcePrivate,
    s.parentId,s.parentTitle,s.parentSlug,s.parentPublicId,
    coalesce(s.updatedAt,0) AS updatedAt,max(a.touchedAt) AS touchedAt,count(DISTINCT a.assetUuid) AS count
    FROM members m JOIN assets a ON a.assetUuid=m.assetUuid LEFT JOIN sources s ON s.sourceType=m.sourceType AND s.sourceId=m.sourceId
    WHERE ${where} GROUP BY m.sourceType,m.sourceId)`;
  const total = (
    rawDb
      .prepare(ownersSql + `SELECT count(*) AS total FROM (${from})`)
      .get(...args) as { total: number }
  ).total;
  const page = resolveAdminPagination(total, {
    page: query.page,
    pageSize: 20,
  });
  const rows = rawDb
    .prepare(
      ownersSql +
        from +
        ` ORDER BY
    CASE WHEN sourceType='unused' THEN 0 ELSE 1 END,
    updatedAt DESC,touchedAt DESC,sourceType,sourceId LIMIT ? OFFSET ?`,
    )
    .all(
      ...args,
      page.pageSize,
      (page.page - 1) * page.pageSize,
    ) as (SourceRow & { count: number })[];
  return {
    ...page,
    items: rows.map((row) => ({ ...sourceInfo(row), count: row.count })),
    ...(page.page === 1 ? { facets: libraryFacets(query, true) } : {}),
  };
}
export function listSourceAssets(
  type: string,
  id: string,
  query: LibraryQuery = {},
) {
  const { where, args } = matchSql(query, true);
  const from = `SELECT a.assetUuid,a.touchedAt FROM members m JOIN assets a ON a.assetUuid=m.assetUuid
    LEFT JOIN sources s ON s.sourceType=m.sourceType AND s.sourceId=m.sourceId
    WHERE m.sourceType=? AND m.sourceId=? AND ${where}`;
  const { ids, ...page } = pageIds(from, [type, id, ...args], query, 48);
  return { ...page, items: readItems(ids, query, `${type}:${id}`) };
}
export function getAssetUsages(id: string) {
  const item = readItems([id])[0];
  if (!item?.asset.settings)
    throw createError({ statusCode: 404, message: 'Asset not found' });
  return {
    asset: item.asset,
    placements: readPlacements([id]).get(id) ?? [],
    counts: item.counts,
    entityCount: item.entityCount,
    ...(item.inHistory ? { inHistory: item.inHistory } : {}),
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
