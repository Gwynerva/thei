import type { AiSessionItem } from './ai';

/**
 * A session template. A built-in one is a check written in the code: it
 * looks over what it has not looked at yet — the archive's texts for
 * mistakes, its files for a description they lack, its links that lead
 * nowhere, its entities for relations they lack — and the code keeps count
 * of what it checked, so a run goes over only what is new or changed since.
 * From an entity's ✦ it looks at that entity alone. The owner's own are ready-made requests: opened in a new
 * session with their words, to add to and send. Nothing runs by itself.
 * Both are offered everywhere; the owner's words narrow what they do.
 */

export const AI_TEMPLATE_TITLE_MAX = 120;
export const AI_TEMPLATE_INSTRUCTION_MAX = 2000;

/**
 * The built-in checks. Their words are phrases (`ai_template_builtins`), in
 * the site's language. Every template is offered everywhere — on the AI page
 * and in every entity's ✦ — and the owner's words say what it looks at.
 */
export const AI_BUILTIN_TEMPLATE_KEYS = [
  'proofread',
  'describe',
  'links',
  'graph',
] as const;
export type AiBuiltinTemplateKey = (typeof AI_BUILTIN_TEMPLATE_KEYS)[number];

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
