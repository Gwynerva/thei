import type { ImageAccent } from '#layers/thei/shared/accent-color';
import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
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
  type AssetFileZipSettings,
  type AssetImageTransformSettings,
  type AssetOriginalSettings,
  type AssetUploadSettings,
  type AssetVideoTransformSettings,
} from '#layers/thei/shared/asset-upload-settings';
import { randomId } from '#layers/thei/shared/utils/random-id';
import { EntityPrefix, generateUnique, generateUniqueId } from '../entity-id';
import { extractImageAccent } from './image-color';
import { inspectVideoFile } from './process';
import { createMediaPreview, MEDIA_PREVIEW_EXTENSION } from './media-preview';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import {
  assetBytesHash,
  assetBytesSize,
  sha256,
  type AssetBytes,
} from './bytes';

export { sha256, type AssetBytes };

/**
 * Previews are content-addressed twice over: `familyUuid` is `preview-<hash>`
 * and `contentHash` is that same hash, so the key carries no identity of its
 * own and stays constant on purpose. Encoding the preview parameters here
 * would mean that raising the size cap writes a second, byte-identical copy of
 * every preview whose source was already smaller than the old cap.
 */
const MEDIA_PREVIEW_SETTINGS_KEY = 'internal:media-preview';

export interface StoredAssetRecord {
  assetUuid: string;
  familyUuid: string;
  contentHash: string;
  slug: string;
  extension: string;
  settingsKey: string;
  settings: AssetUploadSettings | null;
  type: AssetType;
  size: number;
  meta: AssetMeta | null;
}

export interface StoreAssetInput {
  bytes: AssetBytes;
  extension: string;
  familyUuid: string;
  settingsKey: string;
  settings: AssetUploadSettings | null;
  type: AssetType;
  meta: AssetMeta | null;
}

export async function createMediaPreviewAsset(
  source: AssetBytes,
  sourceType: AssetType.Image | AssetType.Video,
): Promise<{
  previewAssetUuid: string;
  accent?: ImageAccent;
}> {
  const preview = await createMediaPreview(source, sourceType);
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
    bytes: { buffer: previewBuffer },
    extension: MEDIA_PREVIEW_EXTENSION,
    familyUuid: previewFamilyUuid,
    settingsKey: MEDIA_PREVIEW_SETTINGS_KEY,
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
  const contentHash = assetBytesHash(input.bytes);
  const size = assetBytesSize(input.bytes);
  const existing = await THEI_SERVER.assets.findByIdentity(
    input.familyUuid,
    contentHash,
    input.settingsKey,
  );

  if (existing) {
    await THEI_SERVER.assets.touch(existing.assetUuid);
    await discardScratch(input.bytes);
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
  const filePath = THEI_SERVER.assets.filePath(contentHash, input.extension);

  // These exact bytes may already be on disk under a different family or a
  // different settings key. Writing them again would be a byte-identical
  // duplicate, so the row is created against the file that is already there.
  const present = await stat(filePath).catch(() => null);
  const wroteFile = !present?.isFile() || present.size !== size;

  if (wroteFile) {
    await mkdir(dirname(filePath), { recursive: true });
    if (input.bytes.buffer) {
      await writeFile(filePath, input.bytes.buffer);
    } else if (input.bytes.owned) {
      // Move rather than copy: the scratch file already holds the exact bytes,
      // and a copy would read and write the whole file a second time.
      await adoptStagedFile(input.bytes.path, filePath);
    } else {
      await copyFile(input.bytes.path, filePath);
    }
  } else {
    // Nothing to store: the bytes are already on disk. Scratch that will never
    // be adopted has to go now, or an ffmpeg output that happened to dedup
    // would sit in the temp directory forever.
    await discardScratch(input.bytes);
  }

  const asset: StoredAssetRecord = {
    assetUuid,
    familyUuid: input.familyUuid,
    contentHash,
    slug,
    extension: input.extension,
    settingsKey: input.settingsKey,
    settings: input.settings,
    type: input.type,
    size,
    meta: input.meta,
  };

  try {
    await THEI_SERVER.assets.create(asset);
    return { asset, created: true };
  } catch {
    // Only reclaim a file this call put there. A file that was already on disk
    // belongs to whichever rows reference it.
    if (wroteFile && !(await hasBlobReference(contentHash, input.extension))) {
      await rm(filePath, { force: true }).catch(() => {});
    }
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

/** Removes a scratch file storage decided not to adopt. */
async function discardScratch(bytes: AssetBytes) {
  if (!bytes.path || !bytes.owned) return;
  await rm(bytes.path, { force: true }).catch(() => {});
}

/** Renames a staged file into the library, falling back to a copy across devices. */
async function adoptStagedFile(source: string, target: string) {
  try {
    await rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    // The scratch directory and the library are on different filesystems, so
    // the bytes have to be streamed across. Still never buffered whole.
    await pipeline(createReadStream(source), createWriteStream(target));
    await rm(source, { force: true }).catch(() => {});
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

function describeMedia(
  asset: StoredAssetRecord,
  previewAssetUuid?: string,
): MediaDescriptor {
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
    ...(asset.type === AssetType.Video &&
    typeof (meta as VideoAssetMeta | null)?.hasAudio === 'boolean'
      ? { hasAudio: (meta as VideoAssetMeta).hasAudio }
      : {}),
  };
}

async function resolveVideoMeta(
  asset: StoredAssetRecord,
): Promise<VideoAssetMeta | null> {
  const meta = asset.meta as VideoAssetMeta | null;
  if (meta?.width && meta.height && typeof meta.hasAudio === 'boolean') {
    return meta;
  }

  const filePath = THEI_SERVER.assets.filePath(
    asset.contentHash,
    asset.extension,
  );
  const inspected = await inspectVideoFile(filePath).catch(() => null);

  if (!inspected) return meta;

  const resolvedMeta: VideoAssetMeta = {
    ...(meta ?? {}),
    ...(inspected.width ? { width: inspected.width } : {}),
    ...(inspected.height ? { height: inspected.height } : {}),
    hasAudio: inspected.hasAudio,
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
    asset.contentHash,
    asset.extension,
  );
  const previewUuid =
    asset.type === AssetType.Video || asset.type === AssetType.Image
      ? (await findMediaPreviewAsset(asset))?.assetUuid
      : undefined;

  // Check again inside the same transaction as deletion: selection/saving may
  // have refreshed the asset after the cleanup candidate list was collected.
  const { db, schema } = THEI_SERVER.useDb();
  const result = db.transaction((tx) => {
    const current = tx
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.assetUuid, assetUuid))
      .get();
    if (!current || (cutoffMs !== undefined && current.touchedAt >= cutoffMs)) {
      return { deleted: false, blobOrphaned: false };
    }
    const usage = tx
      .select({ id: schema.assetUsages.assetUuid })
      .from(schema.assetUsages)
      .where(eq(schema.assetUsages.assetUuid, assetUuid))
      .get();
    if (usage) return { deleted: false, blobOrphaned: false };

    tx.delete(schema.assetUsages)
      .where(
        and(
          eq(schema.assetUsages.containerType, 'asset'),
          eq(schema.assetUsages.containerId, assetUuid),
        ),
      )
      .run();
    tx.delete(schema.assets)
      .where(eq(schema.assets.assetUuid, assetUuid))
      .run();

    // The file is shared: several rows can point at one blob when the same
    // bytes were derived from different sources. It only goes when the last
    // row referencing it does, and the count has to be taken inside this
    // transaction so a concurrent insert cannot slip in behind it.
    const sharer = tx
      .select({ assetUuid: schema.assets.assetUuid })
      .from(schema.assets)
      .where(
        and(
          eq(schema.assets.contentHash, current.contentHash),
          eq(schema.assets.extension, current.extension),
        ),
      )
      .get();

    return { deleted: true, blobOrphaned: !sharer };
  });

  if (!result.deleted) return false;
  if (result.blobOrphaned) await rm(filePath, { force: true }).catch(() => {});

  if (previewUuid && !(await hasPreviewReference(previewUuid))) {
    // A concurrent transform may have just reused this preview before
    // attaching it, so the preview keeps the same grace period as the sweep.
    await deleteStoredAsset(
      previewUuid,
      cutoffMs ?? Date.now() - 24 * 60 * 60 * 1000,
    );
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

/** True when any row still points at the file for these bytes. */
async function hasBlobReference(
  contentHash: string,
  extension: string,
): Promise<boolean> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = await db
    .select({ assetUuid: schema.assets.assetUuid })
    .from(schema.assets)
    .where(
      and(
        eq(schema.assets.contentHash, contentHash),
        eq(schema.assets.extension, extension),
      ),
    )
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
