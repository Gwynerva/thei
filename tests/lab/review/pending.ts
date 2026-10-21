// Which jobs wait for a review, and preparing their review folders.
//
// A job's input set is its latest attempt with status done or stopped on
// each of its variants; an error or a disturbed play never counts. The job
// waits when no valid review covers exactly that set, and the review is a
// recheck when an earlier valid review exists. So replaying one variant of
// one job makes only that job wait.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoRoot } from '../config';
import type { ProbeRule, ReviewJobArgs, Severity, VariantCode } from '../types';
import {
  renderBrief,
  type BriefContext,
  type DismissedSuspicion,
  type EarlierFinding,
  type Suspicion,
} from './brief';
import { criteriaFor, resolveBar } from './criteria';
import {
  attemptFile,
  cropFile,
  isFile,
  type Attempt,
  type LoadedJob,
  type ReviewFolder,
} from './runs';
import type { Review, ReviewInputs } from './schema';
import { validateReview, type Checked } from './validate';

export type JobStateName = 'unplayed' | 'partial' | 'waiting' | 'reviewed';

export interface JobState {
  loaded: LoadedJob;
  /** The latest usable attempt of each required variant. */
  set: Partial<Record<VariantCode, Attempt>>;
  missing: VariantCode[];
  /** Every answered review, checked. */
  checked: Map<string, Checked>;
  /** Valid reviews, oldest first. */
  valid: { folder: ReviewFolder; review: Review; inputs: ReviewInputs }[];
  /** The valid review of exactly the current set. */
  covering?: ReviewFolder;
  state: JobStateName;
  /** What a review prepared now would be. */
  kind: 'fresh' | 'recheck';
}

const USABLE = new Set(['done', 'stopped']);

export function inputSet(job: LoadedJob) {
  const set: Partial<Record<VariantCode, Attempt>> = {};
  for (const variant of job.job.required) {
    const latest = job.attempts
      .filter((a) => a.variant === variant && USABLE.has(a.meta.status))
      .at(-1);
    if (latest) set[variant] = latest;
  }
  return set;
}

function sameSet(
  a: Partial<Record<VariantCode, string>>,
  b: Partial<Record<VariantCode, Attempt>>,
): boolean {
  const keys = new Set([
    ...Object.keys(a),
    ...Object.keys(b),
  ]) as Set<VariantCode>;
  for (const key of keys) if (a[key] !== b[key]?.id) return false;
  return true;
}

export function jobState(loaded: LoadedJob): JobState {
  const set = inputSet(loaded);
  const missing = loaded.job.required.filter((v) => !set[v]);
  const checked = new Map<string, Checked>();
  const valid: JobState['valid'] = [];
  for (const folder of loaded.reviews) {
    if (folder.answer === undefined && !folder.answerError) continue;
    const result = validateReview(loaded, folder);
    checked.set(folder.id, result);
    if (result.review && result.inputs)
      valid.push({ folder, review: result.review, inputs: result.inputs });
  }
  const covering = missing.length
    ? undefined
    : valid.findLast((v) => sameSet(v.inputs.attempts, set))?.folder;
  const state: JobStateName =
    missing.length === loaded.job.required.length
      ? 'unplayed'
      : missing.length
        ? 'partial'
        : covering
          ? 'reviewed'
          : 'waiting';
  return {
    loaded,
    set,
    missing,
    checked,
    valid,
    covering,
    state,
    kind: valid.length ? 'recheck' : 'fresh',
  };
}

/** A finding still open after a review: its own, or an earlier one it kept. */
export interface OpenFinding extends EarlierFinding {
  /** The review that last saw it. */
  seenIn: string;
}

/**
 * The findings open after a review: its own, and those of the review it
 * rechecked that it marked still, worse or unclear. A fresh review starts
 * the chain over.
 */
export function openFindings(state: JobState, reviewId: string): OpenFinding[] {
  const memo = new Map<string, OpenFinding[]>();
  const open = (id: string): OpenFinding[] => {
    const known = memo.get(id);
    if (known) return known;
    const entry = state.valid.find((v) => v.folder.id === id);
    if (!entry) return [];
    const result: OpenFinding[] = [];
    if (entry.review.kind === 'recheck' && entry.inputs.base) {
      const before = open(entry.inputs.base);
      for (const mark of entry.review.previous) {
        if (mark.status === 'fixed') continue;
        const earlier = before.find((f) => f.key === mark.id);
        if (!earlier) continue;
        result.push({
          ...earlier,
          status: mark.status,
          severity: mark.severity ?? earlier.severity,
          attempt: mark.attempt ?? earlier.attempt,
          step: mark.step ?? earlier.step,
          shot: mark.shot ?? earlier.shot,
          seenIn: id,
        });
      }
    }
    for (const finding of entry.review.findings)
      result.push({
        key: `${id}/${finding.id}`,
        severity: finding.severity,
        status: 'new',
        finding,
        attempt: finding.attempt,
        step: finding.step,
        shot: finding.shot,
        seenIn: id,
      });
    memo.set(id, result);
    return result;
  };
  return open(reviewId);
}

/** Fingerprints the job's earlier reviews dismissed, unless a later one confirmed them. */
export function dismissedFps(
  state: JobState,
): Map<string, { review: string; why: string }> {
  const dismissed = new Map<string, { review: string; why: string }>();
  for (const { folder, review } of state.valid)
    for (const [fp, verdict] of Object.entries(review.probe)) {
      if (verdict.verdict === 'dismissed')
        dismissed.set(fp, { review: folder.id, why: verdict.why });
      else if (verdict.verdict === 'confirmed') dismissed.delete(fp);
    }
  return dismissed;
}

function forward(file: string): string {
  return file.replaceAll('\\', '/');
}

/** Files a persona may read beyond the play (`docs/design/**`), repo-relative. */
export function expandReads(patterns: readonly string[] = []): string[] {
  const files = new Set<string>();
  const walk = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? walk(join(dir, entry.name))
            : entry.isFile()
              ? [join(dir, entry.name)]
              : [],
        )
      : [];
  for (const pattern of patterns) {
    const clean = pattern.replace(/\/\*\*(\/\*)?$/, '');
    const full = join(repoRoot, clean);
    if (pattern.includes('*') && clean.includes('*')) {
      const slash = clean.lastIndexOf('/');
      const dir = join(repoRoot, clean.slice(0, slash));
      const name = new RegExp(
        `^${clean
          .slice(slash + 1)
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replaceAll('*', '.*')}$`,
      );
      for (const entry of existsSync(dir) ? readdirSync(dir) : [])
        if (name.test(entry) && isFile(join(dir, entry)))
          files.add(forward(relative(repoRoot, join(dir, entry))));
    } else if (isFile(full)) files.add(forward(clean));
    else
      for (const file of walk(full))
        files.add(forward(relative(repoRoot, file)));
  }
  return [...files].sort();
}

function siblingShots(attempt: Attempt, shot: string): string[] {
  const file = attemptFile(attempt, shot);
  const plain = file.replace(/\.marked\.png$/i, '.png');
  return [plain, plain.replace(/\.png$/i, '.marked.png')].filter(isFile);
}

export interface Prepared {
  args: ReviewJobArgs;
  inputs: ReviewInputs;
  brief: string;
}

/**
 * Writes the review folder of a waiting job: the last folder while nobody
 * has answered in it, else the next `R<n>`.
 */
export function prepareReview(
  state: JobState,
  options: {
    fresh?: boolean;
    now?: Date;
    /** How the brief names files; absolute by default, for the Read tool. */
    show?: (file: string) => string;
  } = {},
): Prepared {
  const { loaded } = state;
  if (state.missing.length)
    throw new Error(
      `${loaded.job.jobId} has no usable play on ${state.missing.join(', ')}`,
    );
  const last = loaded.reviews.at(-1);
  const reuse = last && last.answer === undefined && !last.answerError;
  const id = reuse ? last.id : `R${(last?.n ?? 0) + 1}`;
  const dir = join(loaded.dir, 'reviews', id);
  mkdirSync(dir, { recursive: true });

  const base = options.fresh ? undefined : state.valid.at(-1);
  const kind = base ? 'recheck' : 'fresh';
  const attempts = loaded.job.required.map((variant) => ({
    variant,
    attempt: state.set[variant]!,
  }));
  const criteria = criteriaFor(
    loaded.persona,
    loaded.job.required,
    loaded.study.criteria,
  );

  // The probe's suspicions: everything but info, once per fingerprint.
  const dismissedEarlier = dismissedFps(state);
  const ask = new Map<string, Suspicion>();
  const dismissed = new Map<string, DismissedSuspicion>();
  for (const { variant, attempt } of attempts)
    for (const step of attempt.steps) {
      const result = attempt.probe.get(step.n);
      for (const finding of result?.findings ?? []) {
        if (finding.hint === 'info') continue;
        const crop = cropFile(attempt, step.n, finding.fp);
        const earlier = dismissedEarlier.get(finding.fp);
        if (earlier) {
          if (!dismissed.has(finding.fp))
            dismissed.set(finding.fp, {
              fp: finding.fp,
              rule: finding.rule,
              message: finding.message,
              ...earlier,
            });
          continue;
        }
        const suspicion = ask.get(finding.fp) ?? {
          fp: finding.fp,
          rule: finding.rule,
          hint: finding.hint,
          message: finding.message,
          elements: finding.elements.map((e) => e.desc),
          measure: finding.measure,
          seen: [],
        };
        suspicion.seen.push({
          variant,
          attempt: attempt.id,
          step: step.n,
          crop,
        });
        ask.set(finding.fp, suspicion);
      }
    }

  const previous: EarlierFinding[] = base
    ? openFindings(state, base.folder.id)
    : [];
  const runFiles = new Set<string>();
  const add = (file: string) => {
    if (isFile(file)) runFiles.add(file);
  };
  for (const { attempt } of attempts)
    for (const step of attempt.steps) {
      add(attemptFile(attempt, step.marked));
      add(attemptFile(attempt, step.shot));
    }
  for (const suspicion of ask.values())
    for (const seen of suspicion.seen) if (seen.crop) add(seen.crop);
  // Each earlier finding with its old screenshot, for reference, and the
  // step of the new plays where it would show: the same screen's step of the
  // same words, else of the same number.
  const earlierShots = previous.map((p): EarlierFinding => {
    const attempt = loaded.attempts.find((a) => a.id === p.attempt);
    if (!attempt) return p;
    for (const file of siblingShots(attempt, p.shot)) add(file);
    const label = attempt.steps.find((s) => s.n === p.step)?.label;
    const fresh = state.set[attempt.variant];
    const step =
      fresh?.steps.find((s) => s.label === label) ??
      fresh?.steps.find((s) => s.n === p.step);
    return {
      ...p,
      shot: attemptFile(attempt, p.shot),
      ...(fresh && step
        ? {
            now: {
              attempt: fresh.id,
              step: step.n,
              label: step.label,
              shot: attemptFile(fresh, step.marked),
            },
          }
        : {}),
    };
  });
  const briefFile = join(dir, 'brief.md');
  const out = join(dir, 'review.json');
  const repoFiles = expandReads(loaded.persona.reads);

  const inputs: ReviewInputs = {
    schema: 1,
    study: loaded.study.id,
    job: loaded.job.jobId,
    review: id,
    kind,
    ...(base ? { base: base.folder.id } : {}),
    lens: loaded.persona.lens,
    persona: loaded.persona.id,
    attempts: Object.fromEntries(
      attempts.map(({ variant, attempt }) => [variant, attempt.id]),
    ),
    criteria: Object.fromEntries(
      criteria.map(({ criterion, variants }) => [criterion.id, variants]),
    ),
    probe: {
      ask: [...ask.keys()],
      dismissed: Object.fromEntries(
        [...dismissed.values()].map((d) => [
          d.fp,
          { review: d.review, why: d.why },
        ]),
      ),
    },
    previous: previous.map((p) => p.key),
    allowed: {
      run: [briefFile, ...runFiles].map((file) =>
        forward(relative(loaded.studyDir, file)),
      ),
      repo: repoFiles,
    },
    preparedAt: (options.now ?? new Date()).toISOString(),
  };

  const ctx: BriefContext = {
    study: loaded.study,
    jobId: loaded.job.jobId,
    scenario: { id: loaded.job.scenario, title: loaded.job.scenarioTitle },
    review: id,
    kind,
    base: base?.folder.id,
    persona: loaded.persona,
    task: attempts.at(-1)!.attempt.meta.task,
    attempts,
    criteria,
    minScore: resolveBar(loaded.study.bar).minScore,
    ask: [...ask.values()],
    dismissed: [...dismissed.values()],
    previous: earlierShots,
    files: [
      briefFile,
      ...runFiles,
      ...repoFiles.map((file) => join(repoRoot, file)),
    ],
    briefPath: briefFile,
    out,
    show: options.show ?? ((file) => file),
  };
  const brief = renderBrief(ctx);
  writeFileSync(
    join(dir, 'inputs.json'),
    `${JSON.stringify(inputs, null, 2)}\n`,
  );
  writeFileSync(briefFile, brief);
  return {
    args: {
      job: loaded.job.jobId,
      review: id,
      kind,
      lens: loaded.persona.lens,
      dir,
      brief: briefFile,
      out,
    },
    inputs,
    brief,
  };
}

/** Counts of a review's open findings by severity. */
export function severityCounts(
  findings: { severity: Severity }[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    blocker: 0,
    serious: 0,
    minor: 0,
    taste: 0,
  };
  for (const finding of findings) counts[finding.severity]++;
  return counts;
}

/** The fingerprint's rule, from the probe results of a job's attempts. */
export function fpRules(loaded: LoadedJob): Map<string, ProbeRule> {
  const rules = new Map<string, ProbeRule>();
  for (const attempt of loaded.attempts)
    for (const result of attempt.probe.values())
      for (const finding of result.findings)
        rules.set(finding.fp, finding.rule);
  return rules;
}
