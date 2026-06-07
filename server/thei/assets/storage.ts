import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { eq } from 'drizzle-orm';
import { buildAssetPreviewUrl } from '#layers/thei/shared/api/asset';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import type {
  AssetMeta,
  AudioAssetMeta,
  ImageAssetMeta,
  OtherAssetMeta,
  VideoAssetMeta,
} from '#layers/thei/shared/asset';
import {
  ASSET_UPLOAD_SETTINGS_VERSION,
  type AssetFileZipSettings,
  type AssetImageTransformSettings,
  type AssetOriginalSettings,
  type AssetUploadSettings,
  type AssetVideoTransformSettings,
} from '#layers/thei/shared/asset-upload-settings';
import { randomId } from '#layers/thei/shared/utils/random-id';
import { EntityPrefix, generateUnique, generateUniqueId } from '../entity-id';
import { extractDominantHue } from './image-color';
import { extractVideoThumbnail } from './video-thumbnail';
import { getImageDimensions, inspectVideo } from './process';

const VIDEO_PREVIEW_SETTINGS_KEY = `v${ASSET_UPLOAD_SETTINGS_VERSION}:internal:video-preview`;

export interface StoredAssetRecord {
  assetUuid: string;
  slug: string;
  extension: string;
  rawHash: string;
  settingsKey: string;
  settingsVersion: number;
  settings: AssetUploadSettings | null;
  type: AssetType;
  size: number;
  meta: AssetMeta | null;
}

export interface StoreAssetInput {
  buffer: Buffer;
  extension: string;
  rawHash: string;
  settingsKey: string;
  settingsVersion: number;
  settings: AssetUploadSettings | null;
  type: AssetType;
  meta: AssetMeta | null;
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function createVideoPreviewAsset(videoBuffer: Buffer): Promise<{
  previewAssetUuid: string;
  dominantHue?: number;
}> {
  const previewBuffer = await extractVideoThumbnail(videoBuffer);
  const previewHash = sha256(previewBuffer);
  const existing = await THEI_SERVER.assets.findBySettingsKey(
    previewHash,
    VIDEO_PREVIEW_SETTINGS_KEY,
  );

  if (existing) {
    const meta = existing.meta as ImageAssetMeta | null;
    await THEI_SERVER.assets.touch(existing.assetUuid);
    return {
      previewAssetUuid: existing.assetUuid,
      dominantHue: meta?.dominantHue,
    };
  }

  const dimensions = await getImageDimensions(previewBuffer).catch(() => ({}));
  const dominantHue = await extractDominantHue(previewBuffer, 'webp');
  const meta: ImageAssetMeta = {
    ...dimensions,
    ...(dominantHue !== undefined ? { dominantHue } : {}),
  };

  const { asset } = await storeAsset({
    buffer: previewBuffer,
    extension: 'webp',
    rawHash: previewHash,
    settingsKey: VIDEO_PREVIEW_SETTINGS_KEY,
    settingsVersion: ASSET_UPLOAD_SETTINGS_VERSION,
    settings: null,
    type: AssetType.Image,
    meta,
  });

  return {
    previewAssetUuid: asset.assetUuid,
    dominantHue,
  };
}

export async function attachVideoPreviewUsage(
  videoAssetUuid: string,
  previewAssetUuid: string,
) {
  await THEI_SERVER.assets.usages.attach(
    previewAssetUuid,
    'asset',
    videoAssetUuid,
    'preview',
  );
}

export async function findVideoPreviewAsset(asset: StoredAssetRecord) {
  return (
    await THEI_SERVER.assets.usages.findByContainer('asset', asset.assetUuid)
  ).find((usage) => usage.role === 'preview')?.asset;
}

export async function storeAsset(input: StoreAssetInput): Promise<{
  asset: StoredAssetRecord;
  created: boolean;
}> {
  const existing = await THEI_SERVER.assets.findBySettingsKey(
    input.rawHash,
    input.settingsKey,
  );

  if (existing) {
    await THEI_SERVER.assets.touch(existing.assetUuid);
    return { asset: normalizeAssetRecord(existing), created: false };
  }

  const assetUuid = await generateUniqueId(
    EntityPrefix.Asset,
    async (id) => !(await THEI_SERVER.assets.findByUuid(id)),
  );
  const slug = await generateUnique(
    () => randomId(32),
    async (candidate) => !(await THEI_SERVER.assets.findBySlug(candidate)),
  );
  const filePath = THEI_SERVER.assets.filePath(assetUuid, input.extension);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, input.buffer);

  const asset: StoredAssetRecord = {
    assetUuid,
    slug,
    extension: input.extension,
    rawHash: input.rawHash,
    settingsKey: input.settingsKey,
    settingsVersion: input.settingsVersion,
    settings: input.settings,
    type: input.type,
    size: input.buffer.length,
    meta: input.meta,
  };

  try {
    await THEI_SERVER.assets.create(asset);
    return { asset, created: true };
  } catch {
    await rm(filePath, { force: true }).catch(() => {});
    const recovered = await THEI_SERVER.assets.findBySettingsKey(
      input.rawHash,
      input.settingsKey,
    );
    if (recovered) {
      await THEI_SERVER.assets.touch(recovered.assetUuid);
      return { asset: normalizeAssetRecord(recovered), created: false };
    }
    throw createError({ statusCode: 500, message: 'Failed to save asset' });
  }
}

export async function buildAssetVariantInfo(
  asset: StoredAssetRecord,
): Promise<AssetVariantInfo> {
  const assetUrl = buildAssetPreviewUrl(asset.slug, asset.extension);

  const base = {
    assetUuid: asset.assetUuid,
    slug: asset.slug,
    extension: asset.extension,
    size: asset.size,
    settingsKey: asset.settingsKey,
    settingsVersion: asset.settingsVersion,
    assetUrl,
    isOriginal: asset.settings?.type === 'original',
  };

  if (asset.type === AssetType.Image) {
    return {
      ...base,
      type: AssetType.Image,
      meta: asset.meta as ImageAssetMeta | null,
      settings: asset.settings as
        | AssetOriginalSettings
        | AssetImageTransformSettings
        | null,
      previewUrl: assetUrl,
    };
  }

  if (asset.type === AssetType.Video) {
    const meta = await resolveVideoMeta(asset);
    let previewUrl = assetUrl;
    const preview = await findVideoPreviewAsset(asset);
    if (preview) {
      previewUrl = buildAssetPreviewUrl(preview.slug, preview.extension);
    }

    return {
      ...base,
      type: AssetType.Video,
      meta,
      settings: asset.settings as
        | AssetOriginalSettings
        | AssetVideoTransformSettings
        | null,
      previewUrl,
      videoUrl: assetUrl,
    };
  }

  if (asset.type === AssetType.Audio) {
    return {
      ...base,
      type: AssetType.Audio,
      meta: asset.meta as AudioAssetMeta | null,
      settings: asset.settings as AssetOriginalSettings | null,
    };
  }

  return {
    ...base,
    type: AssetType.Other,
    meta: asset.meta as OtherAssetMeta | null,
    settings: asset.settings as
      | AssetOriginalSettings
      | AssetFileZipSettings
      | null,
  };
}

async function resolveVideoMeta(
  asset: StoredAssetRecord,
): Promise<VideoAssetMeta | null> {
  const meta = asset.meta as VideoAssetMeta | null;
  if (meta?.width && meta.height && meta.audio && meta.audio !== 'unknown') {
    return meta;
  }

  const filePath = THEI_SERVER.assets.filePath(
    asset.assetUuid,
    asset.extension,
  );
  const inspected = await readFile(filePath)
    .then((buffer) => inspectVideo(buffer))
    .catch(() => null);

  if (!inspected) return meta;

  const resolvedMeta: VideoAssetMeta = {
    ...(meta ?? {}),
    ...(inspected.width ? { width: inspected.width } : {}),
    ...(inspected.height ? { height: inspected.height } : {}),
    audio: inspected.hasAudio ? 'keep' : 'none',
  };
  await THEI_SERVER.assets.update(asset.assetUuid, { meta: resolvedMeta });
  asset.meta = resolvedMeta;
  return resolvedMeta;
}

export async function deleteStoredAsset(assetUuid: string): Promise<boolean> {
  const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
  if (!asset) return false;
  if (await hasAssetUsage(assetUuid)) return false;

  const filePath = THEI_SERVER.assets.filePath(
    asset.assetUuid,
    asset.extension,
  );
  const previewUuid =
    asset.type === AssetType.Video
      ? (await findVideoPreviewAsset(asset))?.assetUuid
      : undefined;

  await rm(filePath, { force: true }).catch(() => {});
  await THEI_SERVER.assets.delete(asset.assetUuid);

  if (previewUuid) {
    await THEI_SERVER.assets.usages.detach(
      previewUuid,
      'asset',
      asset.assetUuid,
      'preview',
    );
  }
  if (previewUuid && !(await hasPreviewReference(previewUuid))) {
    await deleteStoredAsset(previewUuid);
  }

  return true;
}

function normalizeAssetRecord(asset: StoredAssetRecord): StoredAssetRecord {
  return {
    assetUuid: asset.assetUuid,
    slug: asset.slug,
    extension: asset.extension,
    rawHash: asset.rawHash,
    settingsKey: asset.settingsKey,
    settingsVersion: asset.settingsVersion,
    settings: asset.settings,
    type: asset.type,
    size: asset.size,
    meta: asset.meta ?? null,
  };
}

async function hasAssetUsage(assetUuid: string): Promise<boolean> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = await db
    .select({ assetUuid: schema.assetUsages.assetUuid })
    .from(schema.assetUsages)
    .where(eq(schema.assetUsages.assetUuid, assetUuid))
    .limit(1);
  return rows.length > 0;
}

async function hasPreviewReference(previewAssetUuid: string): Promise<boolean> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = await db
    .select({ assetUuid: schema.assetUsages.assetUuid })
    .from(schema.assetUsages)
    .where(eq(schema.assetUsages.assetUuid, previewAssetUuid))
    .limit(1);
  return rows.length > 0;
}
