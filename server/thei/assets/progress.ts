export interface AssetUploadProgress {
  phase: 'processing';
  progress?: number;
}

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
  setTimeout(() => uploadProgress.delete(uploadId), 60_000);
}
