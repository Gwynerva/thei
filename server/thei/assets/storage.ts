import type { ImageAccent } from '#layers/thei/shared/accent-color';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { and, eq } from 'drizzle-orm';
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
import { extractImageAccent } from './image-color';
import { inspectVideo } from './process';
import {
  createMediaPreview,
  MEDIA_PREVIEW_VERSION,
  MEDIA_PREVIEW_WEBP_QUALITY,
  MEDIA_PREVIEW_MAX_LONG_SIDE,
} from './media-preview';
import type { MediaDescriptor } from '#layers/thei/shared/media';

const MEDIA_PREVIEW_SETTINGS_KEY =
  `v${ASSET_UPLOAD_SETTINGS_VERSION}:internal:media-preview-v${MEDIA_PREVIEW_VERSION}` +
  `:q${MEDIA_PREVIEW_WEBP_QUALITY}:max${MEDIA_PREVIEW_MAX_LONG_SIDE}`;

export interface StoredAssetRecord {
  assetUuid: string;
  familyUuid: string;
  contentHash: string;
  slug: string;
  extension: string;
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
  familyUuid: string;
  settingsKey: string;
  settingsVersion: number;
  settings: AssetUploadSettings | null;
  type: AssetType;
  meta: AssetMeta | null;
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function createMediaPreviewAsset(
  sourceBuffer: Buffer,
  sourceType: AssetType.Image | AssetType.Video,
): Promise<{
  previewAssetUuid: string;
  accent?: ImageAccent;
}> {
  const preview = await createMediaPreview(sourceBuffer, sourceType);
  const previewBuffer = preview.buffer;
  const previewHash = sha256(previewBuffer);
  const previewFamilyUuid = `preview-${previewHash}`;
  const existing = await THEI_SERVER.assets.findByIdentity(
    previewFamilyUuid,
    previewHash,
    MEDIA_PREVIEW_SETTINGS_KEY,
  );

  if (existing) {
    const meta = existing.meta as ImageAssetMeta | null;
    await THEI_SERVER.assets.touch(existing.assetUuid);
    return {
      previewAssetUuid: existing.assetUuid,
      accent: meta?.accent,
    };
  }

  const accent = await extractImageAccent(previewBuffer);
  const meta: ImageAssetMeta = {
    width: preview.width,
    height: preview.height,
    ...(accent !== undefined ? { accent } : {}),
  };

  const { asset } = await storeAsset({
    buffer: previewBuffer,
    extension: 'webp',
    familyUuid: previewFamilyUuid,
    settingsKey: MEDIA_PREVIEW_SETTINGS_KEY,
    settingsVersion: ASSET_UPLOAD_SETTINGS_VERSION,
    settings: null,
    type: AssetType.Image,
    meta,
  });

  return {
    previewAssetUuid: asset.assetUuid,
    accent,
  };
}

export async function attachMediaPreviewUsage(
  mediaAssetUuid: string,
  previewAssetUuid: string,
) {
  await THEI_SERVER.assets.usages.attach(
    previewAssetUuid,
    'asset',
    mediaAssetUuid,
    'preview',
  );
}

export async function findMediaPreviewAsset(asset: StoredAssetRecord) {
  return (
    await THEI_SERVER.assets.usages.findByContainer('asset', asset.assetUuid)
  ).find((usage) => usage.role === 'preview')?.asset;
}

export async function storeAsset(input: StoreAssetInput): Promise<{
  asset: StoredAssetRecord;
  created: boolean;
}> {
  const contentHash = sha256(input.buffer);
  const existing = await THEI_SERVER.assets.findByIdentity(
    input.familyUuid,
    contentHash,
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
    familyUuid: input.familyUuid,
    contentHash,
    slug,
    extension: input.extension,
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
    const recovered = await THEI_SERVER.assets.findByIdentity(
      input.familyUuid,
      contentHash,
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
  if (asset.type === AssetType.Video) await resolveVideoMeta(asset);
  const preview = await findMediaPreviewAsset(asset);
  return describeStoredAsset(asset, preview?.assetUuid);
}

/** Pure descriptor construction for paginated lists with preloaded previews. */
export function describeStoredAsset(
  asset: StoredAssetRecord,
  previewAssetUuid?: string,
): AssetVariantInfo {
  const assetUrl = buildAssetPreviewUrl(asset.assetUuid);

  const base = {
    assetUuid: asset.assetUuid,
    familyUuid: asset.familyUuid,
    contentHash: asset.contentHash,
    slug: asset.slug,
    extension: asset.extension,
    size: asset.size,
    settingsKey: asset.settingsKey,
    settingsVersion: asset.settingsVersion,
    assetUrl,
    isUnprocessed: asset.settings?.type === 'original',
  };

  if (asset.type === AssetType.Image) {
    const media = describeMedia(asset, previewAssetUuid);
    return {
      ...base,
      type: AssetType.Image,
      meta: asset.meta as ImageAssetMeta | null,
      settings: asset.settings as
        AssetOriginalSettings | AssetImageTransformSettings | null,
      media,
    };
  }

  if (asset.type === AssetType.Video) {
    const meta = asset.meta as VideoAssetMeta | null;
    const media = describeMedia(asset, previewAssetUuid);

    return {
      ...base,
      type: AssetType.Video,
      meta,
      settings: asset.settings as
        AssetOriginalSettings | AssetVideoTransformSettings | null,
      media,
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
      AssetOriginalSettings | AssetFileZipSettings | null,
  };
}

export async function buildStoredMediaDescriptor(
  asset: StoredAssetRecord,
  resolvedMeta: AssetMeta | null = asset.meta,
): Promise<MediaDescriptor> {
  if (asset.type !== AssetType.Image && asset.type !== AssetType.Video) {
    throw new Error('Cannot build media descriptor for a non-media asset');
  }
  const preview = await findMediaPreviewAsset(asset);
  return describeMedia({ ...asset, meta: resolvedMeta }, preview?.assetUuid);
}

function describeMedia(asset: StoredAssetRecord, previewAssetUuid?: string): MediaDescriptor {
  if (asset.type !== AssetType.Image && asset.type !== AssetType.Video)
    throw new Error('Cannot describe non-media asset');
  const previewSrc = previewAssetUuid
    ? buildAssetPreviewUrl(previewAssetUuid)
    : buildAssetPreviewUrl(asset.assetUuid);
  const meta = asset.meta as ImageAssetMeta | VideoAssetMeta | null;
  return {
    src: buildAssetPreviewUrl(asset.assetUuid),
    kind: asset.type,
    previewSrc,
    ...(meta?.accent !== undefined ? { accent: meta.accent } : {}),
    ...(meta?.width ? { width: meta.width } : {}),
    ...(meta?.height ? { height: meta.height } : {}),
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

export async function deleteStoredAsset(
  assetUuid: string,
  cutoffMs?: number,
): Promise<boolean> {
  const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
  if (!asset) return false;
  if (await hasAssetUsage(assetUuid)) return false;

  const filePath = THEI_SERVER.assets.filePath(
    asset.assetUuid,
    asset.extension,
  );
  const previewUuid =
    asset.type === AssetType.Video || asset.type === AssetType.Image
      ? (await findMediaPreviewAsset(asset))?.assetUuid
      : undefined;

  // Check again inside the same transaction as deletion: selection/saving may
  // have refreshed the asset after the cleanup candidate list was collected.
  const { db, schema } = THEI_SERVER.useDb();
  const deleted = db.transaction((tx) => {
    const current = tx
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.assetUuid, assetUuid))
      .get();
    if (!current || (cutoffMs !== undefined && current.touchedAt >= cutoffMs))
      return false;
    const usage = tx
      .select({ id: schema.assetUsages.assetUuid })
      .from(schema.assetUsages)
      .where(eq(schema.assetUsages.assetUuid, assetUuid))
      .get();
      if (usage) return false;
      tx.delete(schema.assetUsages).where(and(
        eq(schema.assetUsages.containerType, 'asset'),
        eq(schema.assetUsages.containerId, assetUuid),
      )).run();
    tx.delete(schema.assets)
      .where(eq(schema.assets.assetUuid, assetUuid))
      .run();
    return true;
  });
  if (!deleted) return false;
  await rm(filePath, { force: true }).catch(() => {});

    if (previewUuid && !(await hasPreviewReference(previewUuid))) {
      // A concurrent transform may have just reused this preview before attaching it.
      await deleteStoredAsset(previewUuid, cutoffMs ?? Date.now() - 24 * 60 * 60 * 1000);
  }

  return true;
}

function normalizeAssetRecord(asset: StoredAssetRecord): StoredAssetRecord {
  return {
    assetUuid: asset.assetUuid,
    familyUuid: asset.familyUuid,
    contentHash: asset.contentHash,
    slug: asset.slug,
    extension: asset.extension,
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
