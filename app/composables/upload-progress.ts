import type { AssetUploadProgress } from '#layers/thei/shared/api/asset-upload-progress';

/**
 * Where a file on its way into the library is: still leaving the browser,
 * or in one of the server's phases.
 */
export type UploadStatus =
  { phase: 'staging'; progress: number } | AssetUploadProgress;

/**
 * Follows a job by the `uploadId` the client gave it.
 *
 * Polled, since the answer travels with the request itself and only the wait
 * is reported. One request at a time: the next is scheduled once the last
 * has answered, so a slow server never sees them pile up. Returns what stops
 * following.
 */
export function trackUploadProgress(
  uploadId: string,
  onStatus: (status: AssetUploadProgress) => void,
  intervalMs = 500,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      const status = await $fetch<AssetUploadProgress | null>(
        `/api/admin/uploads/${uploadId}`,
      );
      if (status && !stopped) onStatus(status);
    } catch {
      // Errors surface through the request itself.
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** The status in words, with the share done where one is known. */
export function uploadStatusLabel(
  status: UploadStatus | null | undefined,
): string {
  if (!status) return phrase.value.upload_processing;
  if (status.phase === 'staging') {
    return phrase.value.upload_staging(Math.round(status.progress * 100));
  }
  if (status.phase === 'queued') return phrase.value.upload_queued;
  if (status.phase === 'finishing') return phrase.value.upload_finishing;
  return status.progress === undefined
    ? phrase.value.upload_processing
    : `${phrase.value.upload_processing} ${Math.round(status.progress * 100)}%`;
}
