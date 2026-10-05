import { AssetType, type AssetMeta, type AssetRole } from './asset';
import type { AssetVariantInfo } from './api/asset';
import type { PaginatedResponse } from './pagination';
import {
  ASSET_UPLOAD_LIMITS,
  ASSET_UPLOAD_DEFAULT_MAX_SIZE,
  type AssetUploadLimitPolicy,
} from './asset-upload-limits';
import { normalizeAssetExtension } from './assets/formats';

/**
 * What holds a file, as the library groups files: an entity of the site, a
 * section of a project (with the project as its parent), or nothing at all.
 */
export const ASSET_SOURCE_TYPES = [
  'project',
  'project-section',
  'event',
  'page',
  'diary-entry',
  'tag',
  'profile',
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
  counts: AssetUsageCounts;
  entityCount: number;
  roles: AssetRole[];
  selectionError?: AssetSelectionError;
}
export interface AssetLibrarySection extends AssetSource {
  count: number;
}
/** The longest search the library takes. */
export const ASSET_LIBRARY_QUERY_LIMIT = 500;
/**
 * The kinds of entity the library can be narrowed to. The profile and tags
 * hold few files and are found by name; files nothing holds are a group of
 * their own, not an entity.
 */
export const ASSET_LIBRARY_SOURCE_FILTERS = [
  'project',
  'project-section',
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
 * all. A listing of groups counts groups by place and files by kind; a
 * listing of files counts files.
 */
export interface AssetLibraryFacets {
  types: Partial<Record<AssetType, number>>;
  sources: Partial<Record<AssetSourceType, number>>;
  anywhere: number;
}
export type AssetLibraryResponse = PaginatedResponse<AssetLibrarySection> & {
  /**
   * With the first page only: the picker loads the next ones onto it, and
   * the counts do not change with the page.
   */
  facets?: AssetLibraryFacets;
};
export type AssetLibraryFilesResponse = PaginatedResponse<AssetLibraryItem>;
/** The flat list of the storage page: files, and how the filters count them. */
export type AssetLibraryAssetsResponse = AssetLibraryFilesResponse & {
  facets: AssetLibraryFacets;
};
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
}
export interface AssetSelectionConstraints {
  acceptedExtensions?: string[] | '*';
  maxSize?: number;
  sizeLimitPolicy?: AssetUploadLimitPolicy;
  imageOnly?: boolean;
}
export type AssetSelectionError = 'type' | 'size';
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
