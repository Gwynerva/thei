// `report/summary.json`: a study summed up from its run folder — the bar,
// each job's latest review, every review and attempt before it, the open
// findings, and how often each rule of the probe was right.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Persona,
  ProbeRule,
  Severity,
  StudyBar,
  VariantCode,
} from '../types';
import {
  CRITERIA,
  criteriaFor,
  criterion as criterionById,
  resolveBar,
  SEVERITY_ORDER,
} from './criteria';
import { cropKey } from './crops';
import {
  fpRules,
  jobState,
  openFindings,
  severityCounts,
  type JobStateName,
} from './pending';
import {
  attemptFile,
  cropFile,
  loadJobs,
  readChanges,
  readStudy,
  type Attempt,
  type ChangeEntry,
} from './runs';
import { InputsSchema, type PreviousStatus, type Review } from './schema';

export interface ReviewHistory {
  review: string;
  kind?: 'fresh' | 'recheck';
  base?: string;
  preparedAt?: string;
  answered: boolean;
  valid: boolean;
  errors: string[];
  attempts: Partial<Record<VariantCode, string>>;
  mean?: number;
  min?: number;
  /** The review's own new findings. */
  found: Record<Severity, number>;
  previous: Record<PreviousStatus, number>;
  verdicts: { confirmed: number; dismissed: number; unsure: number };
}

export interface AttemptSummary {
  id: string;
  variant: VariantCode;
  status: string;
  startedAt: string;
  durationMs: number;
  serverMode: string;
  steps: number;
  pageErrors: number;
  consoleErrors: number;
  leftovers: string[];
  inSet: boolean;
}

export interface SummaryFinding {
  job: string;
  key: string;
  seenIn: string;
  severity: Severity;
  status: 'new' | 'still' | 'worse' | 'unclear';
  criterion: string;
  attempt: string;
  variant?: VariantCode;
  step: number;
  /** Absolute paths, for the report's pictures. */
  shot?: string;
  crops: string[];
  where: string;
  text: string;
  expected: string;
  fix: string;
  probe: string[];
}

export interface JobSummary {
  jobId: string;
  scenario: string;
  scenarioTitle: string;
  persona: string;
  personaName: string;
  lens: Persona['lens'];
  variants: VariantCode[];
  /** The criteria of this job, each with its screens. */
  criteria: Record<string, VariantCode[]>;
  state: JobStateName;
  /** What a review prepared now would be. */
  next: 'fresh' | 'recheck';
  set: Partial<Record<VariantCode, string>>;
  missing: VariantCode[];
  latest?: {
    review: string;
    kind: 'fresh' | 'recheck';
    /** Whether it saw the current plays. */
    current: boolean;
    overall: string;
    scores: Review['scores'];
    why: Record<string, string>;
    mean?: number;
    min?: number;
    open: Record<Severity, number>;
    liked: string[];
  };
  /** Why this job does not meet the bar; empty when it does. */
  bar: BarMiss[];
  reviews: ReviewHistory[];
  attempts: AttemptSummary[];
}

/** One way a job misses the bar. */
export type BarMiss =
  | { kind: 'unplayed' }
  | { kind: 'partial'; variants: VariantCode[] }
  | { kind: 'waiting' }
  | {
      kind: 'low';
      scores: { criterion: string; variant: VariantCode; score: number }[];
    }
  | { kind: 'mean'; mean: number }
  | { kind: 'open'; severity: Severity; count: number };

export function describeMiss(miss: BarMiss, bar: StudyBar): string {
  switch (miss.kind) {
    case 'unplayed':
      return 'not played';
    case 'partial':
      return `not played on ${miss.variants.join(', ')}`;
    case 'waiting':
      return 'waits for a review';
    case 'low':
      return `below ${bar.minScore}: ${miss.scores
        .map((s) => `${s.criterion} ${s.variant} ${s.score}`)
        .join(', ')}`;
    case 'mean':
      return `mean ${miss.mean} < ${bar.minMean}`;
    case 'open':
      return `${miss.count} ${miss.severity} open`;
  }
}

export interface RulePrecision {
  rule: ProbeRule;
  confirmed: number;
  dismissed: number;
  unsure: number;
  /** confirmed ÷ (confirmed + dismissed). */
  precision?: number;
  /** Under 50% on 30 or more verdicts: the probe should say it as info. */
  demote: boolean;
}

export interface StudySummary {
  schema: 1;
  study: { id: string; title: string; question: string };
  generatedAt: string;
  /** Met when every job meets it; a study with no jobs does not. */
  bar: StudyBar & { met: boolean };
  counts: Record<JobStateName, number> & { jobs: number };
  mean?: number;
  min?: number;
  /** The columns of the matrix: every criterion some job is judged on. */
  criteria: { id: string; label: string; lens: Persona['lens'] }[];
  jobs: JobSummary[];
  /** Open findings of each job's latest review, most severe first. */
  findings: SummaryFinding[];
  probe: RulePrecision[];
  changes: ChangeEntry[];
}

export function scoreStats(scores: Review['scores']): {
  mean?: number;
  min?: number;
} {
  const values = Object.values(scores)
    .flatMap((byVariant) => Object.values(byVariant))
    .filter((value): value is number => typeof value === 'number');
  if (!values.length) return {};
  return {
    mean:
      Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) /
      100,
    min: Math.min(...values),
  };
}

function emptyStatuses(): Record<PreviousStatus, number> {
  return { fixed: 0, still: 0, worse: 0, unclear: 0 };
}

/** Every crop of the fingerprints a finding cites, on its step or any other. */
function findingCrops(
  attempt: Attempt | undefined,
  step: number,
  fps: string[],
): string[] {
  if (!attempt) return [];
  const crops: string[] = [];
  for (const fp of fps) {
    const own = cropFile(attempt, step, fp);
    if (own) {
      crops.push(own);
      continue;
    }
    const dir = join(attempt.dir, 'crops');
    const other = existsSync(dir)
      ? readdirSync(dir).find((name) => name.endsWith(`-${cropKey(fp)}.png`))
      : undefined;
    if (other) crops.push(join(dir, other));
  }
  return crops;
}

export function summarize(
  runs: string,
  study: string,
  now = new Date(),
): StudySummary {
  const studyFile = readStudy(runs, study);
  const bar = resolveBar(studyFile.bar);
  const loaded = loadJobs(runs, study);
  const jobs: JobSummary[] = [];
  const findings: SummaryFinding[] = [];
  const verdicts = new Map<string, { rule: ProbeRule; verdict: string }>();
  const used = new Set<string>();
  const allScores: Review['scores'][] = [];

  for (const job of loaded) {
    const state = jobState(job);
    const criteria = criteriaFor(
      job.persona,
      job.job.required,
      studyFile.criteria,
    );
    for (const { criterion } of criteria) used.add(criterion.id);
    const rules = fpRules(job);

    const reviews: ReviewHistory[] = job.reviews.map((folder) => {
      const checked = state.checked.get(folder.id);
      // A folder nobody answered yet still says what it was prepared for.
      const prepared = InputsSchema.safeParse(folder.inputs);
      const inputs =
        checked?.inputs ?? (prepared.success ? prepared.data : undefined);
      const review = checked?.review;
      const history: ReviewHistory = {
        review: folder.id,
        kind: inputs?.kind,
        base: inputs?.base,
        preparedAt: inputs?.preparedAt,
        answered: !!checked,
        valid: !!review,
        errors: checked?.validation.errors ?? [],
        attempts: inputs?.attempts ?? {},
        found: severityCounts(review?.findings ?? []),
        previous: emptyStatuses(),
        verdicts: { confirmed: 0, dismissed: 0, unsure: 0 },
      };
      if (review) {
        Object.assign(history, scoreStats(review.scores));
        for (const mark of review.previous) history.previous[mark.status]++;
        for (const [fp, verdict] of Object.entries(review.probe)) {
          history.verdicts[verdict.verdict]++;
          const rule = rules.get(fp);
          // Each fingerprint counts once: its latest verdict.
          if (rule) verdicts.set(fp, { rule, verdict: verdict.verdict });
        }
      }
      return history;
    });

    const latestValid = state.valid.at(-1);
    let latest: JobSummary['latest'];
    const misses: BarMiss[] = [];
    if (state.state === 'unplayed') misses.push({ kind: 'unplayed' });
    else if (state.state === 'partial')
      misses.push({ kind: 'partial', variants: state.missing });
    else if (state.state === 'waiting') misses.push({ kind: 'waiting' });

    if (latestValid) {
      const { folder, review } = latestValid;
      const open = openFindings(state, folder.id);
      const stats = scoreStats(review.scores);
      latest = {
        review: folder.id,
        kind: review.kind,
        current: state.covering?.id === folder.id,
        overall: review.overall,
        scores: review.scores,
        why: review.why ?? {},
        ...stats,
        open: severityCounts(open),
        liked: review.liked,
      };
      allScores.push(review.scores);
      if (latest.current) {
        const low = Object.entries(review.scores).flatMap(([id, byVariant]) =>
          Object.entries(byVariant)
            .filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === 'number' && entry[1] < bar.minScore,
            )
            .map(([variant, score]) => ({
              criterion: id,
              variant: variant as VariantCode,
              score,
            })),
        );
        if (low.length) misses.push({ kind: 'low', scores: low });
        if (stats.mean !== undefined && stats.mean < bar.minMean)
          misses.push({ kind: 'mean', mean: stats.mean });
        for (const severity of bar.forbid)
          if (latest.open[severity])
            misses.push({
              kind: 'open',
              severity,
              count: latest.open[severity],
            });
      }
      for (const f of open) {
        const attempt = job.attempts.find((a) => a.id === f.attempt);
        findings.push({
          job: job.job.jobId,
          key: f.key,
          seenIn: f.seenIn,
          severity: f.severity,
          status: f.status,
          criterion: f.finding.criterion,
          attempt: f.attempt,
          variant: attempt?.variant,
          step: f.step,
          shot: attempt ? attemptFile(attempt, f.shot) : undefined,
          crops: findingCrops(attempt, f.step, f.finding.probe ?? []),
          where: f.finding.where,
          text: f.finding.text,
          expected: f.finding.expected,
          fix: f.finding.fix,
          probe: f.finding.probe ?? [],
        });
      }
    }

    jobs.push({
      jobId: job.job.jobId,
      scenario: job.job.scenario,
      scenarioTitle: job.job.scenarioTitle,
      persona: job.persona.id,
      personaName: job.persona.name,
      lens: job.persona.lens,
      variants: job.job.required,
      criteria: Object.fromEntries(
        criteria.map(({ criterion, variants }) => [criterion.id, variants]),
      ),
      state: state.state,
      next: state.kind,
      set: Object.fromEntries(
        Object.entries(state.set).map(([variant, attempt]) => [
          variant,
          attempt!.id,
        ]),
      ),
      missing: state.missing,
      latest,
      bar: misses,
      reviews,
      attempts: job.attempts.map((attempt) => ({
        id: attempt.id,
        variant: attempt.variant,
        status: attempt.meta.status,
        startedAt: attempt.meta.startedAt,
        durationMs: attempt.meta.durationMs,
        serverMode: attempt.meta.serverMode,
        steps: attempt.steps.length,
        pageErrors: attempt.meta.pageErrors.length,
        consoleErrors: attempt.meta.consoleErrors.length,
        leftovers: attempt.meta.tidy.leftovers,
        inSet: state.set[attempt.variant]?.id === attempt.id,
      })),
    });
  }

  const probe = new Map<ProbeRule, RulePrecision>();
  for (const { rule, verdict } of verdicts.values()) {
    const entry = probe.get(rule) ?? {
      rule,
      confirmed: 0,
      dismissed: 0,
      unsure: 0,
      demote: false,
    };
    entry[verdict as 'confirmed' | 'dismissed' | 'unsure']++;
    probe.set(rule, entry);
  }
  for (const entry of probe.values()) {
    const judged = entry.confirmed + entry.dismissed;
    if (judged)
      entry.precision = Math.round((entry.confirmed / judged) * 100) / 100;
    entry.demote = judged >= 30 && (entry.precision ?? 1) < 0.5;
  }

  const counts = {
    jobs: jobs.length,
    unplayed: 0,
    partial: 0,
    waiting: 0,
    reviewed: 0,
  };
  for (const job of jobs) counts[job.state]++;

  const merged: Review['scores'] = {};
  allScores.forEach((scores, i) => {
    for (const [id, byVariant] of Object.entries(scores))
      merged[`${i}:${id}`] = byVariant;
  });

  const severityRank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
  findings.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      a.job.localeCompare(b.job) ||
      a.key.localeCompare(b.key, undefined, { numeric: true }),
  );

  return {
    schema: 1,
    study: {
      id: studyFile.id,
      title: studyFile.title,
      question: studyFile.question,
    },
    generatedAt: now.toISOString(),
    bar: {
      ...bar,
      met: jobs.length > 0 && jobs.every((job) => !job.bar.length),
    },
    counts,
    ...scoreStats(merged),
    criteria: CRITERIA.filter((c) => used.has(c.id)).map((c) => ({
      id: c.id,
      label: criterionById(c.id).label,
      lens: c.lens,
    })),
    jobs,
    findings,
    probe: [...probe.values()].sort((a, b) => a.rule.localeCompare(b.rule)),
    changes: readChanges(runs, study),
  };
}
