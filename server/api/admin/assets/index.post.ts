import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { createAssetVariant } from '../../../thei/assets/create-variant';
import { requestAbortSignal } from '../../../thei/assets/request-signal';
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
  readUploadFileHeaders,
  readUploadHeader,
  stageUploadBody,
} from '../../../thei/assets/upload-stream';
import {
  parseAssetUploadSettings,
  validateFileInput,
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
    const signal = requestAbortSignal(event);
    const {
      extension,
      sourceType,
      uploadId,
      maxSizeBytes,
      sizeLimitPolicy,
      acceptedExtensions,
    } = readUploadFileHeaders(event);
    const settings = parseAssetUploadSettings(
      readUploadHeader(event, 'x-upload-settings'),
    );

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
        signal,
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
