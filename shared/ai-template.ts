import type { AiSessionItem } from './ai';

/**
 * A session template. A built-in one is a check written in the code: it
 * looks over what it has not looked at yet — the archive's texts for
 * mistakes, its links that lead nowhere, its entities for relations they
 * lack — and the code keeps count of what it checked, so a run goes over
 * only what is new or changed since. From an entity's ✦ it looks at that
 * entity alone. The owner's own are ready-made requests: opened in a new
 * session with their words, to add to and send. Nothing runs by itself.
 */

export const AI_TEMPLATE_TITLE_MAX = 120;
export const AI_TEMPLATE_INSTRUCTION_MAX = 2000;

/** The kinds of entity a template may be offered on, from their ✦. */
export const AI_TEMPLATE_OFFER_KINDS = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
  'tag',
] as const;
export type AiTemplateOfferKind = (typeof AI_TEMPLATE_OFFER_KINDS)[number];

/** Where a new template of the owner's is offered: every kind with a text. */
export const AI_TEMPLATE_DEFAULT_OFFER: AiTemplateOfferKind[] = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
];

/**
 * The built-in checks, each offered — until the owner says otherwise — on
 * the kinds it can look at. Their words are phrases (`ai_template_builtins`),
 * in the site's language.
 */
export const AI_BUILTIN_TEMPLATES = {
  proofread: {
    offerOn: ['project', 'project-section', 'event', 'diary-entry', 'page'],
  },
  links: {
    offerOn: ['project', 'project-section', 'event', 'diary-entry', 'page'],
  },
  graph: { offerOn: ['project', 'event', 'diary-entry'] },
} as const satisfies Record<
  string,
  { offerOn: readonly AiTemplateOfferKind[] }
>;
export type AiBuiltinTemplateKey = keyof typeof AI_BUILTIN_TEMPLATES;
export const AI_BUILTIN_TEMPLATE_KEYS = Object.keys(
  AI_BUILTIN_TEMPLATES,
) as AiBuiltinTemplateKey[];

/**
 * The kinds a template may be offered on: a check only on those it can look
 * at, the owner's own request on any.
 */
export function templateOfferKinds(
  builtin: AiBuiltinTemplateKey | undefined,
): readonly AiTemplateOfferKind[] {
  return builtin
    ? AI_BUILTIN_TEMPLATES[builtin].offerOn
    : AI_TEMPLATE_OFFER_KINDS;
}

/** A built-in template's id, the one its settings are kept under. */
export function builtinTemplateId(key: AiBuiltinTemplateKey) {
  return `builtin-${key}`;
}

export interface AiTemplateItem {
  templateId: string;
  /** For a built-in check, which: its words are the code's. */
  builtin?: AiBuiltinTemplateKey;
  title: string;
  instruction: string;
  /** The model it is answered by; empty for the one of the connection. */
  model: string;
  /** The kinds of entity it is offered on. */
  offerOn: AiTemplateOfferKind[];
  /** The session its last run started, and what waits in it. */
  lastSession?: {
    sessionUuid: string;
    waiting: number;
    state: string;
    archived: boolean;
    startedAt: number;
  };
}

/** A template as an entity's ✦ offers it: run, or put into the message. */
export type AiPresetItem = Pick<
  AiTemplateItem,
  'templateId' | 'title' | 'instruction' | 'builtin'
>;

export interface AiTemplateListResponse {
  templates: AiTemplateItem[];
}

/** One template in its window, with the sessions it started. */
export interface AiTemplateDetail {
  template: AiTemplateItem;
  sessions: AiSessionItem[];
}

/** A check run: its session, or none when nothing new was there to look at. */
export interface AiTemplateRunResponse {
  sessionUuid: string | null;
}
