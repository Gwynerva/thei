import type { Period } from './period';
import type { RelationNote, RelationWord } from './relation';
import type { ProofreadCategory, TidyComment, TidyItem } from './ai-revise';
import type { AiCertainty } from './ai';

/**
 * The actions a session proposes and the owner applies: one registry for the
 * site's own model and for every app over MCP.
 *
 * An action describes a state its entity could be in — a field set, a tag
 * added, a text corrected — with what it was made against, so it can tell
 * when the entity moved on another way. A new feature of the site that an AI
 * could help with is a new kind here, in the same change.
 */
export const AI_ACTION_KINDS = [
  'update',
  'field',
  'periods',
  'tags',
  'relation',
  'note',
  'access',
  'write',
  'revise',
  'create',
  'delete',
  'remember',
  'term',
  'memory-compact',
  'describe',
] as const;
export type AiActionKind = (typeof AI_ACTION_KINDS)[number];

/** How the cards and the catalog group kinds. */
export type AiActionGroup =
  | 'text'
  | 'fields'
  | 'structure'
  | 'links'
  | 'media'
  | 'access'
  | 'memory'
  | 'undo';

export interface AiActionKindInfo {
  group: AiActionGroup;
  /** An icon of Thei's set. */
  icon: string;
  /** Cannot be undone, so never sure, and its button warns. */
  final?: boolean;
  /** Always the owner's call, whatever the model says. */
  alwaysUnsure?: boolean;
}

export const AI_ACTION_INFO: Record<AiActionKind, AiActionKindInfo> = {
  update: { group: 'fields', icon: 'edit' },
  field: { group: 'fields', icon: 'edit' },
  periods: { group: 'fields', icon: 'calendar' },
  tags: { group: 'links', icon: 'tag' },
  relation: { group: 'links', icon: 'relation-related' },
  note: { group: 'memory', icon: 'lightbulb' },
  access: { group: 'access', icon: 'lock-open', alwaysUnsure: true },
  write: { group: 'text', icon: 'text' },
  revise: { group: 'text', icon: 'text' },
  create: { group: 'structure', icon: 'plus-circle' },
  delete: {
    group: 'structure',
    icon: 'delete',
    final: true,
    alwaysUnsure: true,
  },
  remember: { group: 'memory', icon: 'brain' },
  term: { group: 'memory', icon: 'case-important' },
  'memory-compact': { group: 'memory', icon: 'collapse-vertical' },
  describe: { group: 'media', icon: 'visibility' },
};

/**
 * What a memory record is about, as an action names it: its target, its
 * target together with another, every entity of a kind, or the owner.
 */
export const AI_REMEMBER_ABOUT = ['entity', 'pair', 'kind', 'owner'] as const;
export type AiRememberAbout = (typeof AI_REMEMBER_ABOUT)[number];

/** Fields a `field` action may set, by entity kind. */
export const AI_FIELD_ACTIONS = {
  project: ['title', 'summary', 'reminder', 'synonyms', 'showcase', 'cv'],
  'project-section': ['title', 'summary'],
  event: ['title', 'summary', 'reminder', 'synonyms'],
  'diary-entry': ['reminder'],
  page: ['title', 'summary', 'reminder', 'synonyms'],
  tag: ['description', 'synonyms'],
  profile: ['slogan'],
} as const;

/**
 * One part of a text edit, decided on its own: a correction inside a block,
 * a link that leads nowhere pointed where it should, or a piece of a new
 * order of the blocks — a heading, a repeat dropped, a paragraph split, the
 * blocks moved. A part of a new order depends on the
 * order itself, when it moves blocks: without the moves there is no plan.
 */
export type AiRevisePart =
  | {
      id: string;
      type: 'correction';
      category: ProofreadCategory;
      certainty: AiCertainty;
      reason: string;
      find: string;
      replace: string;
      /** The stored markup the replacement stands for, worked out when made. */
      replaceHtml: string;
      /** Its words alone, for a field of plain text: a caption, a title. */
      replacePlain: string;
    }
  | {
      id: string;
      type: 'heading';
      /** The item of the tidied text it is. */
      item: number;
      text: string;
      level: 2 | 3;
      certainty: AiCertainty;
      reason: string;
    }
  | {
      id: string;
      type: 'delimiter';
      item: number;
      certainty: AiCertainty;
      reason: string;
    }
  | {
      id: string;
      type: 'removal';
      item: number;
      quote: string;
      certainty: AiCertainty;
      reason: string;
    }
  | {
      id: string;
      type: 'split';
      /** The block's place in the text as it was. */
      from: number;
      certainty: AiCertainty;
      reason: string;
    }
  | {
      id: string;
      type: 'relink';
      /**
       * The link, as it is found again (`ContentLinkPlace`): where it stood,
       * and the `nth` of its field's links leading `from` with `words`.
       */
      link: string;
      nth: number;
      /** Its words; a link block's card has none. */
      words: string;
      /** Where it leads now: `thei:<kind>/<id>#place`. */
      from: string;
      /** Where it would lead; none takes the link off, its words kept. */
      to: string | null;
      /** How each reads: the entity, and the heading inside it. */
      fromTitle: string;
      toTitle?: string;
      certainty: AiCertainty;
      reason: string;
    }
  | {
      id: string;
      type: 'order';
      /** The blocks moved, by their place in the text as it was. */
      moved: number[];
      certainty: AiCertainty;
      reason: string;
    };

/**
 * The owner's word on a part: waiting, accepted (and applied with the next
 * apply), kept as it was, applied already, or stale once the text no longer
 * has what it changes.
 */
export type AiRevisePartState =
  'pending' | 'accepted' | 'kept' | 'applied' | 'stale';

/**
 * The owner's word on parts as a request sends it, by part id: the words
 * an owner may say — by default waiting, accepted or kept — and nothing else.
 */
export function partDecisions(
  value: unknown,
  states: readonly AiRevisePartState[] = ['pending', 'accepted', 'kept'],
): Record<string, AiRevisePartState> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, AiRevisePartState] =>
        states.includes(entry[1] as AiRevisePartState),
    ),
  );
}

export type AiActionPayload =
  | {
      kind: 'update';
      /** Form fields by the names `FORM_FIELDS` gives them. */
      changes: Record<string, unknown>;
    }
  | { kind: 'field'; field: string; value: string | boolean | string[] }
  | { kind: 'periods'; periods: Period[] }
  | {
      kind: 'tags';
      /** Existing tags by ref, or a new tag by its title. */
      add: { ref?: string; title: string }[];
      remove: { ref: string; title: string }[];
    }
  | {
      kind: 'relation';
      op: 'add' | 'change' | 'remove';
      /** The other end, as a ref. */
      other: string;
      relation: RelationWord;
      note?: RelationNote;
      /** Why a link in the text would not do. */
      whyNotInlineLink?: string;
    }
  | { kind: 'note'; markdown: string }
  | {
      kind: 'remember';
      about: AiRememberAbout;
      /** For a pair: the other entity, by its ref. */
      other?: string;
      /** For a kind: which kind of entity. */
      entityKind?: string;
      text: string;
    }
  | {
      kind: 'term';
      /** As the owner writes it. */
      word: string;
      note: string;
      forms: string[];
      keep: boolean;
    }
  | {
      kind: 'memory-compact';
      about: Exclude<AiRememberAbout, 'owner'>;
      other?: string;
      entityKind?: string;
      /** The facts in place of all there are now. */
      facts: string[];
    }
  | { kind: 'access'; access: 'public' | 'link-only' | 'private' }
  | {
      kind: 'write';
      /** The text's name, as `read_entity` gives it: body, notes, description… */
      text: string;
      /** A text of its own, more at the end of one, or one in place of it. */
      mode: 'new' | 'append' | 'replace';
      markdown: string;
    }
  | {
      kind: 'revise';
      text: string;
      /**
       * Corrections of words, links that lead nowhere mended, or a new
       * order of the owner's own blocks.
       */
      mode: 'proofread' | 'relink' | 'order';
      parts: AiRevisePart[];
      /** For a new order: the plan its parts are pieces of. */
      plan?: { keys: string[]; items: TidyItem[]; comments: TidyComment[] };
    }
  | {
      /**
       * A new entity. A section's project is the action's target — or the
       * project a parent action makes, when the section is a part of it.
       */
      kind: 'create';
      entity:
        | 'project'
        | 'project-section'
        | 'event'
        | 'diary-entry'
        | 'page'
        | 'tag';
      /** Form fields of the new entity, as `update` names them. */
      fields: Record<string, unknown>;
    }
  | { kind: 'delete' }
  | {
      /**
       * A file's description (`shared/asset-description.ts`), new or said
       * again: the file named, its family — whose description it is — and
       * the words.
       */
      kind: 'describe';
      file: string;
      family: string;
      text: string;
    };

/** The payload of one kind. */
export type AiActionPayloadOf<K extends AiActionKind> = Extract<
  AiActionPayload,
  { kind: K }
>;
