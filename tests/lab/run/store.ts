// Where plays are kept (`.lab/runs/<study>/`), and what is read back from it.
//
//   study.json                            the study as last played
//   jobs/<scenario>.<persona>/job.json    the job
//   jobs/…/attempts/<MMDD-HHMMSS>-<v>/    one play of one variant:
//     attempt.json  steps.json  findings.json  probe/NN.json
//     shots/NN-<slug>.png  shots/NN-<slug>.marked.png  crops/
//   jobs/…/reviews/R<n>/                  reviews (tests/lab/review/)
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { paths } from '../config';
import type {
  AttemptMeta,
  Persona,
  Role,
  StudyDefinition,
  VariantCode,
  Viewport,
  Theme,
} from '../types';

export const VARIANTS: Record<
  VariantCode,
  { viewport: Viewport; theme: Theme }
> = {
  dd: { viewport: 'desktop', theme: 'dark' },
  dl: { viewport: 'desktop', theme: 'light' },
  pd: { viewport: 'phone', theme: 'dark' },
  pl: { viewport: 'phone', theme: 'light' },
};

export function variantCode(variant: {
  viewport: Viewport;
  theme: Theme;
}): VariantCode {
  return `${variant.viewport[0]}${variant.theme[0]}` as VariantCode;
}

export function studyDir(study: string) {
  return join(paths.runs, study);
}

export function jobId(scenario: string, persona: string) {
  return `${scenario}.${persona}`;
}

export function jobDir(study: string, job: string) {
  return join(studyDir(study), 'jobs', job);
}

export function writeJson(path: string, value: unknown) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T>(path: string): T | undefined {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as T)
    : undefined;
}

export interface JobFile {
  jobId: string;
  study: string;
  scenario: string;
  scenarioTitle: string;
  persona: string;
  lens: Persona['lens'];
  role: Role;
  /** The variants whose latest plays a review covers. */
  required: VariantCode[];
}

/** The study as it was played, for the reviews and the report. */
export function writeStudyFile(
  study: StudyDefinition,
  personas: Map<string, Persona>,
  bar: { minScore: number; minMean: number; forbid: string[] },
) {
  writeJson(join(studyDir(study.id), 'study.json'), {
    id: study.id,
    title: study.title,
    question: study.question,
    variants: study.variants,
    criteria: study.criteria ?? {},
    bar,
    personas: study.personas.map((id) => personas.get(id)),
    scenarios: study.scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      roles: scenario.roles,
      // A task written from what was picked is in each attempt's own words.
      ...(typeof scenario.task === 'string' ? { task: scenario.task } : {}),
    })),
  });
}

export function attemptStamp(at = new Date()) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
}

/** Every attempt of a job, oldest first. */
export function listAttempts(study: string, job: string): AttemptMeta[] {
  const dir = join(jobDir(study, job), 'attempts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const meta = readJson<AttemptMeta>(join(dir, name, 'attempt.json'));
      return meta ? [meta] : [];
    });
}
