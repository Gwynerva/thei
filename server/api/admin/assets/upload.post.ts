import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  buildAssetPreviewUrl,
  type AssetUploadResponse,
} from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';
import type { AssetProfileId } from '#layers/thei/shared/asset-profiles';
import {
  AssetType,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
} from '#layers/thei/shared/asset';
import type { AssetMeta } from '#layers/thei/shared/asset';
import { randomId } from '#layers/thei/shared/utils/random-id';
import {
  EntityPrefix,
  generateUnique,
  generateUniqueId,
} from '../../../thei/entity-id';
import { extractDominantHue } from '../../../thei/assets/image-color';
import { extractVideoThumbnail } from '../../../thei/assets/video-thumbnail';

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXTS = new Set<string>(VIDEO_EXTENSIONS);
const AUDIO_EXTS = new Set<string>(AUDIO_EXTENSIONS);
const VIDEO_PREVIEW_PROFILE_ID: AssetProfileId = 'showcase-video-preview';

function inferAssetType(ext: string): AssetType {
  if (IMAGE_EXTS.has(ext)) return AssetType.Image;
  if (VIDEO_EXTS.has(ext)) return AssetType.Video;
  if (AUDIO_EXTS.has(ext)) return AssetType.Audio;
  return AssetType.Other;
}

async function createAssetWithDedupRecovery(
  asset: Parameters<typeof THEI_SERVER.assets.create>[0],
  filePath: string,
) {
  try {
    await THEI_SERVER.assets.create(asset);
    return { asset, created: true as const };
  } catch {
    await rm(filePath, { force: true }).catch(() => {});
    const existing = await THEI_SERVER.assets.findByHash(
      asset.rawHash,
      asset.profileId,
    );
    if (existing) {
      await THEI_SERVER.assets.touch(existing.assetUuid);
      return { asset: existing, created: false as const };
    }
    throw createError({ statusCode: 500, message: 'Failed to save asset' });
  }
}

export default defineEventHandler(
  async (event): Promise<AssetUploadResponse> => {
    const parts = await readMultipartFormData(event);
    if (!parts)
      throw createError({ statusCode: 400, message: 'No multipart data' });

    const filePart = parts.find((p) => p.name === 'file');
    const profileIdPart = parts.find((p) => p.name === 'profileId');
    const rawHashPart = parts.find((p) => p.name === 'rawHash');

    if (!filePart?.data || !profileIdPart || !rawHashPart) {
      throw createError({
        statusCode: 400,
        message: 'Missing required fields: file, profileId, rawHash',
      });
    }

    const profileId = profileIdPart.data.toString() as AssetProfileId;
    const rawHash = rawHashPart.data.toString();
    const profile = ASSET_PROFILES[profileId];
    if (!profile)
      throw createError({
        statusCode: 400,
        message: `Unknown profile: ${profileId}`,
      });

    const originalName = filePart.filename ?? '';
    const originalExt = originalName.includes('.')
      ? originalName.split('.').pop()!.toLowerCase()
      : '';

    if (
      profile.acceptedExtensions !== '*' &&
      !isOneOf(originalExt, profile.acceptedExtensions)
    ) {
      throw createError({
        statusCode: 400,
        message: `File type .${originalExt} is not accepted by the ${profile.label} profile`,
      });
    }
    if (filePart.data.length > profile.maxSizeBytes) {
      throw createError({
        statusCode: 400,
        message: `File exceeds the maximum allowed size`,
      });
    }

    // Race condition guard: check dedup again server-side
    const existing = await THEI_SERVER.assets.findByHash(rawHash, profileId);
    if (existing) {
      await THEI_SERVER.assets.touch(existing.assetUuid);
      const existingMeta = existing.meta ?? null;
      let videoPreviewUrl: string | undefined;
      if (profile.hasVideoPreview && existingMeta?.previewAssetUuid) {
        const thumb = await THEI_SERVER.assets.findByUuid(
          existingMeta.previewAssetUuid,
        );
        if (thumb) {
          videoPreviewUrl = buildAssetPreviewUrl(thumb.slug, 'webp');
        }
      }
      return {
        assetUuid: existing.assetUuid,
        slug: existing.slug,
        extension: existing.extension,
        meta: existingMeta,
        size: existing.size,
        videoPreviewUrl,
      };
    }

    const { buffer, extension, width, height } =
      await THEI_SERVER.assets.process(filePart.data, profile, originalExt);

    const assetType = inferAssetType(extension);
    const isShowcaseVideo = profile.hasVideoPreview === true;

    // For showcase video uploads: extract thumbnail first so we can link it in
    // the video asset's meta at creation time.
    let thumbnailUuid: string | undefined;
    let thumbnailSlug: string | undefined;
    if (isShowcaseVideo) {
      const thumbBuffer = await extractVideoThumbnail(buffer);
      const thumbHash = createHash('sha256').update(thumbBuffer).digest('hex');

      const existingThumb = await THEI_SERVER.assets.findByHash(
        thumbHash,
        VIDEO_PREVIEW_PROFILE_ID,
      );
      if (existingThumb) {
        await THEI_SERVER.assets.touch(existingThumb.assetUuid);
        thumbnailUuid = existingThumb.assetUuid;
        thumbnailSlug = existingThumb.slug;
      } else {
        thumbnailUuid = await generateUniqueId(
          EntityPrefix.Asset,
          async (id) => !(await THEI_SERVER.assets.findByUuid(id)),
        );
        thumbnailSlug = await generateUnique(
          () => randomId(32),
          async (candidate) =>
            !(await THEI_SERVER.assets.findBySlug(candidate)),
        );
        const thumbPath = THEI_SERVER.assets.filePath(thumbnailUuid, 'webp');
        await mkdir(dirname(thumbPath), { recursive: true });
        await writeFile(thumbPath, thumbBuffer);
        const thumbnailCreateResult = await createAssetWithDedupRecovery(
          {
            assetUuid: thumbnailUuid,
            slug: thumbnailSlug,
            extension: 'webp',
            profileId: VIDEO_PREVIEW_PROFILE_ID,
            rawHash: thumbHash,
            type: AssetType.Image,
            size: thumbBuffer.length,
            meta: null,
          },
          thumbPath,
        ).catch(() => {
          throw createError({
            statusCode: 500,
            message: 'Failed to save video thumbnail',
          });
        });
        thumbnailUuid = thumbnailCreateResult.asset.assetUuid;
        thumbnailSlug = thumbnailCreateResult.asset.slug;
        if (!thumbnailUuid || !thumbnailSlug) {
          throw createError({
            statusCode: 500,
            message: 'Failed to save video thumbnail',
          });
        }
      }
    }

    const dominantHue = await extractDominantHue(buffer, extension);
    const meta: AssetMeta | null =
      assetType === AssetType.Image &&
      width !== undefined &&
      height !== undefined
        ? {
            width,
            height,
            ...(dominantHue !== undefined ? { dominantHue } : {}),
          }
        : thumbnailUuid
          ? { previewAssetUuid: thumbnailUuid }
          : null;

    const assetUuid = await generateUniqueId(
      EntityPrefix.Asset,
      async (id) => !(await THEI_SERVER.assets.findByUuid(id)),
    );
    const slug = await generateUnique(
      () => randomId(32),
      async (candidate) => !(await THEI_SERVER.assets.findBySlug(candidate)),
    );
    const filePath = THEI_SERVER.assets.filePath(assetUuid, extension);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);

    const createResult = await createAssetWithDedupRecovery(
      {
        assetUuid,
        slug,
        extension,
        profileId,
        rawHash,
        type: inferAssetType(extension),
        size: buffer.length,
        meta,
      },
      filePath,
    );

    const videoPreviewUrl = thumbnailSlug
      ? buildAssetPreviewUrl(thumbnailSlug, 'webp')
      : undefined;

    return {
      assetUuid: createResult.asset.assetUuid,
      slug: createResult.asset.slug,
      extension: createResult.asset.extension,
      meta: createResult.asset.meta ?? null,
      size: createResult.asset.size,
      videoPreviewUrl,
    };
  },
);
