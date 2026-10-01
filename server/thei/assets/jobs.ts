import { createError } from 'h3';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import {
  isSettledJob,
  type AssetJobStatus,
  type AssetUploadProgress,
} from '#layers/thei/shared/api/asset-upload-progress';

/**
 * Commits that outlive their request.
 *
 * A video encode takes minutes and a zip of a large file the same order:
 * too long for one HTTP request, which a dropped connection or a proxy's
 * read timeout would cut short with the CPU already spent. Such a commit
 * runs here under the `uploadId` the client chose, answers `202` at once,
 * and is followed by polling `GET /api/admin/uploads/:id`; `DELETE` there
 * cancels it. Like drafts and progress, jobs live in memory: a restart
 * forgets them, and the client is told the draft is gone.
 */

/** A result stays this long for a client that polls with gaps. */
const SETTLED_KEEP_MS = 10 * 60 * 1000;
/**
 * A running job nobody has asked about for this long has lost its owner
 * and is cancelled. A safety net only: cancelling is the DELETE, sent on
 * "Cancel", on closing the editor and as the tab goes. It is generous
 * because a background tab's timers slow to once a minute, and a laptop
 * asleep for a moment must not lose a ten-minute encode.
 */
const ORPHAN_MS = 10 * 60 * 1000;
/**
 * A job still running this long after it started is stuck, polled or not:
 * no encode of a file within the upload limit takes hours, and a hung one
 * would hold its lane for good.
 */
const MAX_RUN_MS = 4 * 60 * 60 * 1000;
const SWEEP_MS = 30 * 1000;

interface UploadJob {
  id: string;
  status: AssetJobStatus;
  controller: AbortController;
  startedAt: number;
  lastSeen: number;
  settledAt?: number;
}

const jobs = new Map<string, UploadJob>();
let sweepTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Runs `run` as a job under `id`, at once and in the background. An id
 * already in use is refused rather than taken over: the job under it would
 * run on with nothing left to stop it.
 *
 * The signal given to `run` is the job's own: it lets a queued encode leave
 * its lane and kills a running ffmpeg. What `run` reports through `report`
 * is what a poll sees until the job settles.
 */
export function startUploadJob(
  id: string,
  run: (
    signal: AbortSignal,
    report: (status: AssetUploadProgress) => void,
  ) => Promise<AssetUploadResponse>,
  now = Date.now(),
): void {
  if (jobs.has(id))
    throw createError({ statusCode: 409, message: 'Upload id already in use' });
  const controller = new AbortController();
  const job: UploadJob = {
    id,
    status: { phase: 'queued' },
    controller,
    startedAt: now,
    lastSeen: now,
  };
  jobs.set(id, job);
  scheduleSweep();
  void run(controller.signal, (status) => {
    if (!isSettledJob(job.status)) job.status = status;
  }).then(
    (asset) => settle(job, { phase: 'done', asset }),
    (reason: unknown) => settle(job, failedStatus(reason)),
  );
}

/** What a client may name a job by: the uuid it made for the request. */
export function isUploadId(value: unknown): value is string {
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
}

/** The job's status, noting that someone still cares. */
export function getUploadJob(
  id: string,
  now = Date.now(),
): AssetJobStatus | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  job.lastSeen = now;
  return job.status;
}

export function isUploadJobRunning(id: string): boolean {
  const job = jobs.get(id);
  return Boolean(job && !isSettledJob(job.status));
}

/** Stops a running job; a settled one is left as it is. */
export function cancelUploadJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (!isSettledJob(job.status)) {
    settle(job, { phase: 'failed', message: 'The upload was cancelled' });
    job.controller.abort(
      new DOMException('The upload was cancelled', 'AbortError'),
    );
  }
  return true;
}

/** Drops old results and cancels jobs whose owner has gone or that hang. */
export function sweepUploadJobs(now = Date.now()) {
  for (const job of [...jobs.values()]) {
    if (isSettledJob(job.status)) {
      if (now - (job.settledAt ?? now) >= SETTLED_KEEP_MS) jobs.delete(job.id);
    } else if (
      now - job.lastSeen >= ORPHAN_MS ||
      now - job.startedAt >= MAX_RUN_MS
    ) {
      cancelUploadJob(job.id);
    }
  }
  if (!jobs.size && sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = undefined;
  }
}

/** For tests: forget every job, stopping none. */
export function resetUploadJobsForTests() {
  jobs.clear();
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = undefined;
}

function settle(job: UploadJob, status: AssetJobStatus) {
  if (isSettledJob(job.status)) return;
  job.status = status;
  job.settledAt = Date.now();
}

/** A rejection as a poll shows it: an h3 error keeps its code and data. */
function failedStatus(reason: unknown): AssetJobStatus {
  const error =
    reason && typeof reason === 'object'
      ? (reason as { message?: string; statusCode?: number; data?: unknown })
      : {};
  return {
    phase: 'failed',
    message:
      typeof error.message === 'string' && error.message
        ? error.message
        : 'The upload failed',
    ...(typeof error.statusCode === 'number'
      ? { statusCode: error.statusCode }
      : {}),
    ...(error.data !== undefined ? { data: error.data } : {}),
  };
}

function scheduleSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => sweepUploadJobs(), SWEEP_MS);
  sweepTimer.unref?.();
}
