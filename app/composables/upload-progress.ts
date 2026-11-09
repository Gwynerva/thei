import type { AssetUploadProgress } from '#layers/thei/shared/api/asset-upload-progress';
import type { PendingUpload } from './pending-upload';

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

/**
 * What a tile or a block shows of a file on its way: the picture the browser
 * already has of it — a video by the still the server will choose as well,
 * rather than its first frame, which is often black — where the upload is,
 * and what went wrong. `idle` is told while no attempt reports anything.
 */
export function usePendingUploadView(
  upload: () => PendingUpload | undefined,
  idle: UploadStatus | null = null,
) {
  const videoPoster = useVideoPoster(() => {
    const preview = upload()?.preview;
    return preview?.kind === 'video' ? preview.src : undefined;
  });
  const previewSrc = computed(() => {
    const preview = upload()?.preview;
    if (preview?.kind === 'image') return preview.src;
    if (preview?.kind === 'video') return videoPoster.value;
    return undefined;
  });
  const status = computed(() => upload()?.status.value ?? null);
  const error = computed(() => upload()?.error.value);
  const statusLabel = computed(
    () => error.value ?? uploadStatusLabel(status.value ?? idle),
  );
  return { previewSrc, status, error, statusLabel };
}

/**
 * The status to show next, given the one shown: the share done never goes
 * back. The server's own share only grows, but two things may report one
 * upload — the request and the job it became, each polled on its own — and
 * an answer that left the server a moment earlier must not undo a later one.
 * A step without a share keeps the last share seen in the same phase.
 */
export function advanceUploadStatus<Status extends UploadStatus>(
  shown: Status | null | undefined,
  next: Status | null,
): Status | null {
  if (!next || !shown || shown.phase !== next.phase) return next;
  if (!('progress' in shown) || shown.progress === undefined) return next;
  if (next.progress === undefined) return { ...next, progress: shown.progress };
  return next.progress < shown.progress ? shown : next;
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
  return status.progress === undefined
    ? phrase.value.upload_processing
    : `${phrase.value.upload_processing} ${Math.round(status.progress * 100)}%`;
}
