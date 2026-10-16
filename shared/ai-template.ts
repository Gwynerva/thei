import type { AiSessionItem, AiTemplateSchedule } from './ai';

/**
 * A session template: a request to the AI that starts a session — on its
 * schedule, from its button, or when the owner asks for it in a
 * conversation. What to read the model takes from the request itself: it
 * may ask for what changed since the template last ran. The built-in ones
 * are written in the code, and the owner sets only when they run and with
 * which model; the owner's own are written by the owner.
 */

export const AI_TEMPLATE_TITLE_MAX = 120;
export const AI_TEMPLATE_INSTRUCTION_MAX = 2000;

/**
 * The kinds of entity a template without a schedule may be offered on, from
 * their ✦: a ready-made request about the entity in hand.
 */
export const AI_TEMPLATE_OFFER_KINDS = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
  'tag',
] as const;
export type AiTemplateOfferKind = (typeof AI_TEMPLATE_OFFER_KINDS)[number];

/** Where a new template without a schedule is offered: every kind with a text. */
export const AI_TEMPLATE_DEFAULT_OFFER: AiTemplateOfferKind[] = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
];

/**
 * A template without a schedule is a ready-made request: the owner starts
 * it, in a new session with its words to add to; one with a schedule runs
 * by itself.
 */
export function isPresetTemplate(template: Pick<AiTemplateItem, 'schedule'>) {
  return template.schedule.kind === 'manual';
}

/**
 * The built-in templates: when each runs until the owner says otherwise. Their words are phrases (`ai_template_builtins`), in the
 * site's language; they are off until the owner turns one on, since a run
 * spends tokens.
 */
export const AI_BUILTIN_TEMPLATES = {
  'diary-week': {
    schedule: { kind: 'week', day: 1, time: '03:00', timeZone: 'UTC' },
  },
  nightly: {
    schedule: { kind: 'day', time: '03:00', timeZone: 'UTC' },
  },
  graph: {
    schedule: { kind: 'month', time: '04:00', timeZone: 'UTC' },
  },
  tags: {
    schedule: { kind: 'week', day: 1, time: '03:00', timeZone: 'UTC' },
  },
  'year-ago': {
    schedule: { kind: 'day', time: '09:00', timeZone: 'UTC' },
  },
  links: {
    schedule: { kind: 'week', day: 1, time: '04:00', timeZone: 'UTC' },
  },
} as const satisfies Record<string, { schedule: AiTemplateSchedule }>;
export type AiBuiltinTemplateKey = keyof typeof AI_BUILTIN_TEMPLATES;
export const AI_BUILTIN_TEMPLATE_KEYS = Object.keys(
  AI_BUILTIN_TEMPLATES,
) as AiBuiltinTemplateKey[];

/** A built-in template's id, the one its settings are kept under. */
export function builtinTemplateId(key: AiBuiltinTemplateKey) {
  return `builtin-${key}`;
}

export interface AiTemplateItem {
  templateId: string;
  /** For a built-in one, which: its words are the code's. */
  builtin?: string;
  title: string;
  instruction: string;
  /** The model it is answered by; empty for the one of the connection. */
  model: string;
  schedule: AiTemplateSchedule;
  enabled: boolean;
  /** Without a schedule: the kinds of entity it is offered on. */
  offerOn: AiTemplateOfferKind[];
  nextRunAt?: number;
  lastRunAt?: number;
  /** The session its last run started, and what waits in it. */
  lastSession?: {
    sessionUuid: string;
    waiting: number;
    state: string;
    archived: boolean;
  };
}

/** A ready-made request as it is offered: its name and its words. */
export type AiPresetItem = Pick<
  AiTemplateItem,
  'templateId' | 'title' | 'instruction'
>;

/**
 * Whether a template's last run still waits for the owner: answering, or
 * holding actions or a question not yet decided, and not archived. Its next
 * scheduled run waits too, so a template piles up no sessions while the
 * owner is away — one run, once they are back, reads everything since.
 */
export function templateAwaitsReview(
  template: Pick<AiTemplateItem, 'lastSession'>,
) {
  const last = template.lastSession;
  return Boolean(
    last && !last.archived && (last.state === 'running' || last.waiting > 0),
  );
}

export interface AiTemplateListResponse {
  templates: AiTemplateItem[];
}

/** One template in its window, with the sessions it started. */
export interface AiTemplateDetail {
  template: AiTemplateItem;
  sessions: AiSessionItem[];
}
