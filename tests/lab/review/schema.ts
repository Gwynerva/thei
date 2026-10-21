// What a review folder holds besides the brief: the inputs the review side
// prepared, the reviewer's answer, and the validator's verdict on it.
import { z } from 'zod';

const SEVERITY = z.enum(['blocker', 'serious', 'minor', 'taste']);
const VARIANT = z.enum(['dd', 'dl', 'pd', 'pl']);
const STATUS = z.enum(['fixed', 'still', 'worse', 'unclear']);
const VERDICT = z.enum(['confirmed', 'dismissed', 'unsure']);
const text = z.string().trim().min(1);

/** What every answer holds, whichever brief it answered. */
const answer = {
  job: text,
  review: z.string().regex(/^R\d+$/),
  kind: z.enum(['fresh', 'recheck']),
  /** The whole impression in two or three sentences, in the persona's words. */
  overall: text,
  /** Per criterion, per screen: 1–10, or null where the play never touched it. */
  scores: z.record(
    z.string(),
    z.partialRecord(VARIANT, z.int().min(1).max(10).nullable()),
  ),
  /** Per criterion, why the scores are what they are. */
  why: z.record(z.string(), text).optional(),
  /** A verdict on each of the probe's suspicions, by fingerprint. */
  probe: z.record(z.string(), z.strictObject({ verdict: VERDICT, why: text })),
  findings: z.array(
    z.strictObject({
      id: z.string().regex(/^F\d+$/),
      severity: SEVERITY,
      criterion: text,
      attempt: text,
      step: z.int().min(0),
      shot: text,
      where: text,
      text: text,
      expected: text,
      fix: text,
      probe: z.array(text).optional(),
    }),
  ),
  liked: z.array(text),
  /** Every file the reviewer opened, as it opened it. */
  filesRead: z.array(text).min(1),
};

/** `review.json`: a reviewer's answer, as the brief asks for it now. */
export const ReviewSchema = z.strictObject({
  schema: z.literal(2),
  ...answer,
  /** The attempts the review judged, by screen: exactly the brief's set. */
  attempts: z.partialRecord(VARIANT, text),
  /**
   * On a recheck, each earlier finding the brief lists, by its id `R1/F2`,
   * judged on the new plays: the step and screenshot where it shows now, or
   * would show, and a note on what that screenshot shows.
   */
  previous: z.array(
    z.strictObject({
      id: z.string().regex(/^R\d+\/F\d+$/),
      status: STATUS,
      attempt: text,
      step: z.int().min(0),
      shot: text,
      why: z.string().trim().min(12, 'say what the new screenshot shows'),
      severity: SEVERITY.optional(),
      probe: z.array(text).optional(),
    }),
  ),
});

/**
 * An answer to a brief of the first form, which asked for no `attempts` and
 * let an earlier finding be marked without a place in the new plays. Such an
 * answer is judged by the brief it answered, so reviews already made keep
 * counting; every brief written now asks for the form above.
 */
export const ReviewSchemaV1 = z.strictObject({
  schema: z.literal(1),
  ...answer,
  previous: z.array(
    z.strictObject({
      id: z.string().regex(/^R\d+\/F\d+$/),
      status: STATUS,
      why: text,
      severity: SEVERITY.optional(),
      attempt: text.optional(),
      step: z.int().min(0).optional(),
      shot: text.optional(),
      probe: z.array(text).optional(),
    }),
  ),
});

export const AnswerSchema = z.discriminatedUnion('schema', [
  ReviewSchema,
  ReviewSchemaV1,
]);

export type ReviewV2 = z.infer<typeof ReviewSchema>;
export type Review = z.infer<typeof AnswerSchema>;
export type ReviewFinding = Review['findings'][number];
export type PreviousStatus = z.infer<typeof STATUS>;
export type ProbeVerdict = z.infer<typeof VERDICT>;

/** `inputs.json`: what one review was given, written with its brief. */
export const InputsSchema = z.object({
  schema: z.literal(1),
  study: z.string(),
  job: z.string(),
  review: z.string(),
  kind: z.enum(['fresh', 'recheck']),
  /** The review a recheck follows. */
  base: z.string().optional(),
  lens: z.enum(['persona', 'designer']),
  persona: z.string(),
  /** The input set: the attempt reviewed on each screen. */
  attempts: z.partialRecord(VARIANT, z.string()),
  /** The criteria to score, each with its screens. */
  criteria: z.record(z.string(), z.array(VARIANT)),
  probe: z.object({
    /** Fingerprints that need a verdict. */
    ask: z.array(z.string()),
    /** Dismissed by an earlier review of the job, not asked again. */
    dismissed: z.record(
      z.string(),
      z.object({ review: z.string(), why: z.string() }),
    ),
  }),
  /** Earlier findings a recheck marks, by `R1/F2`. */
  previous: z.array(z.string()),
  /**
   * Files the reviewer may read: `run` relative to the study's run folder,
   * `repo` relative to the repository.
   */
  allowed: z.object({ run: z.array(z.string()), repo: z.array(z.string()) }),
  preparedAt: z.string(),
});

export type ReviewInputs = z.infer<typeof InputsSchema>;

/** `validation.json`. */
export interface Validation {
  job: string;
  review: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  validatedAt: string;
}

/** Turns zod's issues into lines a person reads. */
export function issueLines(error: z.ZodError): string[] {
  return error.issues.map(
    (issue) =>
      `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`,
  );
}
