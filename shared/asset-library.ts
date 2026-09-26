import { AssetType, type AssetMeta, type AssetRole } from './asset';
import type { AssetVariantInfo } from './api/asset';
import type { PaginatedResponse } from './pagination';
import {
  ASSET_UPLOAD_LIMITS,
  ASSET_UPLOAD_DEFAULT_MAX_SIZE,
  type AssetUploadLimitPolicy,
} from './asset-upload-limits';
import { normalizeAssetExtension } from './assets/formats';

export const ASSET_SOURCE_TYPES = [
  'project',
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
}
export interface AssetPlacement {
  source: AssetSource;
  role: AssetRole;
  scope:
    | { kind: 'entity' }
    | { kind: 'project-stage'; title: string; url: string }
    | { kind: 'project-section'; title: string; url: string };
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
  counts: AssetUsageCounts;
  entityCount: number;
  roles: AssetRole[];
  selectionError?: AssetSelectionError;
}
export interface AssetLibrarySection extends AssetSource {
  count: number;
}
export type AssetLibraryResponse = PaginatedResponse<AssetLibrarySection>;
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
