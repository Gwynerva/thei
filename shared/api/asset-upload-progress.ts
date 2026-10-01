import type { AssetUploadResponse } from './asset';

/**
 * Where a variant being stored is, for whoever waits on it.
 *
 * `queued` is a job waiting for a processing slot: without it a queued
 * upload is indistinguishable from a stalled one. `processing` is the encode
 * itself, with the share done when the encoder says so — ffmpeg and the zip
 * writer do, sharp does not. `finishing` is what follows the encode: the
 * preview and the move into the library, short but not instant.
 */
export interface AssetUploadProgress {
  phase: 'queued' | 'processing' | 'finishing';
  /** 0..1 of the encode, while the encoder reports it. */
  progress?: number;
}

/**
 * A commit run as a job of the server's own — a video encode, a zip — that
 * the client follows by polling: the phases above while it runs, then what
 * it made or why it failed. A failure keeps the error's fields, so the client
 * reads it as it would the answer of the request itself.
 */
export type AssetJobStatus =
  | AssetUploadProgress
  | { phase: 'done'; asset: AssetUploadResponse }
  | { phase: 'failed'; message: string; statusCode?: number; data?: unknown };

export function isSettledJob(
  status: AssetJobStatus,
): status is Exclude<AssetJobStatus, AssetUploadProgress> {
  return status.phase === 'done' || status.phase === 'failed';
}
