import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { getPathExtension } from '#layers/thei/shared/assets/extensions';
import { inferAssetType } from '../../../thei/assets/process';
import { createAssetVariant } from '../../../thei/assets/create-variant';
import {
  clearAssetUploadProgress,
  setAssetUploadProgress,
} from '../../../thei/assets/progress';
import {
  parseAcceptedExtensions,
  parseAssetUploadSettings,
  parseOptionalPositiveInt,
  parseSizeLimitPolicy,
  resolveMaxSizeBytes,
  validateFileInput,
  validateSizeLimitPolicy,
  validateUploadContentLength,
} from '../../../thei/assets/upload-request';

export default defineEventHandler(
  async (event): Promise<AssetUploadResponse> => {
    let uploadId: string | undefined;
    try {
      validateUploadContentLength(getHeader(event, 'content-length'));
      const parts = await readMultipartFormData(event);
      if (!parts) {
        throw createError({ statusCode: 400, message: 'No multipart data' });
      }

      const filePart = parts.find((part) => part.name === 'file');
      const familyUuid = readPartString(parts, 'familyUuid');
      const settings = parseAssetUploadSettings(
        readPartString(parts, 'settings'),
      );
      uploadId = readPartString(parts, 'uploadId', false);
      const requestedMaxSizeBytes = parseOptionalPositiveInt(
        readPartString(parts, 'maxSizeBytes', false),
      );
      const sizeLimitPolicy = parseSizeLimitPolicy(
        readPartString(parts, 'sizeLimitPolicy', false),
      );
      const maxSizeBytes = resolveMaxSizeBytes(
        sizeLimitPolicy,
        requestedMaxSizeBytes,
      );
      const acceptedExtensions = parseAcceptedExtensions(
        readPartString(parts, 'acceptedExtensions', false),
      );

      if (!filePart?.data || !filePart.filename || !familyUuid) {
        throw createError({
          statusCode: 400,
          message: 'Missing required fields: file, familyUuid, settings',
        });
      }

      if (familyUuid.length > 100) {
        throw createError({
          statusCode: 400,
          message: 'Invalid familyUuid',
        });
      }

      const sourceExtension = getPathExtension(filePart.filename);
      validateFileInput({
        extension: sourceExtension,
        size: filePart.data.length,
        maxSizeBytes,
        acceptedExtensions,
      });
      const sourceType = inferAssetType(sourceExtension);
      validateSizeLimitPolicy(sizeLimitPolicy, sourceType);

      const result = await createAssetVariant({
        buffer: filePart.data,
        filename: filePart.filename,
        extension: sourceExtension,
        familyUuid,
        sourceType,
        settings,
        onProgress: (progress) =>
          setAssetUploadProgress(uploadId, {
            phase: 'processing',
            progress,
          }),
      });

      clearAssetUploadProgress(uploadId);
      return result;
    } catch (error) {
      clearAssetUploadProgress(uploadId);
      throw error;
    }
  },
);

function readPartString(
  parts: NonNullable<Awaited<ReturnType<typeof readMultipartFormData>>>,
  name: string,
  required = true,
): string {
  const value = parts.find((part) => part.name === name)?.data.toString();
  if (required && !value) {
    throw createError({
      statusCode: 400,
      message: `Missing required field: ${name}`,
    });
  }
  return value ?? '';
}
