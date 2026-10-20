// The lab's contracts between its parts: what the archive adapter writes and
// the runner reads, what the probe finds and the reviewers judge, what a play
// records. Each part keeps its own internals; what crosses a folder is here.

import type { Page } from '@playwright/test';

// ─── The archive ────────────────────────────────────────────────────────────

/** An entity of the archive, as FORMAT.md names it. */
export type Ref =
  | `project:${string}`
  | `section:${string}/${string}`
  | `event:${string}`
  | `diary:${string}`
  | `page:${string}`
  | `tag:${string}`
  | 'profile';

export type RefKind =
  'project' | 'section' | 'event' | 'diary' | 'page' | 'tag' | 'profile';

export type Access = 'public' | 'link-only' | 'private';

/** `tests/lab/archive.lock.json`: the release of the archive this checkout reads. */
export interface ArchiveLock {
  repo: string;
  version: string;
  commit: string;
  /** The sha256 of the release's `release.json`, which pins everything else. */
  releaseJsonSha256: string;
}

/** `release.json` of an archive release (FORMAT.md, "Releases"). */
export interface ArchiveRelease {
  format: number;
  revision: number;
  version: string;
  commit: string;
  text: { asset: string; sha256: string; bytes: number };
  packs: { asset: string; sha256: string; bytes: number; files: number }[];
  files: Record<
    string,
    {
      pack: string;
      path: string;
      sha256: string;
      bytes: number;
      mime: string;
      width?: number | null;
      height?: number | null;
      durationSec?: number | null;
      pages?: number | null;
    }
  >;
}

// ─── A seeded site ──────────────────────────────────────────────────────────

/**
 * `.lab/site-index.json`: what a seeded site holds, by the archive's refs.
 * Scenarios choose what to work on from here — by facts, traits and plants,
 * never by an id they know.
 */
export interface SiteIndex {
  schema: 1;
  archive: {
    version: string;
    format: number;
    revision: number;
    commit: string;
    /** The language the archive is written in, and the site speaks. */
    language: string;
  };
  /** A hash of the adapter's code: a snapshot made by another one is stale. */
  adapter: string;
  seededAt: string;
  /** The local day relative days were resolved against. */
  seedDay: string;
  origin: string;
  snapshotId?: string;
  entities: Record<string, SiteEntity>;
  files: Record<string, SiteFile>;
  plants: Record<string, SitePlant>;
}

export interface SiteEntity {
  ref: Ref;
  kind: RefKind;
  uuid: string;
  title?: string;
  /** A diary entry's day, relative days resolved. */
  date?: string;
  slug?: string;
  publicId?: string;
  access?: Access;
  /** A section's project. */
  project?: Ref;
  /** Base-relative addresses (AGENTS.md, "Addresses"). */
  adminUrl: string;
  publicUrl?: string;
  markdownUrl?: string;
  /** What a stranger got at the public address when the site was seeded. */
  strangerStatus?: number;
  /** The form's version when it was last saved by the seeder. */
  version?: number;
  fingerprint: string;
  /** Computed from the archive: words, blocks, files, relations, periods… */
  facts: Record<string, number | boolean | string>;
  /** Planted properties (`plants.yaml`), by trait. */
  traits: string[];
}

export interface SiteFile {
  id: string;
  assetUuid: string;
  kind: 'image' | 'video' | 'audio' | 'document' | 'other';
  ext: string;
  bytes: number;
  width?: number;
  height?: number;
  durationSec?: number;
  hasDescription: boolean;
  /** Where the archive places it. */
  places: Ref[];
  traits: string[];
}

export interface SitePlant {
  id: string;
  ref?: Ref;
  file?: string;
  traits: string[];
  where?: string;
  word?: string;
  detail?: string;
}

/** A saved site, in the shared cache (`snapshots/<id>/manifest.json`). */
export interface SnapshotManifest {
  id: string;
  createdAt: string;
  archive: SiteIndex['archive'] | { conformance: true };
  adapter: string;
  /** The migrations its database has run (`_thei_migrations`), in order. */
  ledger: string[];
  engineVersion: string;
  seedDay: string;
  code: { commit: string; dirty: boolean };
  /** Files of `content/assets`, linked from the cache's blobs. */
  assets: { path: string; sha256: string; bytes: number }[];
}

// ─── Personas, studies, scenarios ───────────────────────────────────────────

export type Role = 'owner' | 'visitor';
export type Viewport = 'desktop' | 'phone';
export type Theme = 'light' | 'dark';

/** A viewport and a theme, written short: `dd`, `dl`, `pd`, `pl`. */
export type VariantCode = 'dd' | 'dl' | 'pd' | 'pl';
export interface Variant {
  viewport: Viewport;
  theme: Theme;
}

/** `tests/lab/personas/<id>.md`: its frontmatter, and its text as `about`. */
export interface Persona {
  id: string;
  /** How the reports call it: "Novice". */
  name: string;
  /** `persona` judges as a user; `designer` judges only how screens look. */
  lens: 'persona' | 'designer';
  /** An owner is signed in; a visitor is a stranger. A lens may be either. */
  role?: Role;
  experience?: 'novice' | 'expert';
  /** What they would use; a study's variants are narrowed to these. */
  devices: Viewport[];
  /** Files beyond the play the reviewer may read (`docs/design/**`). */
  reads?: string[];
  /** Who they are, what they know and do not, what they want and fear. */
  about: string;
}

export interface StudyBar {
  minScore: number;
  minMean: number;
  /** Severities none of the reviews may report. */
  forbid: Severity[];
}

export interface StudyDefinition {
  id: string;
  title: string;
  /** What the study wants to learn, in a sentence. */
  question: string;
  personas: string[];
  variants: VariantCode[];
  /** Criteria added to, or left out of, the lens's own. */
  criteria?: { add?: string[]; skip?: string[] };
  bar?: Partial<StudyBar>;
  /** The site's state before a play. */
  site?: { ai?: 'on' | 'off' };
  /** The study's scenarios, in order. */
  scenarios: ScenarioDefinition[];
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  /** Who the scenario is for; personas of other roles are not played. */
  roles: Role[];
  /**
   * The task in the persona's words: `{name}` is filled with what `pick`
   * chose (a title, a day), or the task is written from it.
   */
  task: string | ((picked: Record<string, Ref>, index: SiteIndex) => string);
  /**
   * Chooses what to work on, by facts and traits of the index. `salt` tells
   * plays apart (the variant), so a phone and a computer may take different
   * entities of the same kind.
   */
  pick(index: SiteIndex, salt: string): Record<string, Ref>;
  /** Entities whose forms the play may change: read before, put back after. */
  touches?(picked: Record<string, Ref>): Ref[];
  run(j: ScenarioContext): Promise<void>;
}

/**
 * Something on the screen, found the way a person finds it: by its role and
 * name, its visible words, or its label. Never by `data-*` or a class.
 */
export type Target =
  | string
  | { role: string; name?: string | RegExp; exact?: boolean }
  | { text: string | RegExp; exact?: boolean }
  | { label: string | RegExp }
  | { placeholder: string | RegExp }
  /**
   * Words as a person sees them, CSS-generated ones too (an editor's "Start
   * writing…" drawn by `::before`), which no role or text query reaches.
   */
  | { shown: string };

export interface StepOptions {
  /** What should appear once the action is done; its wait is measured. */
  answer?: Target;
  /** What should go away once the action is done. */
  answerGone?: Target;
  /** How long to wait for the target and the answer, 8 s by default. */
  timeoutMs?: number;
  /** A missing target or answer is noted, and the play goes on. */
  optional?: boolean;
  /** Which match to take when several answer: the first by default. */
  nth?: number;
}

/** What a scenario's `run` is handed. The recorder fills it. */
export interface ScenarioContext {
  page: Page;
  persona: Persona;
  variant: Variant;
  /** On a phone: taps instead of clicks, a touch screen. */
  phone: boolean;
  index: SiteIndex;
  picked: Record<string, Ref>;
  /** The picked entities as the index knows them. */
  entity(name: string): SiteEntity;
  /** One recorded step: a screenshot, its metrics and the probe after it. */
  step(
    label: string,
    action?: StepAction,
    options?: StepOptions,
  ): Promise<StepRecord>;
  /** Whether something is on the screen now, without a step. */
  sees(target: Target, timeoutMs?: number): Promise<boolean>;
  /** A note for the reviewers about this play. */
  note(text: string): void;
  /** A finding the play itself noticed: a control not found, an answer late. */
  finding(finding: Omit<PlayFinding, 'step'>): void;
  /** Something the play made, to be removed afterwards. */
  created(item: {
    kind: 'project' | 'event' | 'diary' | 'page' | 'tag';
    uuid: string;
  }): void;
}

export type StepAction =
  | { open: string }
  | { click: Target }
  | { fill: Target; text: string }
  | { type: string }
  | { press: string }
  | { hover: Target }
  | { look: Target }
  | { scroll: number };

// ─── The probe ──────────────────────────────────────────────────────────────

export type ProbeRule =
  | 'overlap'
  | 'covered-control'
  | 'clipped-text'
  | 'page-overflow'
  | 'leaves-viewport'
  | 'near-miss'
  | 'uneven-gap'
  | 'small-target'
  | 'broken-image';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProbeFinding {
  /** Stable across plays of the same screen: rule, elements, viewport, theme. */
  fp: string;
  rule: ProbeRule;
  hint: 'serious' | 'minor' | 'info';
  boxes: Box[];
  /** `mark`: the element's `data-expect` id, on the probe's own fixtures. */
  elements: { path: string; desc: string; mark?: string }[];
  /** What was measured: `{ deltaPx: 2 }`, `{ overlapPx2: 64 }`. */
  measure: Record<string, number>;
  /** One line in Russian, for the reviewer. */
  message: string;
}

export interface ProbeResult {
  viewport: { width: number; height: number };
  dpr: number;
  scrollY: number;
  root: 'page' | 'dialog';
  ms: number;
  findings: ProbeFinding[];
  suppressed: { allow: string; count: number }[];
}

// ─── Plays ──────────────────────────────────────────────────────────────────

export type Severity = 'blocker' | 'serious' | 'minor' | 'taste';

export interface StepRecord {
  n: number;
  label: string;
  action:
    | 'open'
    | 'click'
    | 'tap'
    | 'fill'
    | 'type'
    | 'press'
    | 'hover'
    | 'look'
    | 'scroll'
    | 'none';
  url: string;
  sinceStartMs: number;
  shot: string;
  marked: string;
  target?: { name: string; box: Box; inView: boolean; smallestSide?: number };
  pointer?: { from: [number, number]; to: [number, number]; travelPx: number };
  scroll?: { needed: boolean; distancePx: number };
  keys?: number;
  answer?: { firstFeedbackMs?: number; answerMs?: number; timedOut?: boolean };
  blockedMs?: number;
  coveredBy?: string;
  probe: { counts: Partial<Record<ProbeRule, number>>; fps: string[] };
  note?: string;
}

export interface PlayFinding {
  step: number;
  severity: Severity;
  kind: 'missing-control' | 'slow' | 'no-answer' | 'stopped' | 'error';
  text: string;
}

export interface AttemptMeta {
  attemptId: string;
  study: string;
  jobId: string;
  scenario: string;
  persona: string;
  variant: Variant;
  role: Role;
  /** The task as this play gave it, names filled. */
  task: string;
  picked: Record<string, Ref>;
  status: 'done' | 'stopped' | 'error' | 'disturbed';
  startedAt: string;
  durationMs: number;
  code: {
    commit: string;
    dirty: boolean;
    diffHash?: string;
    diffHashEnd?: string;
  };
  archive: { version: string };
  snapshotId?: string;
  target: 'lab' | 'playground';
  serverMode: 'dev' | 'build';
  pageErrors: string[];
  consoleErrors: string[];
  blockedHosts: string[];
  /** The lab's own limits, never findings about the site. */
  labNotes: string[];
  tidy: { restored: string[]; deleted: string[]; leftovers: string[] };
}

// ─── Reviews ────────────────────────────────────────────────────────────────

/** One reviewer's job, as `lab jobs --json` hands it to the workflow. */
export interface ReviewJobArgs {
  job: string;
  review: string;
  kind: 'fresh' | 'recheck';
  lens: Persona['lens'];
  dir: string;
  brief: string;
  out: string;
}

/** What a reviewer agent returns to the workflow; its full answer is `out`. */
export interface ReviewSummary {
  job: string;
  review: string;
  wrote: boolean;
  mean?: number;
  blocker?: number;
  serious?: number;
  minor?: number;
  taste?: number;
  confirmed?: number;
  dismissed?: number;
}

// ─── Commands ───────────────────────────────────────────────────────────────

export interface Command {
  summary: string;
  usage?: string;
  /** Returns the exit code; nothing is 0. */
  run(args: string[]): Promise<number | void>;
}

export type Commands = Record<string, Command>;

/** A line of `lab status`, from one part of the lab. */
export interface StatusLine {
  part: string;
  ok: boolean | 'warn';
  text: string;
}
