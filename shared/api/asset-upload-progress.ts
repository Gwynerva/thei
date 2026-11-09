import type { AssetUploadResponse } from './asset';

/**
 * Where a variant being stored is, for whoever waits on it.
 *
 * `queued` is a job waiting for a processing slot: without it a queued
 * upload is indistinguishable from a stalled one. `processing` is everything
 * from there to the answer: the encode, then the preview and the move into
 * the library. The share done is told when the encoder says so — ffmpeg and
 * the zip writer do, sharp does not — and only ever grows: the encode takes
 * the share up to `ENCODE_PROGRESS_SHARE`, and what follows it stands at
 * `FINISHING_PROGRESS` until the answer. One phase and one number, rather
 * than a word for each step nobody can tell apart.
 */
export interface AssetUploadProgress {
  phase: 'queued' | 'processing';
  /** 0..1 of the work, while any of it is measured; never going back. */
  progress?: number;
}

/** The share of the work the encode itself is given, of a measured one. */
export const ENCODE_PROGRESS_SHARE = 0.9;
/** Where a measured upload stands while its preview is made and it is moved. */
export const FINISHING_PROGRESS = 0.95;

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
