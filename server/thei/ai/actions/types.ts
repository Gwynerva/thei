import type { z } from 'zod';
import type {
  AiActionKind,
  AiActionPayloadOf,
  AiRevisePartState,
} from '#layers/thei/shared/ai-actions';
import type {
  AiActionState,
  AiAppliedBy,
  AiCertainty,
  AiEntityType,
  AiTerm,
} from '#layers/thei/shared/ai';
import type { EntityKey, EntityKind } from '../../entity-kinds';

/**
 * What undoing an applied action needs, written in the transaction that
 * applies it. A form change keeps the fields it changed as they were, and the
 * version of the form it found and left; a text keeps the digests of what it
 * replaced and what it left; a made entity, its key. A deletion keeps
 * nothing: it is final.
 */
export type ActionUndo =
  | {
      kind: 'form';
      /** `null` when what it replaced was too large to keep. */
      before: Record<string, unknown> | null;
      /** Fields that held nothing before. */
      cleared?: string[];
      versionBefore?: number;
      versionAfter?: number;
      /** The fields as a read gave them right after; absent when unsure. */
      after?: Record<string, unknown>;
    }
  | {
      kind: 'create';
      created: EntityKey;
      versionAfter?: number;
    }
  | {
      kind: 'text';
      ownerType: string;
      ownerId: string;
      slot: string;
      beforeDigest: string | null;
      afterDigest: string | null;
      ownerBefore?: number;
      ownerVersion?: number;
    }
  | {
      kind: 'memory';
      /** Records it added, as they read when it left them. */
      added?: { memoryUuid: string; text: string }[];
      /** Records it took away, whole, to be put back. */
      removed?: Record<string, unknown>[];
      /** A word of the dictionary as it was — `null` if there was none — and as it left it. */
      term?: { before: AiTerm | null; after: AiTerm };
      /** «About you» as it was and as it left it. */
      owner?: { before: string; after: string };
    }
  | { kind: 'final' };

/** An action as it is stored. */
export interface ActionRow {
  actionUuid: string;
  sessionUuid: string;
  messageUuid: string | null;
  bundleUuid: string | null;
  bundleOrder: number;
  atomic: boolean;
  kind: string;
  targetType: AiEntityType | null;
  targetId: string | null;
  payload: unknown;
  parts: unknown[] | null;
  base: unknown;
  certainty: AiCertainty;
  reason: string;
  state: AiActionState;
  supersedes: string | null;
  fingerprint: string;
  undo: unknown;
  assetUuids: string[];
  appliedBy: AiAppliedBy | null;
  createdAt: number;
  decidedAt: number | null;
  error: string | null;
}

/** The owner's decisions on a text edit's parts, by part id. */
export type PartDecisions = Record<string, AiRevisePartState>;

/** What `prepare` hands back: the payload as the site will keep it. */
export interface PreparedAction<K extends AiActionKind> {
  payload: AiActionPayloadOf<K>;
  /** What it was made against: a version, a value. */
  base: unknown;
  /** What was left out, each a sentence for the model. */
  dropped: string[];
  /** Files it brings in, held from cleanup while it waits. */
  assetUuids?: string[];
  /** The parts the owner decides one by one, by id. */
  parts?: string[];
}

/**
 * Where an action stands against the archive as it is now. A text edit still
 * open may have parts gone stale on their own.
 */
export type ActionEvaluation =
  | { state: 'open'; parts?: PartStateRow[] }
  /**
   * Settled; a text edit says how each of its parts ended — declined when
   * the owner kept every part as it was.
   */
  | { state: 'done' | 'declined' | 'stale' | 'gone'; parts?: PartStateRow[] };

/** Who applies an action. */
export interface ApplyContext {
  by: AiAppliedBy;
  /** For a text edit: the parts the owner accepted; all sure ones otherwise. */
  parts?: PartDecisions;
}

/**
 * Applying one action: runs `write` inside the transaction of the save, so
 * the action is marked applied, with what undoing it needs, exactly when the
 * change lands. A text edit applied in part says what became of its parts,
 * and stays waiting while some are undecided.
 */
export type ApplyWrite = (
  tx: any,
  schema: any,
  undo: ActionUndo,
  outcome?: { parts?: PartStateRow[]; waiting?: boolean },
) => void;

/** The owner's decision on one part of a text edit, as stored. */
export interface PartStateRow {
  id: string;
  state: AiRevisePartState;
  /** Why a part could not be applied. */
  problem?: string;
}

/**
 * One kind of action, everything the site needs to know of it. What a
 * proposer hands in (`schema`) may differ from what is kept (`payload`): a
 * text edit comes in as corrections or a tidied text, and is kept as parts.
 */
export interface AiActionKindDef<K extends AiActionKind> {
  kind: K;
  /** What a proposer hands in. */
  schema: z.ZodType<unknown>;
  /**
   * What it may be about. Every kind but a new entity needs a target; a new
   * section's is its project.
   */
  targets: readonly EntityKind[];
  /** Checks it against the archive as it is now; throws a refusal. */
  prepare(
    target: EntityKey | undefined,
    input: any,
    context: { reason: string; sources: string[] },
  ): Promise<PreparedAction<K>>;
  /**
   * What makes two of it the same one, beside its kind and target: what the
   * owner declined is known again by it.
   */
  identity(
    payload: AiActionPayloadOf<K>,
    target: EntityKey | undefined,
  ): unknown;
  /** Its identity names its target itself: a relation, read from either end. */
  identityHasTarget?: true;
  /** Applies it, calling `write` inside the save's transaction. */
  apply(
    target: EntityKey | undefined,
    row: ActionRow,
    context: ApplyContext,
    write: ApplyWrite,
  ): Promise<EntityKey | undefined>;
  /** Where it stands now. */
  evaluate(
    target: EntityKey | undefined,
    row: ActionRow,
  ): ActionEvaluation | Promise<ActionEvaluation>;
  /** One line saying what it proposes, for a model and for memory. */
  summary(payload: AiActionPayloadOf<K>): string;
  /** What a model reads of it: what it is for, and what it takes. */
  reference: string;
}
