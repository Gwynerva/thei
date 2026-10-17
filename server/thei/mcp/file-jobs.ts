import { randomBytes } from 'node:crypto';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import type { ApiTokenPrincipal } from '../api-tokens';
import { refuse as fail } from '../entity-patch/text';
import { describeFile } from './files';
import { isRefusal, logToolFailure } from './result';

/**
 * Work on files that may outlast one call. A download or a video's
 * re-encoding can take minutes — longer than a client waits for one answer
 * (claude.ai gives a tool four) — so a call waits a little, and what is not
 * done by then goes on: its job id tells `file_status` where it stands.
 *
 * A file brought in is a file of the library like any other: one no entity
 * places, and no action waiting holds, is let go by the library's own sweep.
 * A job is cancelled with its session — archived by the owner — and with AI
 * turned off: its download or encoding stops, and what it made is not kept.
 * One still running after a few hours is stuck, and is stopped as failed.
 */

/** How long a call waits for its file before handing out the job. */
const WAIT_MS = 25_000;
/** How long a finished job can still be asked about. */
const KEEP_MS = 60 * 60 * 1000;
/** Files one token may have on their way at once. */
const RUNNING_PER_TOKEN = 2;
/**
 * How long a job may run: no download or encoding of a file within the
 * upload limit takes hours, as the admin's own jobs go, and a hung one would
 * hold one of its token's places for good.
 */
const MAX_RUN_MS = 4 * 60 * 60 * 1000;

export interface FileJob {
  job: string;
  tokenUuid: string;
  /** The session the file is brought into. */
  sessionUuid: string;
  /** What the file is: its name, or the file it was made from. */
  what: string;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  file?: ReturnType<typeof describeFile>;
  error?: string;
  finishedAt?: number;
}

const jobs = new Map<string, FileJob>();
/** What stops each job still running. */
const stoppers = new Map<string, AbortController>();

function sweep(now = Date.now()) {
  for (const [id, job] of jobs)
    if (job.finishedAt && now - job.finishedAt > KEEP_MS) jobs.delete(id);
}

/**
 * Starts work on a file for a session and waits for it a little: the job,
 * done or still running. A token has at most two files on their way at once.
 * `work` stops when its signal aborts.
 */
export async function runFileJob(
  principal: ApiTokenPrincipal,
  sessionUuid: string,
  what: string,
  work: (signal: AbortSignal) => Promise<AssetUploadResponse>,
): Promise<FileJob> {
  sweep();
  const running = [...jobs.values()].filter(
    (job) => job.tokenUuid === principal.tokenUuid && job.status === 'running',
  ).length;
  if (running >= RUNNING_PER_TOKEN)
    fail(
      'Two files are already on their way; wait for them with file_status before starting another.',
    );
  const job: FileJob = {
    job: `fj-${randomBytes(9).toString('base64url')}`,
    tokenUuid: principal.tokenUuid,
    sessionUuid,
    what,
    status: 'running',
  };
  const stopper = new AbortController();
  jobs.set(job.job, job);
  stoppers.set(job.job, stopper);
  const limit = setTimeout(
    () => stop(job, 'failed', 'it ran for hours and was stopped'),
    MAX_RUN_MS,
  );
  limit.unref();
  const done = work(stopper.signal)
    .then((file) => {
      if (job.status !== 'running') return;
      job.file = describeFile(file);
      job.status = 'done';
    })
    .catch((error: unknown) => {
      if (job.status !== 'running') return;
      job.status = 'failed';
      // A refusal says what to do; anything else is logged, and the app
      // told only where to find it: an encoder's output names paths of
      // the server.
      job.error = isRefusal(error)
        ? error.message
        : `it could not be finished (error ${logToolFailure(error)})`;
    })
    .finally(() => {
      clearTimeout(limit);
      stoppers.delete(job.job);
      job.finishedAt ??= Date.now();
    });
  await Promise.race([
    done,
    new Promise((resolve) => setTimeout(resolve, WAIT_MS).unref()),
  ]);
  return job;
}

/** A token's own job, while it is kept. */
export function fileJob(job: string, tokenUuid: string): FileJob | undefined {
  sweep();
  const found = jobs.get(job);
  return found?.tokenUuid === tokenUuid ? found : undefined;
}

/** Stops a job still running: its work aborts, and nothing it makes is kept. */
function stop(job: FileJob, status: 'cancelled' | 'failed', error?: string) {
  if (job.status !== 'running') return;
  job.status = status;
  if (error) job.error = error;
  job.finishedAt = Date.now();
  stoppers.get(job.job)?.abort();
}

/** Cancels the files still on their way into a session; returns how many. */
export function cancelSessionFileJobs(sessionUuid: string): number {
  let count = 0;
  for (const job of jobs.values())
    if (job.sessionUuid === sessionUuid && job.status === 'running') {
      stop(job, 'cancelled');
      count++;
    }
  return count;
}

/** Cancels every file still on its way: AI was turned off. */
export function cancelFileJobs() {
  for (const job of jobs.values()) stop(job, 'cancelled');
}
