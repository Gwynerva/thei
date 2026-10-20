// Reading a study's run folder: the resolved study, its jobs, their attempts
// and reviews. The runner writes everything here but `reviews/`, which is
// the review side's own.
//
// .lab/runs/<study>/study.json
//   jobs/<scenario>.<persona>/job.json
//   jobs/…/attempts/<MMDD-HHMMSS>-<variant>/{attempt,steps,findings}.json,
//     probe/NN.json, shots/NN-<slug>[.marked].png, crops/NN-<fp8>.png
//   jobs/…/reviews/R<n>/{inputs.json, brief.md, review.json, validation.json}
//   report/{index.html, summary.json}
//   changes.json (optional)
import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { paths } from '../config';
import type {
  AttemptMeta,
  Persona,
  PlayFinding,
  ProbeResult,
  Ref,
  Role,
  StepRecord,
  StudyBar,
  VariantCode,
} from '../types';
import { studyDir, type JobFile } from '../run/store';
import { readJson, readJsonIf } from '../util';
import { variantCode } from '../variants';
import { cropName } from './crops';

export type { JobFile };
export { studyDir };

/** `study.json`: the study as the runner wrote it (`writeStudyFile`). */
export interface StudyFile {
  id: string;
  title: string;
  question: string;
  personas: Persona[];
  variants: VariantCode[];
  criteria?: { add?: string[]; skip?: string[] };
  bar?: Partial<StudyBar>;
  scenarios?: { id: string; title: string; roles: Role[]; task: string }[];
}

/** A line of `changes.json`: what was changed between plays. */
export interface ChangeEntry {
  at?: string;
  text: string;
  commit?: string;
  jobs?: string[];
  variants?: VariantCode[];
}

export interface Attempt {
  id: string;
  dir: string;
  meta: AttemptMeta;
  variant: VariantCode;
  steps: StepRecord[];
  findings: PlayFinding[];
  /** The probe after each step, by the step's number. */
  probe: Map<number, ProbeResult>;
}

export interface ReviewFolder {
  id: string;
  n: number;
  dir: string;
  /** `inputs.json`, as written; checked by the validator, not here. */
  inputs?: unknown;
  /** `review.json`, as written. */
  answer?: unknown;
  /** Why `review.json` could not be read as JSON. */
  answerError?: string;
}

export interface LoadedJob {
  study: StudyFile;
  studyDir: string;
  job: JobFile;
  dir: string;
  persona: Persona;
  /** Every attempt, oldest first. */
  attempts: Attempt[];
  /** Every review folder, R1 first. */
  reviews: ReviewFolder[];
}

/** The folder of a study's plays: `--runs <dir>`, or `.lab/runs`. */
export function runsRoot(runs?: string): string {
  return runs ? resolve(runs) : paths.runs;
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** The studies that have a run folder. */
export function listStudies(runs: string): string[] {
  return subdirs(runs).filter((name) =>
    existsSync(join(runs, name, 'study.json')),
  );
}

export function readStudy(runs: string, study: string): StudyFile {
  const file = join(studyDir(study, runs), 'study.json');
  if (!existsSync(file))
    throw new Error(
      `No study "${study}" in ${runs}: play it first (bun run lab play ${study}).`,
    );
  return readJson<StudyFile>(file);
}

/** Two digits, as the runner names a step's files. */
export function stepKey(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * An attempt, once done: the runner writes its `attempt.json` last, so a
 * play still running, or one that broke off, is not read as complete.
 */
export function loadAttempt(dir: string, id: string): Attempt | undefined {
  const metaFile = join(dir, 'attempt.json');
  if (!existsSync(metaFile)) return undefined;
  const meta = readJson<AttemptMeta>(metaFile);
  const steps = readJsonIf<StepRecord[]>(join(dir, 'steps.json'), []);
  const probe = new Map<number, ProbeResult>();
  for (const step of steps) {
    const file = join(dir, 'probe', `${stepKey(step.n)}.json`);
    if (existsSync(file)) probe.set(step.n, readJson<ProbeResult>(file));
  }
  return {
    id,
    dir,
    meta,
    variant: variantCode(meta.variant),
    steps,
    findings: readJsonIf<PlayFinding[]>(join(dir, 'findings.json'), []),
    probe,
  };
}

function loadReviews(dir: string): ReviewFolder[] {
  return subdirs(dir)
    .filter((name) => /^R\d+$/.test(name))
    .map((name) => {
      const folder = join(dir, name);
      const review: ReviewFolder = {
        id: name,
        n: Number(name.slice(1)),
        dir: folder,
      };
      const inputs = join(folder, 'inputs.json');
      if (existsSync(inputs)) review.inputs = readJson<unknown>(inputs);
      const answer = join(folder, 'review.json');
      if (existsSync(answer))
        try {
          review.answer = readJson<unknown>(answer);
        } catch (error) {
          review.answerError =
            error instanceof Error ? error.message : String(error);
        }
      return review;
    })
    .sort((a, b) => a.n - b.n);
}

export function loadJob(
  study: StudyFile,
  dir: string,
  studyFolder: string,
): LoadedJob {
  const job = readJson<JobFile>(join(dir, 'job.json'));
  const persona = study.personas.find((p) => p.id === job.persona);
  if (!persona)
    throw new Error(
      `Job ${job.jobId} names persona "${job.persona}", which study.json does not have`,
    );
  const attemptsDir = join(dir, 'attempts');
  const attempts = subdirs(attemptsDir)
    .map((id) => loadAttempt(join(attemptsDir, id), id))
    .filter((attempt): attempt is Attempt => !!attempt)
    .sort(
      (a, b) =>
        a.meta.startedAt.localeCompare(b.meta.startedAt) ||
        a.id.localeCompare(b.id),
    );
  return {
    study,
    studyDir: studyFolder,
    job,
    dir,
    persona,
    attempts,
    reviews: loadReviews(join(dir, 'reviews')),
  };
}

export function loadJobs(runs: string, study: string): LoadedJob[] {
  const studyFile = readStudy(runs, study);
  const folder = studyDir(study, runs);
  const jobsDir = join(folder, 'jobs');
  return subdirs(jobsDir)
    .filter((name) => existsSync(join(jobsDir, name, 'job.json')))
    .map((name) => loadJob(studyFile, join(jobsDir, name), folder));
}

export function readChanges(runs: string, study: string): ChangeEntry[] {
  const file = join(studyDir(study, runs), 'changes.json');
  if (!existsSync(file)) return [];
  const raw = readJson<unknown>(file);
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as any).changes)
      ? (raw as any).changes
      : [];
  return list
    .map((entry: unknown) =>
      typeof entry === 'string'
        ? { text: entry }
        : entry && typeof entry === 'object' && 'text' in entry
          ? (entry as ChangeEntry)
          : undefined,
    )
    .filter((entry: ChangeEntry | undefined): entry is ChangeEntry => !!entry);
}

/** An attempt's file named by the runner: relative to the attempt, or absolute. */
export function attemptFile(attempt: Attempt, file: string): string {
  return isAbsolute(file) ? file : join(attempt.dir, file);
}

/** A probe finding's close-up, when the probe drew one. */
export function cropFile(
  attempt: Attempt,
  step: number,
  fp: string,
): string | undefined {
  const file = join(attempt.dir, 'crops', cropName(step, fp));
  return existsSync(file) ? file : undefined;
}

export function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}
