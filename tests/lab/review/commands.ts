// Reviews: one reviewer per job, its brief, its answer checked, and the
// report over a study.
import { relative } from 'node:path';
import { paths } from '../config';
import type { Commands, ReviewJobArgs, StatusLine } from '../types';
import { output, parse } from '../util';
import { describeMiss, summarize } from './aggregate';
import { jobState, prepareReview, type JobState } from './pending';
import { writeReport } from './report';
import { listStudies, loadJobs, runsRoot, studyDir } from './runs';
import { validateReview, writeValidation } from './validate';

const runsOption = { runs: { type: 'string' } } as const;
const USAGE = {
  jobs: 'jobs <study> [--pending] [--fresh] [--runs <dir>] [--json]',
  validate: 'validate <study> [<job>] [--runs <dir>] [--json]',
  report: 'report <study> [--runs <dir>] [--json]',
};

function studyArg(positionals: string[], usage: string): string | undefined {
  const study = positionals[0];
  if (!study) console.error(`Name the study: bun run lab ${usage}`);
  return study;
}

function stateLine(state: JobState): string {
  const { job } = state.loaded;
  const set = job.required
    .map((variant) => `${variant} ${state.set[variant]?.id ?? '—'}`)
    .join(', ');
  const what =
    state.state === 'waiting'
      ? `waits for a ${state.kind === 'recheck' ? 'recheck' : 'fresh review'}`
      : state.state === 'reviewed'
        ? `reviewed by ${state.covering!.id}`
        : state.state === 'partial'
          ? `not played on ${state.missing.join(', ')}`
          : 'not played';
  return `${job.jobId.padEnd(32)} ${what.padEnd(26)} ${set}`;
}

export const commands: Commands = {
  jobs: {
    summary:
      "List a study's jobs; --pending prepares a brief for each waiting one and prints the workflow's args",
    usage: USAGE.jobs,
    async run(args) {
      const { values, positionals } = parse(args, {
        pending: { type: 'boolean' },
        fresh: { type: 'boolean' },
        json: { type: 'boolean' },
        ...runsOption,
      });
      const study = studyArg(positionals, USAGE.jobs);
      if (!study) return 2;
      const states = loadJobs(runsRoot(values.runs), study).map(jobState);
      const json = values.json ?? false;

      if (!values.pending) {
        output(
          json,
          states.map((state) => ({
            job: state.loaded.job.jobId,
            state: state.state,
            next: state.kind,
            set: Object.fromEntries(
              Object.entries(state.set).map(([v, a]) => [v, a!.id]),
            ),
            missing: state.missing,
            review: state.covering?.id,
          })),
          () => states.map(stateLine),
        );
        return;
      }

      for (const state of states)
        if (state.state === 'partial' || state.state === 'unplayed')
          console.error(
            `${state.loaded.job.jobId}: ${
              state.state === 'partial'
                ? `not played on ${state.missing.join(', ')}`
                : 'not played'
            } — play it before it can be reviewed`,
          );
      const jobs: ReviewJobArgs[] = states
        .filter((state) => state.state === 'waiting')
        .map((state) => prepareReview(state, { fresh: values.fresh }).args);
      output(json, { study, jobs }, () =>
        jobs.length
          ? jobs.map(
              (job) =>
                `${job.job.padEnd(32)} ${job.review} ${job.kind.padEnd(8)} ${relative(process.cwd(), job.brief)}`,
            )
          : ['No job waits for a review.'],
      );
    },
  },
  validate: {
    summary:
      "Check reviewers' answers against the schema and the play; writes validation.json",
    usage: USAGE.validate,
    async run(args) {
      const { values, positionals } = parse(args, {
        json: { type: 'boolean' },
        ...runsOption,
      });
      const study = studyArg(positionals, USAGE.validate);
      if (!study) return 2;
      const only = positionals[1];
      const jobs = loadJobs(runsRoot(values.runs), study).filter(
        (job) => !only || job.job.jobId === only,
      );
      if (only && !jobs.length) {
        console.error(`No job "${only}" in ${study}.`);
        return 2;
      }
      const results = [];
      const lines: string[] = [];
      for (const job of jobs)
        for (const folder of job.reviews) {
          const name = `${job.job.jobId} ${folder.id}`;
          if (folder.answer === undefined && !folder.answerError) {
            lines.push(`· ${name}: no answer yet`);
            continue;
          }
          const { validation } = validateReview(job, folder);
          writeValidation(folder, validation);
          results.push(validation);
          lines.push(
            `${validation.ok ? '✓' : '✗'} ${name}${
              validation.ok ? '' : `: ${validation.errors.length} errors`
            }`,
          );
          for (const error of validation.errors) lines.push(`    ✗ ${error}`);
          for (const warning of validation.warnings)
            lines.push(`    ! ${warning}`);
        }
      output(values.json ?? false, results, () =>
        lines.length ? lines : ['No reviews yet.'],
      );
      return results.every((result) => result.ok) ? 0 : 1;
    },
  },
  report: {
    summary:
      "Sum a study up: the bar, every job's latest review, history, findings; writes report/",
    usage: USAGE.report,
    async run(args) {
      const { values, positionals } = parse(args, {
        json: { type: 'boolean' },
        ...runsOption,
      });
      const study = studyArg(positionals, USAGE.report);
      if (!study) return 2;
      const runs = runsRoot(values.runs);
      const summary = summarize(runs, study);
      const page = await writeReport(studyDir(runs, study), summary);
      output(values.json ?? false, summary, () => [
        `${summary.bar.met ? '✓ The bar is met' : '✗ The bar is not met'} — ${summary.counts.reviewed}/${summary.counts.jobs} jobs reviewed`,
        ...summary.jobs.flatMap((job) =>
          job.bar.map(
            (miss) => `    ${job.jobId}: ${describeMiss(miss, summary.bar)}`,
          ),
        ),
        relative(process.cwd(), page),
      ]);
    },
  },
};

export async function status(): Promise<StatusLine[]> {
  const lines: StatusLine[] = [];
  for (const study of listStudies(paths.runs)) {
    try {
      const states = loadJobs(paths.runs, study).map(jobState);
      const waiting = states.filter((state) => state.state === 'waiting');
      if (!waiting.length) continue;
      const rechecks = waiting.filter((state) => state.kind === 'recheck');
      lines.push({
        part: 'review',
        ok: 'warn',
        text: `${study}: ${waiting.length} jobs wait for a review (${
          waiting.length - rechecks.length
        } fresh, ${rechecks.length} rechecks) — bun run lab jobs ${study} --pending --json`,
      });
    } catch (error) {
      lines.push({
        part: 'review',
        ok: false,
        text: `${study}: ${error instanceof Error ? error.message : error}`,
      });
    }
  }
  return lines;
}
