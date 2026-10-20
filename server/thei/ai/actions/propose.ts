import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import {
  AI_ACTION_INFO,
  type AiActionKind,
} from '#layers/thei/shared/ai-actions';
import type {
  AiCertainty,
  AiEntityType,
  AiMessagePart,
} from '#layers/thei/shared/ai';
import { EntityPrefix } from '../../entity-id';
import { EntityPatchError, refuse as fail } from '../../entity-patch/text';
import { findEntity } from '../../entity-kinds';
import { lostLettersProblem } from '../../lost-letters';
import { zodProblem } from '../refusals';
import { findTarget, targetRef, type ActionTarget } from './target';
import {
  linkSessionEntities,
  refreshSessionCounts,
  touchSession,
} from '../sessions/store';
import { publishActions } from '../sessions/bus';
import { declinedLately, fingerprintOf, neverOffered } from './declined';
import { actionDef } from './registry';
import { findAction, targetOf } from './rows';
import type { PreparedAction } from './types';

/**
 * Proposing actions in a session: each is checked against the archive as it
 * is now and kept with what it was made against. What the owner declined in
 * a living session, or said never to offer, is refused by its fingerprint
 * before it reaches them. Actions proposed together are a bundle; an atomic
 * one is proposed whole or not at all.
 */

/** One action as a proposer hands it in: its own fields beside these. */
export interface ActionProposal {
  kind: string;
  /** What it is about, as a ref; a new entity has none, a section its project. */
  target?: string;
  certainty?: AiCertainty;
  /** Why: shown to the owner beside it. */
  reason?: string;
  /** An action of the same session this one is a new version of. */
  supersedes?: string;
  [field: string]: unknown;
}

export interface ProposeInput {
  sessionUuid: string;
  messageUuid?: string;
  actions: ActionProposal[];
  /** Applied whole or not at all. */
  atomic?: boolean;
  /** What the proposer read on the way, as refs. */
  sources?: string[];
  /** For a turn of Thei's own model: whether it may still write. */
  live?: () => boolean;
}

export type ProposeResult =
  { actionUuid: string; dropped: string[] } | { refused: string };

const OWN_FIELDS = new Set([
  'kind',
  'target',
  'certainty',
  'reason',
  'supersedes',
]);

interface Checked {
  kind: AiActionKind;
  target: ActionTarget | undefined;
  prepared: PreparedAction<AiActionKind>;
  fingerprint: string;
  certainty: AiCertainty;
  reason: string;
  supersedes?: string;
  /** What it supersedes was found by the owner's comment, not named. */
  commented?: boolean;
}

/** An action as what it changes is read from: proposed now, or kept. */
interface Changing {
  kind: string;
  target: ActionTarget | undefined;
  payload: unknown;
}

const changingOf = (item: Checked): Changing => ({
  kind: item.kind,
  target: item.target,
  payload: item.prepared.payload,
});

async function check(
  proposal: ActionProposal,
  sessionUuid: string,
  sources: string[],
): Promise<Checked> {
  const lostLetters = lostLettersProblem(proposal);
  if (lostLetters) fail(lostLetters);
  const def = actionDef(proposal.kind);
  const kind = def.kind;
  let target: ActionTarget | undefined;
  if (proposal.target !== undefined && proposal.target !== null) {
    target = findTarget(proposal.target);
    if (!target) fail(`There is no ${String(proposal.target)}.`);
    if (!def.targets.includes(target.kind))
      fail(
        `A ${kind} action is about ${def.targets.join(', ')}, not ${target.kind}.`,
      );
  }
  const input = Object.fromEntries(
    Object.entries(proposal).filter(([field]) => !OWN_FIELDS.has(field)),
  );
  const parsed = def.schema.safeParse(input);
  if (!parsed.success) fail(`The ${kind} action: ${zodProblem(parsed.error)}`);
  const reason =
    typeof proposal.reason === 'string'
      ? proposal.reason.replace(/\s+/g, ' ').trim().slice(0, 500)
      : '';
  const prepared = await def.prepare(target, parsed.data, { reason, sources });
  // A kind that names what it is about in its own fields — a file — says so.
  if (prepared.target) target = prepared.target;
  const fingerprint = fingerprintOf([
    kind,
    def.identityHasTarget || !target ? null : targetRef(target),
    def.identity(prepared.payload, target),
  ]);
  const info = AI_ACTION_INFO[kind];
  const certainty: AiCertainty = info.alwaysUnsure
    ? 'unsure'
    : proposal.certainty === 'unsure'
      ? 'unsure'
      : 'sure';
  if (certainty === 'unsure' && !reason)
    fail('An action left to the owner says why: give its reason.');
  let supersedes: string | undefined;
  if (proposal.supersedes) {
    const previous = findAction(proposal.supersedes);
    if (!previous || previous.sessionUuid !== sessionUuid)
      fail(`There is no action ${proposal.supersedes} in this session.`);
    if (previous.state !== 'pending')
      fail(
        `${proposal.supersedes} is decided already (${previous.state}): propose this one on its own.`,
      );
    supersedes = previous.actionUuid;
  } else
    supersedes = commentedOn(sessionUuid, {
      kind,
      target,
      payload: prepared.payload,
    });
  return {
    kind,
    target,
    prepared,
    fingerprint,
    certainty,
    reason,
    supersedes,
    commented: Boolean(supersedes && !proposal.supersedes),
  };
}

/**
 * The action the owner's last message commented on, when this proposal is
 * its new version — the same kind changing the same of the same target
 * (`subjectOf`), the commented one still waiting. A model that forgets to
 * say so would leave both open, and «apply the sure ones» would apply the
 * version the owner asked to change.
 */
function commentedOn(sessionUuid: string, item: Changing): string | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const last = db
    .select({ parts: schema.aiMessages.parts })
    .from(schema.aiMessages)
    .where(
      and(
        eq(schema.aiMessages.sessionUuid, sessionUuid),
        eq(schema.aiMessages.role, 'owner'),
      ),
    )
    .orderBy(desc(schema.aiMessages.seq))
    .limit(1)
    .get() as { parts: AiMessagePart[] } | undefined;
  const comment = last?.parts.find(
    (part): part is Extract<AiMessagePart, { type: 'comment' }> =>
      part.type === 'comment',
  );
  if (!comment) return undefined;
  const previous = findAction(comment.actionUuid);
  if (!previous || previous.sessionUuid !== sessionUuid) return undefined;
  if (previous.state !== 'pending' || previous.kind !== item.kind)
    return undefined;
  const was = targetOf(previous);
  // By kind and id: a diary entry's ref may name its day or its id.
  const sameTarget =
    was && item.target
      ? was.kind === item.target.kind && was.id === item.target.id
      : !was && !item.target;
  if (!sameTarget) return undefined;
  const before = subjectOf({
    kind: previous.kind,
    target: item.target,
    payload: previous.payload,
  });
  const now = subjectOf(item);
  const same =
    (!before.length && !now.length) ||
    now.some((name) => before.includes(name));
  return same ? previous.actionUuid : undefined;
}

/**
 * What of its target a proposal is about, to know a new version of one
 * from another proposal of its kind: what it changes, by name — a field, a
 * text — or the relation of its pair, whatever word it is named by, the
 * word of the dictionary, where a fact is remembered. None for a kind its
 * target alone names: the tags of an entity, an idea for its notes.
 */
function subjectOf(item: Changing): string[] {
  const names = changes(item);
  if (names.length) return names;
  const on = item.target ? targetRef(item.target) : '';
  const payload = item.payload as {
    other?: string;
    about?: string;
    entityKind?: string;
  };
  switch (item.kind) {
    case 'relation':
      return payload.other
        ? [`the relation of ${[on, payload.other].sort().join(' and ')}`]
        : [];
    case 'term':
      return [
        `the word ${JSON.stringify(actionDef(item.kind).identity(item.payload as never, item.target))}`,
      ];
    case 'remember':
    case 'memory-compact':
      return [
        `the memory ${[payload.about, on, payload.other, payload.entityKind].filter(Boolean).join(' ')}`,
      ];
    default:
      return [];
  }
}

/**
 * What of its target an action changes, by name: a field, the dates, who
 * may see it, one of its texts. Tags, relations and the like name what
 * they add or take away, and two of them stand side by side.
 */
function changes(item: Changing): string[] {
  if (!item.target) return [];
  const on = targetRef(item.target);
  const payload = item.payload as {
    field?: string;
    changes?: Record<string, unknown>;
    text?: string;
  };
  switch (item.kind) {
    case 'field':
      return [`${payload.field} of ${on}`];
    case 'update':
      return Object.keys(payload.changes ?? {}).map((key) => `${key} of ${on}`);
    case 'periods':
    case 'access':
      return [`${item.kind} of ${on}`];
    case 'write':
    case 'revise':
      return [`the text ${payload.text} of ${on}`];
    case 'describe':
      // One description serves a whole family.
      return [
        `the description of ${(item.payload as { family?: string }).family ?? on}`,
      ];
    default:
      return [];
  }
}

/**
 * Actions proposed together are one bundle, applied whole: one that changes
 * what an earlier one of them changes is an alternative, and goes alone.
 */
function sameChange(checked: (Checked | { refused: string })[]) {
  const taken = new Set<string>();
  return checked.map((item) => {
    if ('refused' in item) return item;
    const names = changes(changingOf(item));
    const clash = names.find((name) => taken.has(name));
    if (clash)
      return {
        refused: `An earlier action of this call changes ${clash} too, and actions proposed together are applied together. Propose alternatives in calls of their own.`,
      };
    for (const name of names) taken.add(name);
    return item;
  });
}

/**
 * An action is replaced by one new version a call: the first that names
 * it — what a model says outweighs what is found for it — else the first
 * the owner's comment makes one. Another found by the same comment is a
 * proposal of its own; another naming it is refused, its model having said
 * two versions stand.
 */
function oneVersionEach(checked: (Checked | { refused: string })[]) {
  const claimed = new Set<string>();
  const named = checked.map((item) => {
    if ('refused' in item || !item.supersedes || item.commented) return item;
    if (claimed.has(item.supersedes))
      return {
        refused: `An earlier action of this call is the new version of ${item.supersedes} already: propose this one on its own.`,
      };
    claimed.add(item.supersedes);
    return item;
  });
  return named.map((item) => {
    if ('refused' in item || !item.commented) return item;
    if (claimed.has(item.supersedes!))
      return { ...item, supersedes: undefined, commented: false };
    claimed.add(item.supersedes!);
    return item;
  });
}

/** Why an action already met is not proposed again, if it is not. */
function metBefore(checked: Checked[]): Map<string, string> {
  const fingerprints = checked.map((item) => item.fingerprint);
  const never = neverOffered(fingerprints);
  const declined = declinedLately(fingerprints);
  const { db, schema } = THEI_SERVER.useDb();
  const reasons = new Map<string, string>();
  for (const item of checked) {
    if (never.has(item.fingerprint))
      reasons.set(
        item.fingerprint,
        'The owner said never to offer this again.',
      );
    else if (declined.has(item.fingerprint))
      reasons.set(
        item.fingerprint,
        'The owner declined this lately: do not offer it again unless they ask.',
      );
    else {
      const waiting = db
        .select({ actionUuid: schema.aiActions.actionUuid })
        .from(schema.aiActions)
        .where(
          and(
            eq(schema.aiActions.fingerprint, item.fingerprint),
            eq(schema.aiActions.state, 'pending'),
          ),
        )
        .get();
      if (waiting && waiting.actionUuid !== item.supersedes)
        reasons.set(
          item.fingerprint,
          `It waits for the owner already: ${waiting.actionUuid}.`,
        );
    }
  }
  return reasons;
}

/** A new version in an atomic bundle of an action decided meanwhile. */
class LateInBundle extends Error {
  constructor(readonly item: Checked) {
    super('An action of an atomic bundle came too late.');
  }
}

/**
 * Proposes actions in a session. Returns, for each in order, its id or why
 * it was refused.
 */
export async function proposeActions(
  input: ProposeInput,
  now = Date.now(),
): Promise<{ results: ProposeResult[]; bundleUuid?: string }> {
  const sources = input.sources ?? [];
  const outcomes: (Checked | { refused: string })[] = [];
  for (const proposal of input.actions) {
    try {
      outcomes.push(await check(proposal, input.sessionUuid, sources));
    } catch (error) {
      if (!(error instanceof EntityPatchError)) throw error;
      outcomes.push({ refused: error.message });
    }
  }
  const alone = oneVersionEach(sameChange(outcomes));
  const met = metBefore(
    alone.filter((item): item is Checked => !('refused' in item)),
  );
  const decided = alone.map((item) =>
    'refused' in item || !met.has(item.fingerprint)
      ? item
      : { refused: met.get(item.fingerprint)! },
  );
  const refusedAny = decided.some((item) => 'refused' in item);
  if (input.atomic && refusedAny)
    return {
      results: decided.map((item) =>
        'refused' in item
          ? item
          : {
              refused:
                'Not proposed: another action of this atomic bundle was refused.',
            },
      ),
    };
  const accepted = decided.filter(
    (item): item is Checked => !('refused' in item),
  );
  const bundleUuid =
    accepted.length > 1
      ? `${EntityPrefix.AiBundle}-${randomUUID()}`
      : undefined;
  const ids = new Map<Checked, string>();
  /** New versions of an action the owner decided while they were made. */
  const late = new Set<Checked>();
  const lateWords = (item: Checked) =>
    `${item.supersedes} was decided while this version was made: read session_actions, and propose it on its own if it still stands.`;
  const { db, schema } = THEI_SERVER.useDb();
  try {
    db.transaction((tx) => {
      // A session deleted while its turn ran keeps nothing a model left after.
      const live = tx
        .select({ sessionUuid: schema.aiSessions.sessionUuid })
        .from(schema.aiSessions)
        .where(eq(schema.aiSessions.sessionUuid, input.sessionUuid))
        .get();
      if (!live) fail('The session is gone.');
      // Nor does a turn stopped while its proposals were checked.
      if (input.live && !input.live())
        fail('The turn was stopped; nothing was proposed.');
      accepted.forEach((item, order) => {
        if (item.supersedes) {
          const replaced = tx
            .update(schema.aiActions)
            .set({ state: 'superseded', decidedAt: now })
            .where(
              and(
                eq(schema.aiActions.actionUuid, item.supersedes),
                eq(schema.aiActions.state, 'pending'),
              ),
            )
            .run() as { changes: number };
          if (!replaced.changes) {
            if (bundleUuid && input.atomic) throw new LateInBundle(item);
            late.add(item);
            return;
          }
        }
        const actionUuid = `${EntityPrefix.AiAction}-${randomUUID()}`;
        ids.set(item, actionUuid);
        tx.insert(schema.aiActions)
          .values({
            actionUuid,
            sessionUuid: input.sessionUuid,
            messageUuid: input.messageUuid ?? null,
            bundleUuid: bundleUuid ?? null,
            bundleOrder: order,
            atomic: Boolean(bundleUuid && input.atomic),
            kind: item.kind,
            targetType: (item.target?.kind as AiEntityType) ?? null,
            targetId: item.target?.id ?? null,
            payload: item.prepared.payload,
            parts: item.prepared.parts?.length
              ? item.prepared.parts.map((id) => ({ id, state: 'pending' }))
              : null,
            base: item.prepared.base ?? null,
            certainty: item.certainty,
            reason: item.reason,
            state: 'pending',
            supersedes: item.supersedes ?? null,
            fingerprint: item.fingerprint,
            assetUuids: item.prepared.assetUuids ?? [],
            createdAt: now,
          })
          .run();
      });
      const touched = accepted
        .filter((item) => !late.has(item))
        .flatMap((item) => {
          const ends: ActionTarget[] = item.target ? [item.target] : [];
          const payload = item.prepared.payload as {
            kind: string;
            other?: string;
          };
          if (payload.kind === 'relation' && payload.other) {
            const other = findEntity(payload.other);
            if (other) ends.push(other);
          }
          return ends.map((key) => ({
            type: key.kind as AiEntityType,
            id: key.id,
            role: 'touched' as const,
          }));
        });
      linkSessionEntities(tx, schema, input.sessionUuid, touched, now);
      touchSession(tx, schema, input.sessionUuid, now);
      refreshSessionCounts(tx, schema, input.sessionUuid);
    });
  } catch (error) {
    // An atomic bundle goes whole: one of it come too late takes the rest.
    if (!(error instanceof LateInBundle)) throw error;
    return {
      results: decided.map((item) =>
        'refused' in item
          ? item
          : {
              refused:
                item === error.item
                  ? lateWords(item)
                  : 'Not proposed: another action of this atomic bundle was refused.',
            },
      ),
    };
  }
  const made = accepted.filter((item) => !late.has(item));
  publishActions([
    ...made.flatMap((item) =>
      item.supersedes
        ? [{ sessionUuid: input.sessionUuid, actionUuid: item.supersedes }]
        : [],
    ),
    ...made.map((item) => ({
      sessionUuid: input.sessionUuid,
      actionUuid: ids.get(item)!,
    })),
  ]);
  return {
    results: decided.map((item) =>
      'refused' in item
        ? item
        : late.has(item)
          ? { refused: lateWords(item) }
          : { actionUuid: ids.get(item)!, dropped: item.prepared.dropped },
    ),
    ...(bundleUuid ? { bundleUuid } : {}),
  };
}
