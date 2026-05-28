import type { AssetProfileId } from '../asset-profiles';
import type { AssetMeta } from '../asset';

export interface AssetCheckRequest {
  rawHash: string;
  profileId: AssetProfileId;
}

export type AssetCheckResponse =
  | { exists: false }
  | {
      exists: true;
      assetUuid: string;
      slug: string;
      extension: string;
      meta: AssetMeta | null;
      size: number;
      /** Thumbnail preview URL. Only present for video assets. */
      videoPreviewUrl?: string;
    };

export interface AssetUploadResponse {
  assetUuid: string;
  slug: string;
  extension: string;
  meta: AssetMeta | null;
  /** Processed/stored file size in bytes. */
  size: number;
  /** Admin preview URL of the first-frame thumbnail. Only present for video assets. */
  videoPreviewUrl?: string;
}

export function buildAssetPreviewUrl(slug: string, extension: string) {
  return `/api/admin/assets/preview/${slug}.${extension}`;
}

/**
 * Pre-resolved display URLs from a completed upload or duplicate-check.
 * Computed by AssetPickPane so consumers never have to derive URLs themselves.
 */
export type AssetPickResult = {
  assetUuid: string;
  slug: string;
  extension: string;
  size: number;
  /** Thumbnail webp URL (or the static image URL for image assets). */
  previewUrl: string;
  /** MP4 URL. Only present for video assets. */
  videoUrl?: string;
  /** Canonical download URL for the uploaded asset. */
  assetUrl: string;
};

/**
 * Wider replace-result used when replacing any asset, including unknown file types
 * where previewUrl may not exist. Compatible with AssetPickResult (structural subtype).
 */
export type AssetReplaceResult = {
  assetUuid: string;
  slug: string;
  extension: string;
  size: number;
  /** Thumbnail / image URL. Absent for unknown file types. */
  previewUrl?: string;
  /** MP4 URL. Only present for video assets. */
  videoUrl?: string;
  /** Canonical download URL. Always present — used for the View button on unknown files. */
  assetUrl: string;
};
