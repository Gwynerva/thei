import type {
  AssetMetaForType,
  AudioAssetMeta,
  ImageAssetMeta,
  OtherAssetMeta,
  VideoAssetMeta,
} from '../asset';
import { AssetType } from '../asset';
import type {
  AssetImageTransformSettings,
  AssetOriginalSettings,
  AssetUploadSettings,
  AssetVideoTransformSettings,
} from '../asset-upload-settings';

export function buildAssetPreviewUrl(slug: string, extension: string) {
  return `/api/admin/assets/preview/${slug}.${extension}`;
}

export interface BaseAssetVariantInfo<
  TType extends AssetType,
  TMeta,
  TSettings extends AssetUploadSettings | null,
> {
  assetUuid: string;
  slug: string;
  extension: string;
  type: TType;
  meta: TMeta | null;
  size: number;
  settingsKey: string;
  settingsVersion: number;
  settings: TSettings;
  assetUrl: string;
  isOriginal: boolean;
}

export interface ImageAssetVariantInfo extends BaseAssetVariantInfo<
  AssetType.Image,
  ImageAssetMeta,
  AssetOriginalSettings | AssetImageTransformSettings | null
> {
  previewUrl: string;
  videoUrl?: never;
}

export interface VideoAssetVariantInfo extends BaseAssetVariantInfo<
  AssetType.Video,
  VideoAssetMeta,
  AssetOriginalSettings | AssetVideoTransformSettings | null
> {
  previewUrl: string;
  videoUrl: string;
}

export interface AudioAssetVariantInfo extends BaseAssetVariantInfo<
  AssetType.Audio,
  AudioAssetMeta,
  AssetOriginalSettings | null
> {
  previewUrl?: never;
  videoUrl?: never;
}

export interface OtherAssetVariantInfo extends BaseAssetVariantInfo<
  AssetType.Other,
  OtherAssetMeta,
  AssetOriginalSettings | null
> {
  previewUrl?: never;
  videoUrl?: never;
}

export type AssetVariantInfo =
  | ImageAssetVariantInfo
  | VideoAssetVariantInfo
  | AudioAssetVariantInfo
  | OtherAssetVariantInfo;

export type AssetVariantInfoForType<TType extends AssetType> = Extract<
  AssetVariantInfo,
  { type: TType }
>;

export type AssetUploadResponse = AssetVariantInfo & {
  /** True when this request created a new stored file instead of reusing a match. */
  created: boolean;
};

export interface StoredAssetShape<TType extends AssetType = AssetType> {
  assetUuid: string;
  slug: string;
  extension: string;
  rawHash: string;
  settingsKey: string;
  settingsVersion: number;
  settings: AssetUploadSettings | null;
  type: TType;
  size: number;
  meta: AssetMetaForType<TType> | null;
}

/**
 * Wider replace-result used when replacing any asset, including unknown file types
 * where previewUrl may not exist.
 */
export type AssetReplaceResult = {
  assetUuid: string;
  slug: string;
  extension: string;
  size: number;
  /** Thumbnail / image URL. Absent for unknown file types. */
  previewUrl?: string;
  /** Stored video URL. Only present for video assets. */
  videoUrl?: string;
  /** Canonical download URL. Always present for View on unknown files. */
  assetUrl: string;
};

export interface AssetVariantsRequest {
  rawHash: string;
}

export interface AssetVariantsResponse {
  variants: AssetVariantInfo[];
}

export interface AssetWizardResult {
  type: 'asset-ready';
  asset: AssetVariantInfo;
}
