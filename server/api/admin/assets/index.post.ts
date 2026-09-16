import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { normalizeAssetExtension } from '#layers/thei/shared/assets/formats';
import { inferAssetType } from '../../../thei/assets/process';
import { createAssetVariant } from '../../../thei/assets/create-variant';
import { findStoredAssetByHash } from '../../../thei/assets/lookup';
import { buildAssetVariantInfo } from '../../../thei/assets/storage';
import {
  assertAssetSelection,
  confirmAssetSelection,
} from '../../../thei/assets/selection';
import {
  clearAssetUploadProgress,
  setAssetUploadProgress,
} from '../../../thei/assets/progress';
import {
  readUploadHeader,
  stageUploadBody,
} from '../../../thei/assets/upload-stream';
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

/**
 * Accepts one uploaded file.
 *
 * The file is the raw request body and its metadata travels in headers, so the
 * bytes can be streamed straight to disk. Multipart was the previous shape,
 * but parsing it meant holding the whole request in memory, which a 500 MB
 * limit on a 2 GB instance could not survive.
 */
export default defineEventHandler(
  async (event): Promise<AssetUploadResponse> => {
    validateUploadContentLength(getHeader(event, 'content-length'));

    const settings = parseAssetUploadSettings(
      readUploadHeader(event, 'x-upload-settings'),
    );
    const extension = normalizeAssetExtension(
      readUploadHeader(event, 'x-upload-extension'),
    );
    const uploadId = readUploadHeader(event, 'x-upload-id', false) || undefined;
    const requestedMaxSizeBytes = parseOptionalPositiveInt(
      readUploadHeader(event, 'x-upload-max-size', false),
    );
    const sizeLimitPolicy = parseSizeLimitPolicy(
      readUploadHeader(event, 'x-upload-size-limit-policy', false),
    );
    const maxSizeBytes = resolveMaxSizeBytes(
      sizeLimitPolicy,
      requestedMaxSizeBytes,
    );
    const acceptedExtensions = parseAcceptedExtensions(
      readUploadHeader(event, 'x-upload-accepted-extensions', false),
    );

    if (!extension) {
      throw createError({
        statusCode: 400,
        message: 'Missing required field: x-upload-extension',
      });
    }

    const sourceType = inferAssetType(extension);
    // Everything that can be judged from the headers is judged before a single
    // byte of the body is read.
    validateFileInput({ extension, size: 0, acceptedExtensions });
    validateSizeLimitPolicy(sizeLimitPolicy, sourceType);

    const staged = await stageUploadBody(event, { maxSizeBytes });

    try {
      validateFileInput({
        extension,
        size: staged.size,
        maxSizeBytes,
        acceptedExtensions,
      });

      const match = await findStoredAssetByHash(staged.hash, staged.size);
      const constraints = {
        acceptedExtensions,
        maxSize: maxSizeBytes,
        sizeLimitPolicy,
      };
      if (match && settings.type === 'original') {
        assertAssetSelection(match, constraints);
        await confirmAssetSelection(match.assetUuid, constraints);
        return { ...(await buildAssetVariantInfo(match)), created: false };
      }

      const result = await createAssetVariant({
        source: {
          path: staged.path,
          size: staged.size,
          hash: staged.hash,
          extension,
          // Scratch: storage moves it into the library, and whatever is left
          // is removed by the discard below.
          owned: true,
        },
        // Concurrent first uploads use the same family even across processes.
        familyUuid: match?.familyUuid ?? `af-${staged.hash}`,
        sourceType,
        settings,
        onQueued: () => setAssetUploadProgress(uploadId, { phase: 'queued' }),
        onProgress: (progress) =>
          setAssetUploadProgress(uploadId, {
            phase: 'processing',
            progress,
          }),
      });

      assertAssetSelection(result, constraints);
      clearAssetUploadProgress(uploadId);
      return result;
    } catch (error) {
      clearAssetUploadProgress(uploadId);
      throw error;
    } finally {
      // Harmless when the file was moved into the library: it is already gone.
      await staged.discard();
    }
  },
);
