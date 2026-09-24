import type { AssetDraftSource } from '#layers/thei/shared/api/asset-draft';
import {
  openDraft,
  prepareDraftDirectory,
} from '../../../../thei/assets/drafts';
import { findStoredAssetByHash } from '../../../../thei/assets/lookup';
import { validateFileInput } from '../../../../thei/assets/upload-request';
import {
  readUploadFileHeaders,
  stageUploadBody,
} from '../../../../thei/assets/upload-stream';

/**
 * Stages a file the editor is about to work on.
 *
 * The body is streamed to disk once, like any upload, and kept as a draft:
 * every dry run and the final result are made from it, so trying settings
 * never sends the file again. Nothing enters the library here.
 */
export default defineEventHandler(async (event): Promise<AssetDraftSource> => {
  const { extension, sourceType, maxSizeBytes, acceptedExtensions } =
    readUploadFileHeaders(event);
  const draft = await prepareDraftDirectory(extension);
  const staged = await stageUploadBody(event, {
    maxSizeBytes,
    path: draft.sourcePath,
  });

  try {
    validateFileInput({
      extension,
      size: staged.size,
      maxSizeBytes,
      acceptedExtensions,
    });
    // A file already in the library joins that file's family, so its
    // variants are listed together however it arrived.
    const match = await findStoredAssetByHash(staged.hash, staged.size);
    return await openDraft({
      id: draft.id,
      directory: draft.directory,
      source: {
        path: staged.path,
        size: staged.size,
        hash: staged.hash,
        extension,
        owned: true,
      },
      type: sourceType,
      familyUuid: match?.familyUuid ?? `af-${staged.hash}`,
    });
  } catch (error) {
    await staged.discard();
    throw error;
  }
});
