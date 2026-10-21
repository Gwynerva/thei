// The hand-made run folder of `fixtures/`, copied where a test may write.
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobState, type JobState } from './pending';
import { loadJobs } from './runs';

export const FIXTURE_RUNS = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'runs',
);
export const STUDY = 'fixture';

/** Fingerprints the fixture's probe found (`fixtures/make.ts`). */
export const FP = {
  overlap: 'overlap:k3f9a2x7qd',
  nearMiss: 'near-miss:b7c2d9e0wf',
  info: 'clipped-text:c0ffee12aa',
  smallMenu: 'small-target:d4e5f6a7b8',
  gap: 'uneven-gap:e9d8c7b6a5',
  clipped: 'clipped-text:f1e2d3c4b5',
  designerNear: 'near-miss:0a1b2c3d4e',
  designerOverlap: 'overlap:1b2c3d4e5f',
};

/**
 * A copy of the fixture as `make.ts` wrote it: without what running the
 * commands over it by hand adds — unanswered review folders, validations,
 * the report.
 */
export function copyFixture(): { runs: string; cleanup(): void } {
  const runs = mkdtempSync(join(tmpdir(), 'thei-lab-review-'));
  cpSync(FIXTURE_RUNS, runs, {
    recursive: true,
    filter: (source) => {
      const name = basename(source);
      if (name === 'report' || name === 'validation.json') return false;
      if (/^R\d+$/.test(name) && basename(dirname(source)) === 'reviews')
        return existsSync(join(source, 'review.json'));
      return true;
    },
  });
  return {
    runs,
    cleanup: () => rmSync(runs, { recursive: true, force: true }),
  };
}

export function states(runs: string): Record<string, JobState> {
  return Object.fromEntries(
    loadJobs(runs, STUDY).map((job) => [job.job.jobId, jobState(job)]),
  );
}
