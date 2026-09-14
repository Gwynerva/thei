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
} from '../../../shared/asset-library';
import { normalizeAssetExtension } from '../../../shared/assets/formats';
import {
  buildProjectChildUrl,
  buildProjectUrl,
} from '../../../shared/project-url';
import { buildEventUrl } from '../../../shared/event-url';
import { buildPageUrl } from '../../../shared/page-url';
import { buildTagUrl } from '../../../shared/tag-url';
import { describeStoredAsset } from './storage';

export interface LibraryQuery extends AssetSelectionConstraints {
  q?: string;
  type?: string;
  usage?: string;
  page?: number;
}

// Resolve owners in SQL. Only page assets and their placements are materialized;
// rendering the library never hydrates content or invokes media processing.
const ownersSql = `
WITH sources AS (
  SELECT 'project' AS sourceType, projectUuid AS sourceId, title, summary,
    humanReadableSlug AS slug, publicId, updatedAt, access='private' AS sourcePrivate FROM projects
  UNION ALL SELECT 'event',eventUuid,title,summary,humanReadableSlug,publicId,updatedAt,access='private' FROM events
  UNION ALL SELECT 'page',pageUuid,title,summary,slug,'',updatedAt,access='private' FROM pages
  UNION ALL SELECT 'tag',tagUuid,title,description,slug,publicId,0,0 FROM tags
  UNION ALL SELECT 'profile',profileId,displayName,slogan,'','',0,0 FROM profiles
),
children AS (
  SELECT 'project-stage' AS ownerType,stageUuid AS ownerId,projectUuid,title,summary,isPrivate,
    humanReadableSlug AS childSlug,publicId AS childPublicId FROM "project-stages"
  UNION ALL SELECT 'project-section',sectionUuid,projectUuid,title,summary,isPrivate,humanReadableSlug,publicId FROM "project-content-sections"
),
contexts AS (
  SELECT sourceType AS containerType,sourceId AS containerId,sourceType,sourceId,
    '' AS scopeTitle,'entity' AS scopeKind,'' AS scopeSlug,'' AS scopePublicId,
    '' AS detail,0 AS parentPrivate,'' AS description FROM sources
  UNION ALL
  SELECT 'content',c.contentUuid,CASE WHEN ch.projectUuid IS NULL THEN c.ownerType ELSE 'project' END,
    coalesce(ch.projectUuid,c.ownerId),coalesce(ch.title,''),coalesce(ch.ownerType,'entity'),
    coalesce(ch.childSlug,''),coalesce(ch.childPublicId,''),'',coalesce(ch.isPrivate,0),coalesce(ch.summary,'')
    FROM content c LEFT JOIN children ch ON ch.ownerType=c.ownerType AND ch.ownerId=c.ownerId
  UNION ALL SELECT 'profile-avatar',a.id,'profile',p.profileId,'','entity','','','avatar',0,'' FROM "profile-avatars" a CROSS JOIN profiles p
  UNION ALL SELECT 'profile-status',a.id,'profile',p.profileId,'','entity','','','status',0,'' FROM "profile-statuses" a CROSS JOIN profiles p
),
placements AS (
  SELECT u.assetUuid,u.role,u.meta,u.containerType,u.containerId,s.*,c.scopeTitle,c.scopeKind,
    c.scopeSlug,c.scopePublicId,c.detail,c.parentPrivate,c.description
  FROM "asset-usages" u JOIN contexts c ON c.containerType=u.containerType AND c.containerId=u.containerId
  JOIN sources s ON s.sourceType=c.sourceType AND s.sourceId=c.sourceId
),
members AS (
  SELECT DISTINCT assetUuid,sourceType,sourceId FROM placements
  UNION ALL SELECT a.assetUuid,'unused','all' FROM assets a
    WHERE a.settings IS NOT NULL AND NOT EXISTS (SELECT 1 FROM placements p WHERE p.assetUuid=a.assetUuid)
)
`;
const filenameSql =
  "coalesce(json_extract(a.meta,'$.originalName'),json_extract(a.meta,'$.archivedOriginal.name'),a.assetUuid)";
const registered = new WeakSet<Database.Database>();
function connection() {
  const context = THEI_SERVER.useDb();
  if (!registered.has(context.rawDb)) {
    context.rawDb.function(
      'asset_search_text',
      { deterministic: true },
      (value: unknown) =>
        normalizeAdminSearchText(typeof value === 'string' ? value : ''),
    );
    registered.add(context.rawDb);
  }
  return context;
}
function matchSql(query: LibraryQuery, source = false) {
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
    const text = source
      ? `${filenameSql} || ' ' || coalesce(s.title,'') || ' ' || coalesce(s.summary,'')`
      : filenameSql;
    parts.push(
      `(instr(asset_search_text(${text}),?)>0 ${
        source
          ? `OR EXISTS (
      SELECT 1 FROM placements p WHERE p.assetUuid=a.assetUuid AND p.sourceType=m.sourceType AND p.sourceId=m.sourceId
      AND instr(asset_search_text(p.scopeTitle || ' ' || p.description || ' ' || coalesce(json_extract(p.meta,'$.caption'),'') || ' ' || coalesce(json_extract(p.meta,'$.title'),'')),?)>0)
      OR EXISTS (
        SELECT 1 FROM placements p JOIN content c ON p.containerType='content' AND c.contentUuid=p.containerId,
          json_each(c.data,'$.blocks') b
        WHERE p.assetUuid=a.assetUuid AND p.sourceType=m.sourceType AND p.sourceId=m.sourceId AND (
          (json_extract(b.value,'$.data.asset.assetUuid')=a.assetUuid AND
            instr(asset_search_text(coalesce(json_extract(b.value,'$.data.caption'),'') || ' ' || coalesce(json_extract(b.value,'$.data.title'),'')),?)>0)
          OR EXISTS (SELECT 1 FROM json_each(b.value,'$.data.items') i
            WHERE json_extract(i.value,'$.asset.assetUuid')=a.assetUuid
              AND instr(asset_search_text(json_extract(i.value,'$.caption')),?)>0)
        )
      )`
          : ''
      })`,
    );
    args.push(q);
    if (source) args.push(q, q, q);
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
}
interface PlacementRow extends SourceRow {
  assetUuid: string;
  role: AssetPlacement['role'];
  meta: string | null;
  scopeTitle: string;
  scopeKind: 'entity' | 'project-stage' | 'project-section';
  scopeSlug: string;
  scopePublicId: string;
  detail: '' | 'avatar' | 'status';
  parentPrivate: number;
}
function sourceInfo(row: SourceRow): AssetSource {
  const { sourceType: type, sourceId: id, slug, publicId } = row;
  const url =
    type === 'project'
      ? buildProjectUrl(slug, publicId)
      : type === 'event'
        ? buildEventUrl(slug, publicId)
        : type === 'page'
          ? buildPageUrl(slug)
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
        : `/admin/${type === 'page' ? 'pages' : type === 'tag' ? 'tags' : type + 's'}/${id}/edit/`;
  return {
    type,
    id,
    title: row.title ?? '',
    summary: row.summary ?? '',
    updatedAt: row.updatedAt,
    url,
    editUrl,
  };
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
      scope:
        row.scopeKind === 'entity'
          ? { kind: 'entity' }
          : {
              kind: row.scopeKind,
              title: row.scopeTitle,
              url: buildProjectChildUrl(
                row.slug,
                row.publicId,
                row.scopeKind === 'project-stage' ? 'stages' : 'sections',
                row.scopeSlug,
                row.scopePublicId,
              ),
            },
      detail: row.detail || undefined,
    };
    const uses = result.get(row.assetUuid) ?? [];
    const parentPrivate = Boolean(row.sourcePrivate || row.parentPrivate);
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
  const items = new Map<string, AssetLibraryItem>();
  for (const row of rows) {
    const uses = placements.get(row.assetUuid) ?? [];
    items.set(row.assetUuid, {
      asset: describeStoredAsset(
        row,
        previews.find((p) => p.containerId === row.assetUuid)?.assetUuid,
      ),
      touchedAt: row.touchedAt,
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
export function listLibraryAssets(query: LibraryQuery = {}) {
  const { where, args } = matchSql(query);
  const { ids, ...page } = pageIds(
    `SELECT a.assetUuid,a.touchedAt FROM assets a WHERE ${where}`,
    args,
    query,
    20,
  );
  return { ...page, items: readItems(ids, query) };
}
export function listLibrarySections(query: LibraryQuery = {}) {
  const { rawDb } = connection();
  const { where, args } = matchSql(query, true);
  const from = `SELECT m.sourceType,m.sourceId,s.title,s.summary,s.slug,s.publicId,s.sourcePrivate,
    max(max(a.touchedAt,coalesce(s.updatedAt,0))) AS updatedAt,count(DISTINCT a.assetUuid) AS count
    FROM members m JOIN assets a ON a.assetUuid=m.assetUuid LEFT JOIN sources s ON s.sourceType=m.sourceType AND s.sourceId=m.sourceId
    WHERE ${where} GROUP BY m.sourceType,m.sourceId`;
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
    CASE WHEN m.sourceType='unused' THEN 0 ELSE 1 END,
    updatedAt DESC,m.sourceType,m.sourceId LIMIT ? OFFSET ?`,
    )
    .all(
      ...args,
      page.pageSize,
      (page.page - 1) * page.pageSize,
    ) as (SourceRow & { count: number })[];
  return {
    ...page,
    items: rows.map((row) => ({ ...sourceInfo(row), count: row.count })),
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
  const { ids, ...page } = pageIds(from, [type, id, ...args], query, 24);
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
