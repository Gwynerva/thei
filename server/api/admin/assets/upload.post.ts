import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';
import type { AssetProfileId } from '#layers/thei/shared/asset-profiles';
import {
  AssetType,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
} from '#layers/thei/shared/asset';
import { randomId } from '#layers/thei/shared/utils/random-id';
import { EntityPrefix, generateUnique, generateUniqueId } from '../../../thei/entity-id';

const IMAGE_EXTS = new Set<string>(IMAGE_EXTENSIONS);
const VIDEO_EXTS = new Set<string>(VIDEO_EXTENSIONS);
const AUDIO_EXTS = new Set<string>(AUDIO_EXTENSIONS);

function inferAssetType(ext: string): AssetType {
  if (IMAGE_EXTS.has(ext)) return AssetType.Image;
  if (VIDEO_EXTS.has(ext)) return AssetType.Video;
  if (AUDIO_EXTS.has(ext)) return AssetType.Audio;
  return AssetType.Other;
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
      return {
        assetUuid: existing.assetUuid,
        slug: existing.slug,
        extension: existing.extension,
      };
    }

    const { buffer, extension } = await THEI_SERVER.assets.process(
      filePart.data,
      profile,
      originalExt,
    );

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

    try {
      await THEI_SERVER.assets.create({
        assetUuid,
        slug,
        extension,
        profileId,
        rawHash,
        type: inferAssetType(extension),
        size: buffer.length,
      });
    } catch {
      await rm(filePath, { force: true }).catch(() => {});
      throw createError({ statusCode: 500, message: 'Failed to save asset' });
    }

    return { assetUuid, slug, extension };
  },
);
