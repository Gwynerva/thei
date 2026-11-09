import { AssetType, type AssetMeta, type AssetRole } from './asset';
import type { AssetVariantInfo } from './api/asset';
import type { MediaDescriptor } from './media';
import type { PaginatedResponse } from './pagination';
import {
  ASSET_UPLOAD_LIMITS,
  ASSET_UPLOAD_DEFAULT_MAX_SIZE,
  type AssetUploadLimitPolicy,
} from './asset-upload-limits';
import { getAssetMediaKind, normalizeAssetExtension } from './assets/formats';

/**
 * What holds a file, as the library groups files: an entity of the site, a
 * section of a project or an excerpt of an entity (with what it is a part of
 * as its parent), an AI session the file was brought into, or nothing at
 * all.
 */
export const ASSET_SOURCE_TYPES = [
  'project',
  'project-section',
  'excerpt',
  'event',
  'page',
  'diary-entry',
  'tag',
  'profile',
  'ai-session',
  'unused',
] as const;
export type AssetSourceType = (typeof ASSET_SOURCE_TYPES)[number];
export interface AssetSource {
  type: AssetSourceType;
  id: string;
  title: string;
  summary: string;
  url?: string;
  editUrl?: string;
  updatedAt: number;
  /** The project a section belongs to; its title as typed. */
  parent?: { title: string; url: string };
  /**
   * The picture that stands for the place — an icon, a banner, the first
   * picture of a body — through the admin's own addresses. Only the file's
   * window asks for it.
   */
  media?: MediaDescriptor;
}
export interface AssetPlacement {
  source: AssetSource;
  role: AssetRole;
  detail?: 'avatar' | 'status';
  isPrivate: boolean;
  count: number;
}
export type AssetUsageCounts = Partial<
  Record<Exclude<AssetSourceType, 'unused'>, number>
>;
/**
 * How long an asset nothing uses survives before cleanup deletes it.
 *
 * Every upload, reuse and touch resets the clock, so a file that is still being
 * placed is never swept away mid-edit.
 */
export const ASSET_ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export interface AssetLibraryItem {
  asset: AssetVariantInfo;
  touchedAt: number;
  /** Unix ms after which cleanup deletes the asset; set only when unused. */
  deleteAfter?: number;
  /**
   * Unused, but a draft or a recent version of some text still shows it, so
   * cleanup keeps it for as long as that version lives.
   */
  inHistory?: true;
  /**
   * Unused, but an AI action still needs it — one waiting for the owner, or
   * applied and still undoable — so cleanup keeps it while that action does.
   */
  heldByAi?: true;
  counts: AssetUsageCounts;
  entityCount: number;
  roles: AssetRole[];
  selectionError?: AssetSelectionError;
}
/**
 * Which way the library runs through time: the newest places first — what is
 * most often wanted, a file used lately — or the oldest.
 */
export const ASSET_LIBRARY_ORDERS = ['new', 'old'] as const;
export type AssetLibraryOrder = (typeof ASSET_LIBRARY_ORDERS)[number];
export function isAssetLibraryOrder(
  value: unknown,
): value is AssetLibraryOrder {
  return ASSET_LIBRARY_ORDERS.includes(value as AssetLibraryOrder);
}
/**
 * A place with the day it stands at in a life: a diary entry's own day, the
 * first day of an event, of a section, or of the first dated section of a
 * project — an undated section takes its project's — and an excerpt its
 * parent's. A file nothing holds stands at the day it was uploaded; a page,
 * a tag and the profile have no day.
 */
export interface AssetLibraryPlace extends AssetSource {
  /** `YYYY-MM-DD`. */
  date?: string;
  /** The place is named by the words of the search: it comes before the run. */
  named?: true;
}
/** A file in one of its places, as the library runs through them. */
export interface AssetLibraryEntry extends AssetLibraryItem {
  place: AssetLibraryPlace;
}
/** How many places' files one answer of the library carries. */
export const ASSET_LIBRARY_FEED_PAGE = 60;
/**
 * The library as one run through time: files in their places, the places in
 * the order of their days. `offset` is where `entries` start in the whole
 * run, so a jump to a year and the pages before and after it are positions
 * in one list. The first answer of a search also says how its filters count,
 * which years it covers, and — while nothing is typed — what is here and what
 * was used lately.
 */
export interface AssetLibraryFeedResponse {
  entries: AssetLibraryEntry[];
  offset: number;
  total: number;
  facets?: AssetLibraryFacets;
  /** How many files each year holds, in the order of the run; `''` for no day. */
  years?: { year: string; count: number }[];
  /** The files of what is being edited and of what it is related to. */
  here?: AssetLibraryEntry[];
  /** The files used last. */
  recent?: AssetLibraryItem[];
}
/** What is being edited, as a place: its files and its relations come first. */
export interface AssetLibraryHere {
  type: Exclude<AssetSourceType, 'unused'>;
  id: string;
}
/** The longest search the library takes. */
export const ASSET_LIBRARY_QUERY_LIMIT = 500;
/**
 * The furthest a reader's clock stands from UTC, in minutes: the library
 * dates by the reader's days (`utcOffset` of a feed request).
 */
export const ASSET_LIBRARY_UTC_OFFSET_MAX = 14 * 60;
/**
 * The kinds of entity the library can be narrowed to. The profile and tags
 * hold few files and are found by name; files nothing holds are a group of
 * their own, not an entity.
 */
export const ASSET_LIBRARY_SOURCE_FILTERS = [
  'project',
  'project-section',
  'excerpt',
  'event',
  'diary-entry',
  'page',
] as const satisfies readonly AssetSourceType[];
export type AssetLibrarySourceFilter =
  (typeof ASSET_LIBRARY_SOURCE_FILTERS)[number];
export function isAssetLibrarySourceFilter(
  value: unknown,
): value is AssetLibrarySourceFilter {
  return ASSET_LIBRARY_SOURCE_FILTERS.includes(
    value as AssetLibrarySourceFilter,
  );
}
/**
 * Where the files a search finds are used, as one choice: anywhere, in an
 * entity of one kind, anywhere at all, or nowhere. The server reads it as two
 * filters — `source` for a kind, `usage` for the rest.
 */
export type AssetLibraryWhere =
  'all' | AssetLibrarySourceFilter | 'used' | 'unused';
export function assetLibraryWhereQuery(where: AssetLibraryWhere): {
  source?: AssetLibrarySourceFilter;
  usage?: 'used' | 'unused';
} {
  if (where === 'used' || where === 'unused') return { usage: where };
  return where === 'all' ? {} : { source: where };
}
export function assetLibraryWhereFromQuery(query: {
  source?: unknown;
  usage?: unknown;
}): AssetLibraryWhere {
  if (query.usage === 'used' || query.usage === 'unused') return query.usage;
  return isAssetLibrarySourceFilter(query.source) ? query.source : 'all';
}
/**
 * How many results each choice of the filters would give for the search, so
 * a choice that finds nothing is seen before it is made. Each filter is
 * counted with the other applied and without its own: `types` by kind of
 * file, `sources` by where the files are used, `anywhere` for no place at
 * all, every one counting files.
 */
export interface AssetLibraryFacets {
  types: Partial<Record<AssetType, number>>;
  sources: Partial<Record<AssetSourceType, number>>;
  anywhere: number;
}
/** The flat list of files, a page of it (`listLibraryAssets`). */
export type AssetLibraryFilesResponse = PaginatedResponse<AssetLibraryItem>;
export interface AssetLibraryAvailability {
  total: number;
  types: Partial<Record<AssetType, number>>;
}
export interface AssetUsagesResponse {
  asset: AssetVariantInfo;
  placements: AssetPlacement[];
  counts: AssetUsageCounts;
  entityCount: number;
  /** Unused, but kept while a version of some text still shows it. */
  inHistory?: true;
  /** Unused, but kept while an AI action still needs it. */
  heldByAi?: true;
}
export interface AssetSelectionConstraints {
  acceptedExtensions?: string[] | '*';
  maxSize?: number;
  sizeLimitPolicy?: AssetUploadLimitPolicy;
  imageOnly?: boolean;
}
export type AssetSelectionError = 'type' | 'size';
/**
 * The kinds of file a selection can take at all, so a filter offers no kind
 * that could never be chosen; every kind when it takes any file.
 */
export function assetSelectionKinds(
  constraints: AssetSelectionConstraints = {},
): AssetType[] | undefined {
  if (constraints.imageOnly) return [AssetType.Image];
  let kinds: AssetType[] | undefined =
    constraints.sizeLimitPolicy === 'media'
      ? [AssetType.Image, AssetType.Video]
      : undefined;
  const allowed = constraints.acceptedExtensions;
  if (allowed && allowed !== '*') {
    const named = new Set(
      allowed.map(
        (extension) =>
          getAssetMediaKind(normalizeAssetExtension(extension)) as AssetType,
      ),
    );
    kinds = (kinds ?? Object.values(AssetType)).filter((kind) =>
      named.has(kind),
    );
  }
  return kinds;
}
export function assetMatchesSelectionType(
  asset: { type: AssetType; extension: string },
  constraints: AssetSelectionConstraints = {},
) {
  const allowed = constraints.acceptedExtensions;
  return !(
    (constraints.imageOnly && asset.type !== AssetType.Image) ||
    (constraints.sizeLimitPolicy === 'media' &&
      asset.type !== AssetType.Image &&
      asset.type !== AssetType.Video) ||
    (allowed &&
      allowed !== '*' &&
      !allowed
        .map(normalizeAssetExtension)
        .includes(normalizeAssetExtension(asset.extension)))
  );
}
export function assetSizeForLimit(asset: {
  size: number;
  meta?: AssetMeta | null;
}) {
  const original =
    asset.meta && 'archivedOriginal' in asset.meta
      ? asset.meta.archivedOriginal?.size
      : 0;
  return Math.max(asset.size, original ?? 0);
}
export function assetSelectionError(
  asset: {
    type: AssetType;
    extension: string;
    size: number;
    meta?: AssetMeta | null;
  },
  constraints: AssetSelectionConstraints = {},
): AssetSelectionError | undefined {
  if (!assetMatchesSelectionType(asset, constraints)) return 'type';
  const max = Math.min(
    ASSET_UPLOAD_DEFAULT_MAX_SIZE,
    constraints.maxSize ?? Infinity,
    constraints.sizeLimitPolicy
      ? ASSET_UPLOAD_LIMITS[constraints.sizeLimitPolicy]
      : Infinity,
  );
  if (assetSizeForLimit(asset) > max) return 'size';
}
export function assetSourceKey(source: Pick<AssetSource, 'type' | 'id'>) {
  return `${source.type}:${source.id}`;
}
export function summarizeAssetUsages(placements: AssetPlacement[]) {
  const sources = new Map(
    placements.map((p) => [assetSourceKey(p.source), p.source]),
  );
  const counts: AssetUsageCounts = {};
  for (const placement of placements) {
    if (placement.source.type === 'unused') continue;
    counts[placement.source.type] =
      (counts[placement.source.type] ?? 0) + placement.count;
  }
  return { counts, entityCount: sources.size };
}
