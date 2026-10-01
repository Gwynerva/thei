import type { AssetUploadProgress } from '#layers/thei/shared/api/asset-upload-progress';

/**
 * Progress of uploads the client follows by an id of its own choosing, in
 * memory: a restart forgets it, and the request itself still answers.
 */
const uploadProgress = new Map<string, AssetUploadProgress>();

export function setAssetUploadProgress(
  uploadId: string | undefined,
  progress: AssetUploadProgress,
) {
  if (!uploadId) return;
  uploadProgress.set(uploadId, progress);
}

export function getAssetUploadProgress(uploadId: string) {
  return uploadProgress.get(uploadId) ?? null;
}

export function clearAssetUploadProgress(uploadId: string | undefined) {
  if (!uploadId) return;
  setTimeout(() => uploadProgress.delete(uploadId), 60_000).unref();
}

/** The status callback of a job the client follows by `uploadId`, if any. */
export function uploadStatusReporter(uploadId: string | undefined) {
  return (status: AssetUploadProgress) =>
    setAssetUploadProgress(uploadId, status);
}
