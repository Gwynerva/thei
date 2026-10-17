import { and, eq, inArray } from 'drizzle-orm';
import type { AiAppliedBy } from '#layers/thei/shared/ai';
import { EntityPatchError, refuse as fail } from '../../entity-patch/text';
import {
  entityFace,
  findEntity,
  formOwnerOf,
  formOwnerVersion,
  refOf,
} from '../../entity-kinds';
import { isFileKey, targetRef, type ActionTarget } from './target';
import { formPart, loadForm } from '../forms/load';
import {
  linkSessionEntities,
  refreshSessionCounts,
  touchSession,
} from '../sessions/store';
import { publishActions } from '../sessions/bus';
import { coverApplied } from '../templates/coverage';
import { actionLocks, relationEnds, withEntityLocks } from './lock';
import { actionDef } from './registry';
import {
  entityTargetOf,
  findActions,
  inArchivedSession,
  targetOf,
} from './rows';
import { undoAction, type RollbackTo, type StoredUndo } from './undo';
import { assetIdsIn } from './values';
import { currentText } from './current';
import { fixState } from './kinds/text';
import {
  AI_ACTION_INFO,
  type AiActionKind,
  type AiRevisePart,
} from '#layers/thei/shared/ai-actions';
import { alignTidyBase } from '#layers/thei/shared/content-edit-markdown/tidy';
import {
  takenParts,
  type RevisePayload,
} from '#layers/thei/shared/content-revise';
import { pick, UNDO_KEEP_LIMIT } from './write';
import type {
  ActionEvaluation,
  ActionRow,
  ActionUndo,
  ApplyContext,
  PartDecisions,
  PartStateRow,
} from './types';

/**
 * Applying actions: the owner's ✓, a bundle's «Apply · N», or an editor key's
 * own apply. The actions chosen are checked whole first, then applied in
 * order, each through the entity's own save; when one fails, those applied
 * before it are taken back in reverse, and the failed one says why.
 */

interface ApplyRequest {
  actionUuids: string[];
  by: AiAppliedBy;
  /** For text edits and new entities: the owner's word on each part. */
  parts?: Record<string, PartDecisions>;
}

interface ApplyOutcome {
  applied: { actionUuid: string; entity?: string }[];
  /** Why nothing was applied, when nothing was. */
  refused?: string;
  /** The action that failed, with why; the ones before it were taken back. */
  failed?: { actionUuid: string; error: string };
  /**
   * The entities — and files — whose open forms read an older state now, as
   * refs: what was applied, a relation's other end too, and what a failed
   * bundle wrote and took back, which moved their versions all the same.
   */
  changed: string[];
}

/** Where an action stands now, as its kind tells. */
export async function evaluateAction(
  row: ActionRow,
): Promise<ActionEvaluation> {
  const key = targetOf(row);
  // A file's kind tells for itself: its family outlives the file named.
  if (key && !isFileKey(key) && row.kind !== 'delete' && !entityFace(key))
    return { state: 'gone' };
  return actionDef(row.kind).evaluate(key, row);
}

/**
 * Marks actions that the archive has overtaken: done when the entity reads
 * as the action would leave it, stale when it moved another way. A text
 * edit's parts go stale one by one. Returns the rows as they stand now.
 */
export async function settleActions(rows: ActionRow[]): Promise<ActionRow[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const now = Date.now();
  const sessions = new Set<string>();
  const touched: ActionRow[] = [];
  const result: ActionRow[] = [];
  for (const row of rows) {
    if (row.state !== 'pending') {
      result.push(row);
      continue;
    }
    const evaluation = await evaluateAction(row);
    if (evaluation.state === 'open') {
      if (
        evaluation.parts &&
        JSON.stringify(evaluation.parts) !== JSON.stringify(row.parts)
      ) {
        db.update(schema.aiActions)
          .set({ parts: evaluation.parts })
          .where(
            and(
              eq(schema.aiActions.actionUuid, row.actionUuid),
              eq(schema.aiActions.state, 'pending'),
            ),
          )
          .run();
        touched.push(row);
        result.push({ ...row, parts: evaluation.parts });
      } else result.push(row);
      continue;
    }
    // Done by the owner's own hand counts as applied; every part kept as it
    // was, as declined; overtaken, as stale.
    const state =
      evaluation.state === 'done'
        ? 'applied'
        : evaluation.state === 'declined'
          ? 'rejected'
          : 'stale';
    db.update(schema.aiActions)
      .set({
        state,
        decidedAt: now,
        ...(evaluation.parts ? { parts: evaluation.parts } : {}),
        ...(evaluation.state === 'done' && !row.appliedBy
          ? { appliedBy: 'owner' as const }
          : {}),
      })
      .where(
        and(
          eq(schema.aiActions.actionUuid, row.actionUuid),
          eq(schema.aiActions.state, 'pending'),
        ),
      )
      .run();
    sessions.add(row.sessionUuid);
    touched.push(row);
    result.push({
      ...row,
      state,
      decidedAt: now,
      ...(evaluation.parts ? { parts: evaluation.parts } : {}),
    });
  }
  if (sessions.size)
    db.transaction((tx) => {
      for (const sessionUuid of sessions)
        refreshSessionCounts(tx, schema, sessionUuid);
    });
  publishActions(touched);
  // What the owner's own hand made counts as checked as well.
  coverApplied(touched.map((row) => row.actionUuid));
  return result;
}

/** Undo merged with an earlier apply of the same text edit: back to the first. */
function mergedUndo(previous: unknown, next: ActionUndo): ActionUndo {
  const earlier = previous as StoredUndo | null;
  if (earlier?.kind === 'text' && next.kind === 'text')
    return {
      ...next,
      beforeDigest: earlier.beforeDigest,
      ownerBefore: earlier.ownerBefore,
    };
  return next;
}

/**
 * Keeps the fields a form change touched as a read gives them right after
 * it: undoing it later puts them back only while they still read so. Kept
 * only when nothing else changed the form in between.
 */
async function keepAfter(row: ActionRow) {
  const undo = row.undo as StoredUndo | null;
  if (undo?.kind !== 'form' || !undo.before) return;
  const key = entityTargetOf(row);
  if (!key) return;
  const loaded = await loadForm(key).catch(() => undefined);
  const part = loaded && formPart(key, loaded.form);
  if (!part || formOwnerVersion(key) !== undo.versionAfter) return;
  const after = pick(part, [
    ...Object.keys(undo.before),
    ...(undo.cleared ?? []),
  ]);
  if (JSON.stringify(after).length > UNDO_KEEP_LIMIT) return;
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiActions)
    .set({ undo: { ...undo, after } })
    .where(
      and(
        eq(schema.aiActions.actionUuid, row.actionUuid),
        eq(schema.aiActions.state, 'applied'),
      ),
    )
    .run();
}

function snapshot(row: ActionRow): RollbackTo {
  return {
    state: row.state,
    parts: row.parts,
    undo: row.undo,
    appliedBy: row.appliedBy,
    decidedAt: row.decidedAt,
  };
}

/**
 * Applies one action; returns the entity it changed or made, and the undo of
 * this apply alone — what a bundle failing after it rolls back to, where the
 * stored undo of a text applied in parts goes back to its first apply.
 */
async function applyOne(
  row: ActionRow,
  context: ApplyContext,
  now: number,
): Promise<{ entity: ActionTarget | undefined; own: ActionUndo }> {
  const def = actionDef(row.kind);
  const target = targetOf(row);
  let written = false;
  let own: ActionUndo | undefined;
  const entity = await def.apply(
    target,
    row,
    context,
    (tx, schema, undo, outcome) => {
      const table = schema.aiActions;
      own = undo;
      const merged = mergedUndo(row.undo, undo);
      const waiting = outcome?.waiting === true;
      // Files a change frees stay while it may be undone.
      const held = new Set(row.assetUuids);
      if (merged.kind === 'form' && merged.before)
        assetIdsIn(merged.before, held);
      const result = tx
        .update(table)
        .set({
          state: waiting ? 'pending' : 'applied',
          undo: merged,
          ...(outcome?.parts ? { parts: outcome.parts } : {}),
          assetUuids: [...held],
          appliedBy: context.by,
          decidedAt: now,
          error: null,
        })
        .where(
          and(
            eq(table.actionUuid, row.actionUuid),
            eq(table.state, 'applying'),
          ),
        )
        .run() as { changes: number };
      if (!result.changes) fail('It was decided elsewhere in the meantime.');
      written = true;
    },
  );
  if (!written || !own) fail('The change was not saved.');
  return { entity, own };
}

/**
 * What applying an action moves the version of beside what it changes or
 * makes, as refs, read before it is applied: its target, a section's
 * project — whose form it is — and the other ends of the relations it moves.
 */
export function movedBy(row: ActionRow): string[] {
  const target = targetOf(row);
  const refs = target ? [targetRef(target)] : [];
  if (target && !isFileKey(target) && target.kind === 'project-section') {
    const owner = formOwnerOf(target);
    if (owner) refs.push(refOf(owner));
  }
  for (const end of relationEnds(row)) refs.push(refOf(end));
  return refs;
}

/** Claims actions for applying, so a second click or an app can't apply them twice. */
function claim(rows: ActionRow[]): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  const ids = rows.map((row) => row.actionUuid);
  return db.transaction((tx) => {
    const pending = tx
      .select({ actionUuid: schema.aiActions.actionUuid })
      .from(schema.aiActions)
      .where(
        and(
          inArray(schema.aiActions.actionUuid, ids),
          eq(schema.aiActions.state, 'pending'),
        ),
      )
      .all();
    if (pending.length !== ids.length) return false;
    tx.update(schema.aiActions)
      .set({ state: 'applying' })
      .where(inArray(schema.aiActions.actionUuid, ids))
      .run();
    return true;
  });
}

/** Puts claimed actions that were not applied back to waiting. */
function unclaim(
  actionUuids: string[],
  error?: { actionUuid: string; text: string },
) {
  if (!actionUuids.length) return;
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiActions)
    .set({ state: 'pending' })
    .where(
      and(
        inArray(schema.aiActions.actionUuid, actionUuids),
        eq(schema.aiActions.state, 'applying'),
      ),
    )
    .run();
  if (error)
    db.update(schema.aiActions)
      .set({ error: error.text })
      .where(eq(schema.aiActions.actionUuid, error.actionUuid))
      .run();
}

/**
 * Applies the chosen actions, in their bundles' order. An atomic bundle is
 * chosen whole or not at all. Everything is checked against the archive
 * first; a failure takes back what this call applied.
 */
export async function applyActions(
  request: ApplyRequest,
  now = Date.now(),
): Promise<ApplyOutcome> {
  const outcome = await applyChosen(request, now);
  publishActions(findActions([...new Set(request.actionUuids)]));
  return outcome;
}

/**
 * Why an atomic bundle would not go whole, if it would not: every member of
 * it is chosen, or applied already — one declined, overtaken or replaced
 * leaves the rest nothing to go with.
 */
function partedBundle(rows: ActionRow[]): string | undefined {
  const chosen = new Set(rows.map((row) => row.actionUuid));
  const bundles = new Set(
    rows.flatMap((row) =>
      row.atomic && row.bundleUuid ? [row.bundleUuid] : [],
    ),
  );
  if (!bundles.size) return undefined;
  const { db, schema } = THEI_SERVER.useDb();
  const members = db
    .select({
      actionUuid: schema.aiActions.actionUuid,
      state: schema.aiActions.state,
    })
    .from(schema.aiActions)
    .where(inArray(schema.aiActions.bundleUuid, [...bundles]))
    .all();
  if (
    members.some((member) =>
      member.state === 'pending'
        ? !chosen.has(member.actionUuid)
        : member.state !== 'applied',
    )
  )
    return 'These actions go together: apply the whole bundle, or none of it — and none of it once a part of it is declined or overtaken.';
  return undefined;
}

async function applyChosen(
  request: ApplyRequest,
  now: number,
): Promise<ApplyOutcome> {
  const changed: string[] = [];
  const rows = findActions([...new Set(request.actionUuids)]);
  if (rows.length !== new Set(request.actionUuids).size)
    return {
      applied: [],
      refused: 'Some of those actions do not exist.',
      changed,
    };
  if (rows.some((row) => row.state !== 'pending'))
    return {
      applied: [],
      refused: `Decided already: ${rows
        .filter((row) => row.state !== 'pending')
        .map((row) => `${row.actionUuid} (${row.state})`)
        .join(', ')}.`,
      changed,
    };
  if (inArchivedSession(rows))
    return {
      applied: [],
      refused:
        'Its session is in the archive: nothing is decided in it until the owner brings it back.',
      changed,
    };
  const parted = partedBundle(rows);
  if (parted) return { applied: [], refused: parted, changed };
  // In order, but what cannot be taken back last: nothing after it can fail
  // and leave it standing while the rest is rolled back.
  const final = (row: ActionRow) =>
    AI_ACTION_INFO[row.kind as AiActionKind]?.final ? 1 : 0;
  rows.sort(
    (a, b) =>
      final(a) - final(b) ||
      a.createdAt - b.createdAt ||
      (a.bundleUuid ?? '').localeCompare(b.bundleUuid ?? '') ||
      a.bundleOrder - b.bundleOrder,
  );

  const moved = new Map(rows.map((row) => [row.actionUuid, movedBy(row)]));
  // As its form knows it: a diary entry by its day.
  const changedBy = (item: { row: ActionRow; entity?: ActionTarget }) =>
    [
      ...(item.entity ? [targetRef(item.entity)] : []),
      ...(moved.get(item.row.actionUuid) ?? []),
    ].map((ref) => {
      const key = ref.startsWith('asset:') ? undefined : findEntity(ref);
      return key ? refOf(key) : ref;
    });
  return withEntityLocks(
    rows.flatMap((row) => actionLocks(row)),
    async () => {
      // Checked whole: what the archive overtook is marked, and nothing applies.
      const settled = await settleActions(rows);
      const overtaken = settled.filter((row) => row.state !== 'pending');
      if (overtaken.length)
        return {
          applied: [],
          refused: `The archive has moved on: ${overtaken
            .map(
              (row) =>
                `${row.actionUuid} is ${row.state === 'applied' ? 'done already' : row.state}`,
            )
            .join(', ')}.`,
          changed,
        };
      const fresh = settled;
      // Settled whole, an atomic bundle may have lost a part meanwhile.
      const parted = partedBundle(fresh);
      if (parted) return { applied: [], refused: parted, changed };
      if (!claim(fresh))
        return {
          applied: [],
          refused: 'They were decided elsewhere in the meantime.',
          changed,
        };
      const done: {
        row: ActionRow;
        before: RollbackTo;
        entity?: ActionTarget;
        own: ActionUndo;
      }[] = [];
      for (const row of fresh) {
        try {
          const { entity, own } = await applyOne(
            { ...row, state: 'applying' },
            {
              by: request.by,
              parts: request.parts?.[row.actionUuid],
            },
            now,
          );
          done.push({ row, before: { ...snapshot(row), own }, entity, own });
          // What it left is read now, before the next of the bundle — a
          // relation, a tag — moves the same form on and the read is lost.
          const stored = findActions([row.actionUuid])[0];
          if (stored) await keepAfter(stored);
        } catch (error) {
          const text =
            error instanceof EntityPatchError
              ? error.message
              : 'It could not be applied.';
          if (!(error instanceof EntityPatchError))
            console.error('[thei] applying an AI action failed', error);
          // Take back what this call applied, last first. Written and taken
          // back, the forms they changed read an older version all the same.
          const stuck: string[] = [];
          for (const item of [...done].reverse()) {
            try {
              await undoAction(item.row.actionUuid, { rollback: item.before });
            } catch {
              stuck.push(item.row.actionUuid);
            }
          }
          unclaim(
            fresh.slice(fresh.indexOf(row)).map((item) => item.actionUuid),
            { actionUuid: row.actionUuid, text },
          );
          const { db, schema } = THEI_SERVER.useDb();
          db.transaction((tx) =>
            refreshSessionCounts(tx, schema, row.sessionUuid),
          );
          return {
            applied: done
              .filter((item) => stuck.includes(item.row.actionUuid))
              .map((item) => ({
                actionUuid: item.row.actionUuid,
                entity: item.entity && targetRef(item.entity),
              })),
            failed: {
              actionUuid: row.actionUuid,
              error: stuck.length
                ? `${text} What was applied before it could not all be taken back.`
                : text,
            },
            changed: [...new Set(done.flatMap(changedBy))],
          };
        }
      }
      changed.push(...new Set(done.flatMap(changedBy)));
      const { db, schema } = THEI_SERVER.useDb();
      db.transaction((tx) => {
        for (const sessionUuid of new Set(
          fresh.map((row) => row.sessionUuid),
        )) {
          linkSessionEntities(
            tx,
            schema,
            sessionUuid,
            // A deleted entity is forgotten, not linked back.
            done.flatMap((item) =>
              item.entity && item.row.kind !== 'delete'
                ? [
                    {
                      type: item.entity.kind,
                      id: item.entity.id,
                      role: 'touched' as const,
                    },
                  ]
                : [],
            ),
            now,
          );
          touchSession(tx, schema, sessionUuid, now);
          refreshSessionCounts(tx, schema, sessionUuid);
        }
      });
      // Only what stands counts as checked: a bundle taken back leaves none.
      coverApplied(done.map((item) => item.row.actionUuid));
      return {
        applied: done.map((item) => ({
          actionUuid: item.row.actionUuid,
          entity: item.entity && targetRef(item.entity),
        })),
        changed,
      };
    },
  );
}

/** What the owner decided on the parts of an action, without applying it. */
export function decideParts(
  actionUuid: string,
  decisions: PartDecisions,
): PartStateRow[] {
  const row =
    findActions([actionUuid])[0] ?? fail(`There is no action ${actionUuid}.`);
  if (row.state !== 'pending') fail(`It is ${row.state} already.`);
  const parts = ((row.parts ?? []) as PartStateRow[]).map((part) =>
    part.state === 'pending' ||
    part.state === 'accepted' ||
    part.state === 'kept'
      ? decisions[part.id] &&
        ['pending', 'accepted', 'kept'].includes(decisions[part.id]!)
        ? { id: part.id, state: decisions[part.id]! }
        : part
      : part,
  );
  const { db, schema } = THEI_SERVER.useDb();
  db.update(schema.aiActions)
    .set({ parts })
    .where(
      and(
        eq(schema.aiActions.actionUuid, actionUuid),
        eq(schema.aiActions.state, 'pending'),
      ),
    )
    .run();
  publishActions([row]);
  return parts;
}

/**
 * A text edit taken in the editor, told once its form is saved: what the
 * saved text shows made is applied — a correction whose words read as it
 * would have them, a new order the text no longer reads as before it — the
 * parts left are kept as they were, and once none waits the edit is
 * applied, or declined when nothing of it was made. The text itself went
 * with the form; the report is checked against it, never taken on trust.
 */
export function markTakenInEditor(
  actionUuid: string,
  decisions: PartDecisions,
  now = Date.now(),
): void {
  const row =
    findActions([actionUuid])[0] ?? fail(`There is no action ${actionUuid}.`);
  if (row.state !== 'pending' || row.kind !== 'revise') return;
  // What waits in the archive is offered nowhere, and decided by nothing.
  if (inArchivedSession([row])) return;
  const payload = row.payload as RevisePayload & { text: string };
  const key = entityTargetOf(row);
  const text = key ? currentText(key, payload.text) : undefined;
  if (!text) return;
  const taken = takenParts(payload, (id) => {
    const decision = decisions[id];
    return decision === 'accepted' || decision === 'kept'
      ? decision
      : 'pending';
  });
  const made = (part: AiRevisePart) =>
    part.type === 'correction' || part.type === 'relink'
      ? fixState(text.data, part) === 'applied'
      : Boolean(payload.plan) &&
        !alignTidyBase(text.data?.blocks ?? [], payload.plan!.keys);
  const parts = ((row.parts ?? []) as PartStateRow[]).map(
    (part): PartStateRow => {
      if (part.state === 'applied' || part.state === 'stale') return part;
      const def = payload.parts.find((each) => each.id === part.id);
      if (taken.has(part.id) && def && made(def))
        return { id: part.id, state: 'applied' };
      // A new order lands once: what was left of it is kept as it was.
      if (
        decisions[part.id] === 'kept' ||
        (payload.mode === 'order' && taken.size && !taken.has(part.id))
      )
        return { id: part.id, state: 'kept' };
      return part;
    },
  );
  const waiting = parts.some(
    (part) => part.state === 'pending' || part.state === 'accepted',
  );
  const applied = parts.some((part) => part.state === 'applied');
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    tx.update(schema.aiActions)
      .set({
        parts,
        ...(waiting
          ? {}
          : applied
            ? { state: 'applied', appliedBy: 'owner', decidedAt: now }
            : { state: 'rejected', decidedAt: now }),
      })
      .where(
        and(
          eq(schema.aiActions.actionUuid, actionUuid),
          eq(schema.aiActions.state, 'pending'),
        ),
      )
      .run();
    refreshSessionCounts(tx, schema, row.sessionUuid);
  });
  publishActions([row]);
  coverApplied([actionUuid]);
}
