import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type {
  ContentOwnerType,
  ContentSlot,
} from '#layers/thei/shared/content';
import type { TagEditItem } from '#layers/thei/shared/tag';
import {
  findHistoryText,
  describeHistoryData,
  releaseHistoryHolds,
  touchReleasedAssets,
} from '../../content/history';
import {
  readStoredText,
  refuse as fail,
  saveText,
} from '../../entity-patch/text';
import {
  entityFace,
  formOwnerOf,
  formOwnerVersion,
  textMayBeEmpty,
  type EntityKey,
} from '../../entity-kinds';
import { removeEntity } from '../forms/entities';
import { actionLocks, withEntityLocks } from './lock';
import {
  CHANGED_AFTER,
  formPart,
  loadForm,
  saved,
  withFormPart,
} from '../forms/load';
import { publishActions } from '../sessions/bus';
import { refreshSessionCounts } from '../sessions/store';
import { entityTargetOf, findAction, targetOf } from './rows';
import type { ActionTarget } from './target';
import {
  AssetDescriptionConflict,
  familyExists,
  fileOfFamily,
  readFamilyDescription,
  writeAssetDescription,
} from '../../assets/descriptions';
import { memoryUndoReady, undoMemory } from './kinds/memory';
import { alike } from './write';
import type { ActionRow, ActionUndo } from './types';

/**
 * Whether an applied action can still be undone, and undoing it.
 *
 * An undo never takes a later change with it: a field change is undone while
 * the fields read as it left them, a text while it says what it was written
 * to say, and a made entity while only actions have changed it since. What
 * cannot be told for sure is refused rather than guessed. A deletion is final.
 */

/** What undoing it did to the version of its form, kept for later undos. */
export type StoredUndo = ActionUndo & {
  undone?: { at: number; before?: number; after?: number };
};

export type UndoState = 'ready' | 'changed' | 'gone' | 'final' | 'undone';

/**
 * Tags as they were, made again by their titles where they are gone: a
 * simple tag goes away with the last entity it was on, so taking it off is
 * undone by putting a tag of that title back.
 */
function revivedTags(items: TagEditItem[]): TagEditItem[] {
  const { db, schema } = THEI_SERVER.useDb();
  const ids = items.flatMap((item) => (item.tagUuid ? [item.tagUuid] : []));
  const present = new Set(
    ids.length
      ? db
          .select({ tagUuid: schema.tags.tagUuid })
          .from(schema.tags)
          .where(inArray(schema.tags.tagUuid, ids))
          .all()
          .map((row) => row.tagUuid)
      : [],
  );
  return items.map((item) =>
    !item.tagUuid || present.has(item.tagUuid) ? item : { title: item.title },
  );
}

/** The version of its form an applied action found, and the one it left. */
function ownerVersionsOf(undo: StoredUndo) {
  switch (undo.kind) {
    case 'form':
      return { before: undo.versionBefore, after: undo.versionAfter };
    case 'create':
      return { before: undo.versionBefore, after: undo.versionAfter };
    case 'text':
      return { before: undo.ownerBefore, after: undo.ownerVersion };
    default:
      return { before: undefined, after: undefined };
  }
}

/**
 * Whether only actions have changed what `made` made since: from the
 * version `made` left, each step — an action applied or undone on its form —
 * began at the version the one before it left, and the last left the version
 * it is at now. A change by anyone else — the owner's own form, a relation
 * drawn from the other side — leaves a version no step began at, and the
 * chain ends short of now. Steps that change no version, or began before,
 * lead nowhere and are passed over.
 */
function onlyActionsSince(made: ActionRow, owner: EntityKey): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  const sections =
    owner.kind === 'project'
      ? db
          .select({ id: schema.projectContentSections.sectionUuid })
          .from(schema.projectContentSections)
          .where(eq(schema.projectContentSections.projectUuid, owner.id))
          .all()
          .map((section) => section.id)
      : [];
  const t = schema.aiActions;
  // Only the actions on its form: the entity, and a project's sections. An
  // action applied before it may have been undone after it, so none is
  // left out by its clock.
  const rows = db
    .select()
    .from(t)
    .where(
      and(
        isNotNull(t.undo),
        or(
          and(eq(t.targetType, owner.kind as never), eq(t.targetId, owner.id)),
          ...(sections.length
            ? [
                and(
                  eq(t.targetType, 'project-section'),
                  inArray(t.targetId, sections),
                ),
              ]
            : []),
        ),
      ),
    )
    .all() as ActionRow[];
  let chain = ownerVersionsOf(made.undo as StoredUndo).after;
  if (chain === undefined) return false;
  const steps: { before?: number; after?: number }[] = [];
  for (const row of rows) {
    if (row.actionUuid === made.actionUuid) continue;
    const undo = row.undo as StoredUndo;
    steps.push(ownerVersionsOf(undo));
    if (undo.undone)
      steps.push({ before: undo.undone.before, after: undo.undone.after });
  }
  // Each step begins where the one before it ended, whatever their clocks
  // say; one that moved the version to where it began leads nowhere new.
  for (;;) {
    const next = steps.findIndex(
      (step) =>
        step.before === chain &&
        step.after !== undefined &&
        step.after !== chain,
    );
    if (next === -1) break;
    chain = steps.splice(next, 1)[0]!.after!;
  }
  return formOwnerVersion(owner) === chain;
}

function textTargetOf(undo: Extract<ActionUndo, { kind: 'text' }>) {
  return {
    ownerType: undo.ownerType as ContentOwnerType,
    ownerId: undo.ownerId,
    slot: undo.slot as ContentSlot,
  };
}

/** Whether an applied action can still be undone, or why not. */
export async function undoState(row: ActionRow): Promise<UndoState> {
  const undo = row.undo as StoredUndo | null;
  if (!undo) return row.state === 'undone' ? 'undone' : 'final';
  if (undo.undone || row.state === 'undone') return 'undone';
  if (undo.kind === 'final') return 'final';
  if (undo.kind === 'form' && !undo.before) return 'final';
  switch (undo.kind) {
    case 'memory':
      return memoryUndoReady(undo) ? 'ready' : 'changed';
    case 'description':
      if (!familyExists(undo.familyUuid)) return 'gone';
      return readFamilyDescription(undo.familyUuid).text === undo.after
        ? 'ready'
        : 'changed';
    case 'text': {
      const target = textTargetOf(undo);
      const key = { kind: target.ownerType, id: target.ownerId } as EntityKey;
      if (!entityFace(key)) return 'gone';
      const current = readStoredText(target).data;
      if (
        (current ? describeHistoryData(current).digest : null) !==
        undo.afterDigest
      )
        return 'changed';
      if (
        undo.beforeDigest &&
        !findHistoryText(
          {
            ownerType: target.ownerType,
            ownerRef: target.ownerId,
            slot: target.slot,
          },
          undo.beforeDigest,
        )
      )
        return 'final';
      return 'ready';
    }
    case 'form': {
      const key = entityTargetOf(row);
      if (!key || !entityFace(key)) return 'gone';
      if (
        undo.versionAfter !== undefined &&
        formOwnerVersion(key) === undo.versionAfter
      )
        return 'ready';
      const loaded = await loadForm(key).catch(() => undefined);
      const part = loaded && formPart(key, loaded.form);
      if (!part) return 'gone';
      return readsAsLeft(undo, part) ? 'ready' : 'changed';
    }
    case 'create': {
      if (!entityFace(undo.created)) return 'gone';
      const owner = formOwnerOf(undo.created);
      if (!owner) return 'gone';
      return onlyActionsSince(row, owner) ? 'ready' : 'changed';
    }
  }
}

/**
 * Whether the fields a form change touched read as a read gave them right
 * after it — compared as `alike` says, so another end's new title does not
 * count as a change of a relation.
 */
function readsAsLeft(undo: Extract<ActionUndo, { kind: 'form' }>, part: any) {
  if (!undo.after || !undo.before) return false;
  const fields = [...Object.keys(undo.before), ...(undo.cleared ?? [])];
  return alike(part, fields) === alike(undo.after, fields);
}

const UNDO_REFUSALS = {
  undone: 'It has been undone already.',
  changed: CHANGED_AFTER,
  gone: 'It is gone since: there is nothing to undo.',
} as const;

function finalRefusal(undo: StoredUndo | null): string {
  if (!undo || undo.kind === 'final')
    return 'A deletion is final: it cannot be undone.';
  return undo.kind === 'text'
    ? 'The text it replaced is no longer kept in its history; change it back by hand.'
    : 'What it replaced was too large to keep; change it back by hand.';
}

/**
 * What an action looked like before an apply that is being taken back: a
 * failed bundle puts its actions back as they were, waiting.
 */
export interface RollbackTo {
  state: ActionRow['state'];
  parts: unknown[] | null;
  undo: unknown;
  appliedBy: ActionRow['appliedBy'];
  decidedAt: number | null;
  /**
   * The undo of the apply being rolled back alone: a text applied in parts
   * goes back to before this apply, not to before its first.
   */
  own?: unknown;
}

/**
 * Marks an action undone — or, rolled back, as it was before the apply —
 * inside the transaction that takes its change back: one decided elsewhere
 * meanwhile refuses the whole.
 */
function markUndone(
  tx: any,
  schema: any,
  row: ActionRow,
  rollback: RollbackTo | undefined,
  undone: StoredUndo,
) {
  const table = schema.aiActions;
  const result = tx
    .update(table)
    .set(
      rollback
        ? {
            state: rollback.state,
            parts: rollback.parts,
            undo: rollback.undo,
            appliedBy: rollback.appliedBy,
            decidedAt: rollback.decidedAt,
          }
        : { state: 'undone', undo: undone },
    )
    .where(
      and(eq(table.actionUuid, row.actionUuid), eq(table.state, row.state)),
    )
    .run() as { changes: number };
  if (!result.changes) fail(UNDO_REFUSALS.undone);
  refreshSessionCounts(tx, schema, row.sessionUuid);
}

/**
 * Undoes an applied action while it still can be: puts the fields it changed
 * back as they were, takes back what it made, or puts back the text it
 * replaced. Each is checked again where it is written, so a change landing
 * in between is refused rather than lost. With `rollback`, the action goes
 * back to what it was before, rather than undone.
 */
export async function undoAction(
  actionUuid: string,
  options: { rollback?: RollbackTo; now?: number } = {},
): Promise<ActionTarget | undefined> {
  try {
    return await undoNow(actionUuid, options);
  } finally {
    const row = findAction(actionUuid);
    if (row) publishActions([row]);
  }
}

async function undoNow(
  actionUuid: string,
  options: { rollback?: RollbackTo; now?: number },
): Promise<ActionTarget | undefined> {
  const row =
    findAction(actionUuid) ?? fail(`There is no action ${actionUuid}.`);
  const undo = (options.rollback?.own ?? row.undo) as StoredUndo | null;
  const state = await undoState(row);
  if (state === 'final') fail(finalRefusal(undo));
  if (state !== 'ready') fail(UNDO_REFUSALS[state]);
  const now = options.now ?? Date.now();
  // Memory changes no entity: it is taken back as it was, nothing to version.
  if (undo!.kind === 'memory') {
    await undoMemory(undo!, (tx, schema) =>
      markUndone(tx, schema, row, options.rollback, {
        ...undo!,
        undone: { at: now },
      }),
    );
    return targetOf(row);
  }
  // A description changes no entity either: it is put back as it was, over
  // the version it left.
  if (undo!.kind === 'description') {
    const kept = undo!;
    const current = readFamilyDescription(kept.familyUuid);
    if (current.text !== kept.after) fail(UNDO_REFUSALS.changed);
    const carrier = fileOfFamily(kept.familyUuid) ?? fail(UNDO_REFUSALS.gone);
    try {
      writeAssetDescription(carrier, kept.before, {
        expectedUpdatedAt: current.updatedAt,
        now,
        onWrite: (tx, schema, written) =>
          markUndone(tx, schema, row, options.rollback, {
            ...kept,
            undone: {
              at: now,
              before: current.updatedAt ?? undefined,
              after: written.updatedAt ?? undefined,
            },
          }),
      });
    } catch (error) {
      if (error instanceof AssetDescriptionConflict)
        fail(UNDO_REFUSALS.changed);
      throw error;
    }
    return { kind: 'asset', id: carrier };
  }
  const affected: EntityKey =
    undo!.kind === 'create'
      ? undo!.created
      : undo!.kind === 'text'
        ? ({ kind: undo!.ownerType, id: undo!.ownerId } as EntityKey)
        : entityTargetOf(row)!;
  const owner = formOwnerOf(affected) ?? affected;
  const ownerBefore = formOwnerVersion(owner);
  const finish = (tx: any, schema: any) => {
    const rollback = options.rollback;
    markUndone(tx, schema, row, rollback, {
      ...undo!,
      undone: {
        at: now,
        before: ownerBefore,
        after: formOwnerVersion(owner, tx),
      },
    });
    // What the action held in the history lives as any version does now,
    // unless an earlier apply of it still stands.
    if (!rollback?.undo) releaseHistoryHolds(tx, schema, [actionUuid]);
    // Undone, it needs its files no more: they get their grace from now.
    if (!rollback) touchReleasedAssets(tx, schema, row.assetUuids, now);
  };

  switch (undo!.kind) {
    case 'form': {
      const key = entityTargetOf(row)!;
      const loaded = await loadForm(key);
      const part = formPart(key, loaded.form) ?? fail(UNDO_REFUSALS.gone);
      // Checked again on the very read written over: a save that landed
      // since the check is refused, never taken with the undo.
      if (
        !(
          undo!.versionAfter !== undefined &&
          loaded.version === undo!.versionAfter
        ) &&
        !readsAsLeft(undo!, part)
      )
        fail(UNDO_REFUSALS.changed);
      // Only the entity's own part goes back — a section's item — laid over
      // the form as it reads now.
      const restored = { ...part, ...undo!.before };
      for (const field of undo!.cleared ?? []) delete restored[field];
      if (Array.isArray(restored.tags))
        restored.tags = revivedTags(restored.tags);
      saved(
        await loaded.save(withFormPart(key, loaded.form, restored), {
          expectedUpdatedAt: loaded.version,
          onWrite: finish,
        }),
      );
      return key;
    }
    case 'create':
      // Nobody may have changed it between the check and now.
      await removeEntity(undo!.created, {
        onWrite: finish,
        expectedVersion: ownerBefore,
      });
      return undo!.kind === 'create' && undo!.created.kind === 'project-section'
        ? owner
        : undefined;
    case 'text': {
      const target = textTargetOf(undo!);
      // Checked again on the very read written over.
      const stored = readStoredText(target);
      if (
        (stored.data ? describeHistoryData(stored.data).digest : null) !==
        undo!.afterDigest
      )
        fail(UNDO_REFUSALS.changed);
      const before = undo!.beforeDigest
        ? (findHistoryText(
            {
              ownerType: target.ownerType,
              ownerRef: target.ownerId,
              slot: target.slot,
            },
            undo!.beforeDigest,
          ) ??
          fail(
            'The text it replaced is no longer kept in its history; change it back by hand.',
          ))
        : { blocks: [] };
      await saveText(target, before, {
        expectedVersion: stored.version,
        allowEmpty: textMayBeEmpty(target.slot),
        onWrite: finish,
      });
      return affected;
    }
  }
}

/**
 * Undoes an action holding its entity, as applying it did: an undo never
 * runs beside an apply or another undo of the same entity.
 */
export async function undoActionHeld(
  actionUuid: string,
): Promise<ActionTarget | undefined> {
  const row =
    findAction(actionUuid) ?? fail(`There is no action ${actionUuid}.`);
  const undo = row.undo as StoredUndo | null;
  const key =
    undo?.kind === 'create'
      ? (formOwnerOf(undo.created) ?? undo.created)
      : targetOf(row);
  return withEntityLocks(actionLocks(row, key), () => undoAction(actionUuid));
}
