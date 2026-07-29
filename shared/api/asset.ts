import type {
  AssetMeta,
  AssetMetaForType,
  AudioAssetMeta,
  ImageAssetMeta,
  OtherAssetMeta,
  VideoAssetMeta,
} from '../asset';
import { AssetType } from '../asset';
import type {
  AssetImageTransformSettings,
  AssetFileZipSettings,
  AssetOriginalSettings,
  AssetUploadSettings,
  AssetVideoTransformSettings,
} from '../asset-upload-settings';
import type { MediaDescriptor } from '../media';

export function buildAssetPreviewUrl(slug: string, extension: string) {
  return `/api/admin/assets/preview/${slug}.${extension}`;
}

export interface BaseAssetVariantInfo<
  TType extends AssetType,
  TMeta,
  TSettings extends AssetUploadSettings | null,
> {
  assetUuid: string;
  familyUuid: string;
  contentHash: string;
  slug: string;
  extension: string;
  type: TType;
  meta: TMeta | null;
  size: number;
  settingsKey: string;
  settingsVersion: number;
  settings: TSettings;
  assetUrl: string;
  isUnprocessed: boolean;
}

export interface ImageAssetVariantInfo extends BaseAssetVariantInfo<
  AssetType.Image,
  ImageAssetMeta,
  AssetOriginalSettings | AssetImageTransformSettings | null
> {
  media: MediaDescriptor;
}

export interface VideoAssetVariantInfo extends BaseAssetVariantInfo<
  AssetType.Video,
  VideoAssetMeta,
  AssetOriginalSettings | AssetVideoTransformSettings | null
> {
  media: MediaDescriptor;
}

export interface AudioAssetVariantInfo extends BaseAssetVariantInfo<
  AssetType.Audio,
  AudioAssetMeta,
  AssetOriginalSettings | null
> {
  media?: never;
}

export interface OtherAssetVariantInfo extends BaseAssetVariantInfo<
  AssetType.Other,
  OtherAssetMeta,
  AssetOriginalSettings | AssetFileZipSettings | null
> {
  media?: never;
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
  familyUuid: string;
  contentHash: string;
  slug: string;
  extension: string;
  settingsKey: string;
  settingsVersion: number;
  settings: AssetUploadSettings | null;
  type: TType;
  size: number;
  meta: AssetMetaForType<TType> | null;
}

/**
 * Wider replace-result used when replacing any asset, including unknown file types
 * where media may not exist.
 */
export type AssetReplaceResult = {
  assetUuid: string;
  slug: string;
  extension: string;
  size: number;
  /** Display descriptor. Absent for unknown file types. */
  media?: MediaDescriptor;
  /** Canonical download URL. Always present for View on unknown files. */
  assetUrl: string;
  meta?: AssetMeta | null;
};

export interface AssetVariantsRequest {
  assetUuid: string;
}

export type AssetVariantWithUsage = AssetVariantInfo & {
  usageCount: number;
};

export interface AssetVariantsResponse {
  currentAssetUuid: string;
  variants: AssetVariantWithUsage[];
}

export interface AssetWizardResult {
  type: 'asset-ready';
  asset: AssetVariantInfo;
}
