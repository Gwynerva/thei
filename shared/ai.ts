import type { AssetVariantInfo } from './api/asset';
import type { AiMessagePiece } from './ai-message-text';

/**
 * The words of AI sessions that both ends share: where a session comes from,
 * what a message carries beside its words, the states an action goes
 * through and how memory is anchored.
 *
 * A session is a conversation about the archive. The owner starts one, or
 * runs a built-in check that starts one, or an app over MCP leaves one. In
 * it a model answers, asks, and proposes actions; the owner applies them.
 */

/** Who started a session. */
export const AI_SESSION_ORIGINS = ['owner', 'app', 'template'] as const;
export type AiSessionOrigin = (typeof AI_SESSION_ORIGINS)[number];

/** Whether a model is answering in it now, or it was closed. */
export const AI_SESSION_STATES = ['idle', 'running', 'closed'] as const;
export type AiSessionState = (typeof AI_SESSION_STATES)[number];

/** What a session can be about, read or touch: any entity, a file too. */
export const AI_ENTITY_TYPES = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
  'tag',
  'asset',
  'profile',
] as const;
export type AiEntityType = (typeof AI_ENTITY_TYPES)[number];

/** Who speaks: the owner, the model (or the app), or the session itself. */
export const AI_MESSAGE_ROLES = ['owner', 'model', 'note'] as const;
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

/**
 * One thing the model did while answering — read, searched, proposed — by
 * the tool it called and what it named: the page says it in its own words.
 */
export interface AiStep {
  tool: string;
  /** The entities it named, as refs. */
  refs?: string[];
  /** What it searched for, or how many it read. */
  detail?: string;
  /** The tool said no. */
  failed?: boolean;
  /**
   * How many of its proposals the code turned away: already so, already
   * waiting, or declined lately.
   */
  refused?: number;
}

/**
 * Why a turn ended early: stopped by the owner, out of time (the turn took
 * too long, or the service fell silent), cut off when the site restarted,
 * the month's limit reached, no model set, the key refused, the service
 * busy, out of reach or not knowing the model, the model refusing, its
 * answer out of room, too many steps, anything else.
 */
export const AI_NOTICE_KINDS = [
  'stopped',
  'timeout',
  'interrupted',
  'limit',
  'no-model',
  'key',
  'busy',
  'address',
  'model',
  'refused',
  'length',
  'turns',
  'error',
] as const;
export type AiNoticeKind = (typeof AI_NOTICE_KINDS)[number];

/**
 * What a message carries beside its words. A question waits for the owner;
 * steps say what the model read on the way; a comment ties the owner's words
 * to an action; a notice is the session's own word — stopped, the monthly
 * limit reached, the service refused.
 */
export type AiMessagePart =
  | {
      type: 'question';
      text: string;
      options: string[];
      /** The owner's answer: an option, or their own words. */
      answer?: string;
    }
  | { type: 'steps'; steps: AiStep[] }
  /** The owner's comment is about this action: a new version of it is due. */
  | { type: 'comment'; actionUuid: string }
  /**
   * A file the owner brought along, kept in the library with its place in
   * the session; the name is the one it had on their computer.
   */
  | { type: 'file'; assetUuid: string; name: string }
  | {
      type: 'notice';
      kind: AiNoticeKind;
      /** What the service said, for the owner; the page says the rest. */
      text: string;
    }
  /**
   * The run of a built-in check that opens its session, and the entities it
   * is about, by ref.
   */
  | {
      type: 'template';
      templateId: string;
      scope?: string[];
    };

/**
 * A turn of the conversation as the model saw it, kept so the session can go
 * on: vendor-neutral, translated to a provider's own shape on the way out.
 */
export type AiTranscriptTurn =
  /** `files`: what the owner brought along, shown to a model that can see it. */
  | { role: 'user'; text: string; files?: string[] }
  | {
      role: 'assistant';
      text: string;
      calls?: { id: string; name: string; input: unknown }[];
      /**
       * The turn as the provider gave it — its thinking included — handed
       * back whole while the same provider goes on.
       */
      native?: { provider: string; content: unknown };
    }
  | {
      role: 'tool';
      id: string;
      name: string;
      output: string;
      error?: boolean;
      /** Library files the tool showed, shown to a model that can see them. */
      files?: string[];
    };

/** The states of an action, from proposed to settled. */
export const AI_ACTION_STATES = [
  'pending',
  'applying',
  'applied',
  'rejected',
  'undone',
  'stale',
  'failed',
  'superseded',
] as const;
export type AiActionState = (typeof AI_ACTION_STATES)[number];

/**
 * How sure the model is of an action or a part: sure ones come ticked, the
 * owner's call comes with a reason and unticked. A final action — a
 * deletion — is never sure.
 */
export const AI_CERTAINTIES = ['sure', 'unsure'] as const;
export type AiCertainty = (typeof AI_CERTAINTIES)[number];

/** Who applied an action: the owner, or an app with an editor key. */
export type AiAppliedBy = 'owner' | 'app';

/**
 * What a memory record is about, which decides where it is seen and when a
 * model reads it: the owner (always), one entity or a pair of them (with
 * them), or every entity of one kind (when working with such).
 */
export const AI_MEMORY_ANCHORS = ['owner', 'entity', 'pair', 'kind'] as const;
export type AiMemoryAnchor = (typeof AI_MEMORY_ANCHORS)[number];

/** A fact for the model, or an action the owner said never to offer again. */
export const AI_MEMORY_TYPES = ['fact', 'never'] as const;
export type AiMemoryType = (typeof AI_MEMORY_TYPES)[number];

/** A word of the dictionary: a name, a place, the owner's own word. */
export interface AiTerm {
  /** How it is looked up: lower case, letters normalized. */
  word: string;
  /** As the owner wrote it. */
  display: string;
  note: string;
  /** Other forms of it, as written. */
  forms: string[];
  /** Proofreading leaves it as written. */
  keep: boolean;
  createdAt: number;
  updatedAt: number;
}

/** How long a word of the dictionary may be, and its note. */
export const AI_TERM_DISPLAY_MAX = 80;
export const AI_TERM_NOTE_MAX = 300;

/** How long the owner's own memory may be: it is read in every session. */
export const AI_OWNER_MEMORY_MAX = 1500;
/** How long an entity's memory may grow before the model offers to shorten it. */
export const AI_ANCHOR_MEMORY_MAX = 1200;

/** An entity a session names, as a list shows it. */
export interface AiEntityRef {
  ref: string;
  type: AiEntityType;
  id: string;
  title: string;
  /** Where the owner edits it; none once it is gone. */
  path?: string;
}

/** A session as the list shows it. */
export interface AiSessionItem {
  sessionUuid: string;
  title: string;
  origin: AiSessionOrigin;
  /** The app's name for itself. */
  client: string | null;
  templateId: string | null;
  model: string | null;
  state: AiSessionState;
  pinned: boolean;
  waiting: number;
  applied: number;
  rejected: number;
  tokens: number;
  /** Why the last turn stopped early, until the next one. */
  error: string | null;
  createdAt: number;
  lastActiveAt: number;
  closedAt: number | null;
  archivedAt: number | null;
  /** What the owner started it about. */
  about: AiEntityRef[];
}

export interface AiMessageItem {
  messageUuid: string;
  seq: number;
  role: AiMessageRole;
  /** Editing Markdown. */
  text: string;
  /**
   * The words as a text of the archive and the tables among them, diary days
   * named by id: what the page shows once the words are there; while they
   * stream, the page reads them itself.
   */
  body: AiMessagePiece[] | null;
  parts: AiMessagePart[];
  /** The files of its `file` parts, as the library describes them. */
  files: AiMessageFile[];
  tokens: number;
  createdAt: number;
}

export interface AiMessageFile {
  name: string;
  /** Gone from the library: only its name is left. */
  asset: AssetVariantInfo | null;
}

/** Whether an applied action can be taken back now, or why not. */
export type AiUndoState = 'ready' | 'changed' | 'gone' | 'final' | 'undone';

export interface AiActionItem {
  actionUuid: string;
  messageUuid: string | null;
  bundleUuid: string | null;
  bundleOrder: number;
  atomic: boolean;
  kind: string;
  target: AiEntityRef | null;
  payload: unknown;
  /** What it was made against: the value it replaces, a version. */
  base: unknown;
  /** The other entities it names — a relation's other end, tags — by ref. */
  refs: Record<string, AiEntityRef>;
  parts: { id: string; state: string; problem?: string }[] | null;
  certainty: AiCertainty;
  reason: string;
  state: AiActionState;
  supersedes: string | null;
  error: string | null;
  appliedBy: AiAppliedBy | null;
  createdAt: number;
  decidedAt: number | null;
  /** For an applied action: whether it can be undone now. */
  undo: AiUndoState | null;
  /** The owner said never to offer it again. */
  never: boolean;
  /** A file it is about, as the library has it now. */
  file?: import('./api/asset').AssetVariantInfo;
}

/**
 * A text edit with the text it is about, as the editor reads it: what the
 * screen it is gone through on shows.
 */
export interface AiReviewText {
  action: AiActionItem;
  data: import('./content').ContentOutputData;
  /** The session it came from, while that session lives. */
  session?: { sessionUuid: string; title: string };
}

/** The text edits that wait for one text, for its editor to offer. */
export interface AiTextReviews {
  actions: AiActionItem[];
}

export interface AiSessionDetail {
  session: AiSessionItem;
  messages: AiMessageItem[];
  actions: AiActionItem[];
  /** Whether the site's model answers here: sessions of apps it does not. */
  answerable: boolean;
}

export interface AiSessionListResponse {
  sessions: AiSessionItem[];
  /** Pass as `before` for the next page; absent at the end. */
  next?: number;
  /** Whether a model is set to answer sessions. */
  modelReady: boolean;
  /** What waits for the owner across all sessions, as the admin bar counts it. */
  waiting: number;
}

/** How long a session done since counts as recent: a week. */
const AI_SESSION_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Where a session stands: working now, waiting for the owner, done within
 * the week, or done before.
 */
export function aiSessionStanding(
  item: Pick<AiSessionItem, 'state' | 'waiting' | 'lastActiveAt'>,
  now = Date.now(),
): 'running' | 'waiting' | 'recent' | 'earlier' {
  if (item.state === 'running') return 'running';
  if (item.waiting > 0) return 'waiting';
  return now - item.lastActiveAt < AI_SESSION_RECENT_MS ? 'recent' : 'earlier';
}

/** The dashboard's sessions: the latest that wait, work, or are done. */
export interface AiSessionOverview {
  /** The sessions there are, the archive aside. */
  total: number;
  waiting: AiSessionItem[];
  running: AiSessionItem[];
  recent: AiSessionItem[];
}
