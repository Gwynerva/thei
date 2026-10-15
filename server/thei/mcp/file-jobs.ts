import { randomBytes } from 'node:crypto';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import type { ApiTokenPrincipal } from '../api-tokens';
import { refuse as fail } from '../entity-patch/text';
import { describeFile } from './files';

/**
 * Work on files that may outlast one call. A download or a video's
 * re-encoding can take minutes — longer than a client waits for one answer
 * (claude.ai gives a tool four) — so a call waits a little, and what is not
 * done by then goes on: its job id tells `file_status` where it stands.
 *
 * A file brought in is a file of the library like any other: one no entity
 * places, and no action waiting holds, is let go by the library's own sweep.
 */

/** How long a call waits for its file before handing out the job. */
const WAIT_MS = 25_000;
/** How long a finished job can still be asked about. */
const KEEP_MS = 60 * 60 * 1000;
/** Files one token may have on their way at once. */
const RUNNING_PER_TOKEN = 2;

export interface FileJob {
  job: string;
  tokenUuid: string;
  /** What the file is: its name, or the file it was made from. */
  what: string;
  status: 'running' | 'done' | 'failed';
  file?: ReturnType<typeof describeFile>;
  error?: string;
  finishedAt?: number;
}

const jobs = new Map<string, FileJob>();

function sweep(now = Date.now()) {
  for (const [id, job] of jobs)
    if (job.finishedAt && now - job.finishedAt > KEEP_MS) jobs.delete(id);
}

/**
 * Starts work on a file and waits for it a little: the job, done or still
 * running. A token has at most two files on their way at once.
 */
export async function runFileJob(
  principal: ApiTokenPrincipal,
  what: string,
  work: () => Promise<AssetUploadResponse>,
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
    what,
    status: 'running',
  };
  jobs.set(job.job, job);
  const done = work()
    .then((file) => {
      job.file = describeFile(file);
      job.status = 'done';
    })
    .catch((error: unknown) => {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
    })
    .finally(() => {
      job.finishedAt = Date.now();
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
