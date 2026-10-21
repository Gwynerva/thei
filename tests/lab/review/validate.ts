// Checks a reviewer's answer: its shape against the schema, and everything
// it cites against the play it was given — attempts, steps, screenshots,
// the probe's fingerprints, the files it was allowed to read.
import { writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { repoRoot } from '../config';
import type { VariantCode } from '../types';
import { isCriterion, resolveBar } from './criteria';
import {
  attemptFile,
  isFile,
  type Attempt,
  type LoadedJob,
  type ReviewFolder,
} from './runs';
import {
  InputsSchema,
  issueLines,
  AnswerSchema,
  type Review,
  type ReviewInputs,
  type Validation,
} from './schema';

/** A path as compared: absolute, forward slashes, case folded on Windows. */
export function samePath(file: string): string {
  const full = resolve(file).replaceAll('\\', '/');
  return process.platform === 'win32' ? full.toLowerCase() : full;
}

/** The files a review may read, absolute. */
export function allowedFiles(job: LoadedJob, inputs: ReviewInputs): string[] {
  return [
    ...inputs.allowed.run.map((file) => join(job.studyDir, file)),
    ...inputs.allowed.repo.map((file) => join(repoRoot, file)),
  ];
}

/** A file a reviewer names: absolute, or relative to the study's run folder. */
function namedFile(job: LoadedJob, file: string): string {
  return isAbsolute(file) ? file : join(job.studyDir, file);
}

/** A screenshot a finding cites: absolute, or relative to its attempt or the run folder. */
function shotFile(job: LoadedJob, attempt: Attempt, shot: string): string {
  if (isAbsolute(shot)) return shot;
  const inAttempt = attemptFile(attempt, shot);
  return isFile(inAttempt) ? inAttempt : join(job.studyDir, shot);
}

function inside(file: string, dir: string): boolean {
  const rel = relative(dir, file);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

export interface Checked {
  validation: Validation;
  review?: Review;
  inputs?: ReviewInputs;
}

export function validateReview(job: LoadedJob, folder: ReviewFolder): Checked {
  const errors: string[] = [];
  const warnings: string[] = [];
  const done = (review?: Review, inputs?: ReviewInputs): Checked => ({
    validation: {
      job: job.job.jobId,
      review: folder.id,
      ok: errors.length === 0,
      errors,
      warnings,
      validatedAt: new Date().toISOString(),
    },
    review: errors.length ? undefined : review,
    inputs,
  });

  const parsedInputs = InputsSchema.safeParse(folder.inputs);
  if (!parsedInputs.success) {
    errors.push(
      folder.inputs === undefined
        ? 'inputs.json is missing: the folder was not prepared by `lab jobs --pending`'
        : `inputs.json: ${issueLines(parsedInputs.error).join('; ')}`,
    );
    return done();
  }
  const inputs = parsedInputs.data;
  if (folder.answerError) {
    errors.push(`review.json is not JSON: ${folder.answerError}`);
    return done(undefined, inputs);
  }
  if (folder.answer === undefined) {
    errors.push('review.json is missing: the reviewer has not answered');
    return done(undefined, inputs);
  }
  const parsed = AnswerSchema.safeParse(folder.answer);
  if (!parsed.success) {
    for (const line of issueLines(parsed.error))
      errors.push(`review.json ${line}`);
    return done(undefined, inputs);
  }
  const review = parsed.data;

  // Who it is.
  if (review.job !== job.job.jobId)
    errors.push(`job is "${review.job}", but this is ${job.job.jobId}`);
  if (review.review !== folder.id)
    errors.push(`review is "${review.review}", but this is ${folder.id}`);
  if (review.kind !== inputs.kind)
    errors.push(
      `kind is "${review.kind}", but the brief asked for a ${inputs.kind}`,
    );

  // The input set.
  const attempts = new Map<string, Attempt>();
  for (const [variant, id] of Object.entries(inputs.attempts)) {
    const attempt = job.attempts.find((a) => a.id === id);
    if (attempt) attempts.set(id, attempt);
    else errors.push(`attempt ${id} (${variant}) of the inputs is gone`);
  }
  const variantOf = (id: string) => attempts.get(id)?.variant;
  // The answer names the set it judged, so judging older plays shows. An
  // answer to a brief of the first form names none (`ReviewSchemaV1`).
  if (review.schema === 2) {
    const named = Object.entries(review.attempts)
      .map(([variant, id]) => `${variant} ${id}`)
      .sort();
    const given = Object.entries(inputs.attempts)
      .map(([variant, id]) => `${variant} ${id}`)
      .sort();
    if (named.join(', ') !== given.join(', '))
      errors.push(
        `attempts is {${named.join(', ')}}, but the brief's set is {${given.join(', ')}}`,
      );
  }

  // Scores: every criterion of the brief on each of its screens, nothing else.
  const bar = resolveBar(job.study.bar);
  for (const [id, variants] of Object.entries(inputs.criteria)) {
    const scores = review.scores[id];
    if (!scores) {
      errors.push(`scores.${id} is missing`);
      continue;
    }
    for (const variant of variants)
      if (!(variant in scores))
        errors.push(
          `scores.${id}.${variant} is missing (a number, or null if untouched)`,
        );
    for (const variant of Object.keys(scores) as VariantCode[])
      if (!variants.includes(variant))
        errors.push(
          `scores.${id}.${variant}: ${id} is not judged on ${variant}`,
        );
    if (variants.every((variant) => scores[variant] === null))
      warnings.push(`scores.${id} is null on every screen`);
    for (const variant of variants) {
      const score = scores[variant];
      if (typeof score !== 'number' || score >= bar.minScore) continue;
      const explained = review.findings.some(
        (finding) =>
          finding.criterion === id && variantOf(finding.attempt) === variant,
      );
      if (!explained)
        warnings.push(
          `scores.${id}.${variant} is ${score}, below ${bar.minScore}, with no finding of ${id} on ${variant}`,
        );
    }
  }
  for (const id of Object.keys(review.scores))
    if (!inputs.criteria[id])
      errors.push(
        isCriterion(id)
          ? `scores.${id}: not a criterion of this job`
          : `scores.${id}: no such criterion`,
      );
  for (const id of Object.keys(review.why ?? {}))
    if (!inputs.criteria[id])
      warnings.push(`why.${id}: not a criterion of this job`);

  // The probe's suspicions.
  const knownFps = new Set<string>();
  for (const attempt of attempts.values())
    for (const result of attempt.probe.values())
      for (const finding of result.findings) knownFps.add(finding.fp);
  for (const fp of inputs.probe.ask)
    if (!review.probe[fp]) errors.push(`probe.${fp}: no verdict`);
  for (const fp of Object.keys(review.probe))
    if (!inputs.probe.ask.includes(fp) && !inputs.probe.dismissed[fp])
      warnings.push(`probe.${fp}: not one of the suspicions in the brief`);

  // Findings: each points at a step and a screenshot of the set.
  const ids = new Set<string>();
  const citedShots: { id: string; file: string }[] = [];
  for (const finding of review.findings) {
    const at = `findings ${finding.id}`;
    if (ids.has(finding.id)) errors.push(`${at}: the id is used twice`);
    ids.add(finding.id);
    if (!inputs.criteria[finding.criterion])
      errors.push(
        `${at}: criterion "${finding.criterion}" is not one of this job's`,
      );
    const attempt = attempts.get(finding.attempt);
    if (!attempt) {
      errors.push(
        `${at}: attempt "${finding.attempt}" is not in this review's set`,
      );
      continue;
    }
    const criterionVariants = inputs.criteria[finding.criterion];
    if (criterionVariants && !criterionVariants.includes(attempt.variant))
      warnings.push(
        `${at}: ${finding.criterion} is not judged on ${attempt.variant}`,
      );
    const step = attempt.steps.find((s) => s.n === finding.step);
    if (!step)
      errors.push(`${at}: attempt ${attempt.id} has no step ${finding.step}`);
    const file = shotFile(job, attempt, finding.shot);
    if (!isFile(file))
      errors.push(`${at}: shot ${finding.shot} does not exist`);
    else if (!inside(file, attempt.dir))
      errors.push(
        `${at}: shot ${finding.shot} is not of attempt ${attempt.id}`,
      );
    else {
      citedShots.push({ id: finding.id, file });
      if (
        step &&
        ![step.shot, step.marked].some(
          (own) => samePath(attemptFile(attempt, own)) === samePath(file),
        )
      )
        warnings.push(
          `${at}: shot ${finding.shot} is not the screenshot of step ${step.n}`,
        );
    }
    for (const fp of finding.probe ?? [])
      if (!knownFps.has(fp))
        errors.push(
          `${at}: fingerprint ${fp} was not found by the probe in this set`,
        );
  }
  const cited = new Set(review.findings.flatMap((f) => f.probe ?? []));
  for (const [fp, verdict] of Object.entries(review.probe))
    if (verdict.verdict === 'confirmed' && !cited.has(fp))
      warnings.push(`probe.${fp} is confirmed, but no finding cites it`);

  // A recheck marks every earlier finding it was given, and only those.
  if (inputs.kind === 'fresh' && review.previous.length)
    errors.push('previous: a fresh review marks no earlier findings');
  if (inputs.kind === 'recheck') {
    const marked = new Set<string>();
    for (const entry of review.previous) {
      if (marked.has(entry.id))
        errors.push(`previous ${entry.id}: marked twice`);
      marked.add(entry.id);
      if (!inputs.previous.includes(entry.id))
        errors.push(
          `previous ${entry.id}: not one of the findings the brief listed`,
        );
      // Judged on the new plays: a step and a screenshot of the set. An
      // answer of the first form may leave the place out.
      if (entry.attempt === undefined) continue;
      const attempt = attempts.get(entry.attempt);
      if (!attempt) {
        errors.push(
          `previous ${entry.id}: attempt "${entry.attempt}" is not in this review's set; judge it on the new plays`,
        );
        continue;
      }
      const step =
        entry.step === undefined
          ? undefined
          : attempt.steps.find((s) => s.n === entry.step);
      if (entry.step !== undefined && !step)
        errors.push(
          `previous ${entry.id}: attempt ${attempt.id} has no step ${entry.step}`,
        );
      if (entry.shot === undefined) continue;
      const file = shotFile(job, attempt, entry.shot);
      if (!isFile(file) || !inside(file, attempt.dir))
        errors.push(
          `previous ${entry.id}: shot ${entry.shot} is not a screenshot of ${attempt.id}`,
        );
      else {
        citedShots.push({ id: entry.id, file });
        if (
          step &&
          ![step.shot, step.marked].some(
            (own) => samePath(attemptFile(attempt, own)) === samePath(file),
          )
        )
          warnings.push(
            `previous ${entry.id}: shot ${entry.shot} is not the screenshot of step ${step.n}`,
          );
      }
      for (const fp of 'probe' in entry ? (entry.probe ?? []) : [])
        if (!knownFps.has(fp))
          errors.push(
            `previous ${entry.id}: fingerprint ${fp} was not found by the probe in this set`,
          );
    }
    for (const id of inputs.previous)
      if (!marked.has(id)) errors.push(`previous ${id}: not marked`);
  }

  // What it read: only what it was given.
  const allowed = new Set(allowedFiles(job, inputs).map(samePath));
  const read = new Set<string>();
  for (const file of review.filesRead) {
    const full = samePath(namedFile(job, file));
    read.add(full);
    if (!allowed.has(full))
      errors.push(`filesRead: ${file} is not among its inputs`);
  }
  if (!read.has(samePath(join(folder.dir, 'brief.md'))))
    warnings.push('filesRead does not name the brief');
  for (const { id, file } of citedShots) {
    const plain = file.replace(/\.marked\.png$/i, '.png');
    const marked = plain.replace(/\.png$/i, '.marked.png');
    if (!read.has(samePath(plain)) && !read.has(samePath(marked)))
      warnings.push(
        `${id} cites ${relative(job.studyDir, file)}, which filesRead does not name`,
      );
  }

  return done(review, inputs);
}

export function writeValidation(folder: ReviewFolder, validation: Validation) {
  writeFileSync(
    join(folder.dir, 'validation.json'),
    `${JSON.stringify(validation, null, 2)}\n`,
  );
}
