import { and, eq, inArray } from 'drizzle-orm';
import type { AiRevisePart } from '#layers/thei/shared/ai-actions';
import { touchReleasedAssets } from '../../content/history';
import { refuse as fail } from '../../entity-patch/text';
import { findEntity, refOf, type EntityKey } from '../../entity-kinds';
import { addNever, isMemoryKind, type MemoryAnchor } from '../memory/store';
import { publishActions } from '../sessions/bus';
import { refreshSessionCounts } from '../sessions/store';
import { settleActions } from './apply';
import { correctionFingerprint, relinkFingerprint } from './declined';
import { actionDef } from './registry';
import { entityTargetOf, findActions, targetOf } from './rows';
import { isFileKey } from './target';
import type { ActionRow, PartStateRow } from './types';

/**
 * The owner's word on actions other than applying them: declined, brought
 * back, or never to be offered again. A declined action is remembered while
 * its session lives; «never» is a memory record anchored to what the action
 * was about, read only with it, kept until the owner lets it go.
 */

/** Parts still waiting become kept as written. */
function partsKept(row: ActionRow): PartStateRow[] | null {
  if (!row.parts) return null;
  return (row.parts as PartStateRow[]).map((part) =>
    part.state === 'pending' || part.state === 'accepted'
      ? { id: part.id, state: 'kept' }
      : part,
  );
}

/** Where a «never» of this action is anchored. */
function neverAnchor(row: ActionRow): MemoryAnchor {
  const found = targetOf(row);
  // A «never» about a file is anchored to the file as to an entity, and
  // forgotten with it.
  const target = isFileKey(found) ? (found as unknown as EntityKey) : found;
  const payload = row.payload as {
    kind: string;
    other?: string;
    entity?: string;
  };
  if (payload.kind === 'relation' && target && payload.other) {
    const other = findEntity(payload.other);
    if (other) return { anchor: 'pair', entity: target, other };
  }
  if (payload.kind === 'create' && !target && isMemoryKind(payload.entity))
    return { anchor: 'kind', kind: payload.entity };
  if (target) return { anchor: 'entity', entity: target };
  return { anchor: 'owner' };
}

function insertNever(
  tx: any,
  row: ActionRow,
  fingerprint: string,
  text: string,
  now: number,
) {
  addNever(
    tx,
    neverAnchor(row),
    { fingerprint, text, sessionUuid: row.sessionUuid },
    now,
  );
}

/**
 * Declines actions still waiting. A text edit some parts of which were
 * applied stays applied, its other parts kept as written. With `never`, the
 * same is never offered again.
 */
export function rejectActions(
  actionUuids: string[],
  options: { never?: boolean; now?: number } = {},
): ActionRow[] {
  const now = options.now ?? Date.now();
  const rows = findActions(actionUuids);
  const waiting = rows.filter((row) => row.state === 'pending');
  if (!waiting.length) fail('None of those waits for a decision.');
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    for (const row of waiting) {
      const parts = partsKept(row);
      const someApplied = Boolean(
        parts?.some((part) => part.state === 'applied'),
      );
      tx.update(schema.aiActions)
        .set({
          state: someApplied ? 'applied' : 'rejected',
          parts,
          decidedAt: now,
        })
        .where(
          and(
            eq(schema.aiActions.actionUuid, row.actionUuid),
            eq(schema.aiActions.state, 'pending'),
          ),
        )
        .run();
      if (options.never && !someApplied)
        insertNever(
          tx,
          row,
          row.fingerprint,
          actionDef(row.kind).summary((row.proposed ?? row.payload) as never),
          now,
        );
    }
    // Declined, they need their files no more: those get their grace now.
    touchReleasedAssets(
      tx,
      schema,
      waiting.flatMap((row) => row.assetUuids),
      now,
    );
    for (const sessionUuid of new Set(waiting.map((row) => row.sessionUuid)))
      refreshSessionCounts(tx, schema, sessionUuid);
  });
  publishActions(waiting);
  return findActions(waiting.map((row) => row.actionUuid));
}

/**
 * Says never to offer an action again, declined already or not: the owner
 * may decide so after the fact, from the declined row.
 */
export function neverAgain(actionUuid: string, now = Date.now()) {
  const row =
    findActions([actionUuid])[0] ?? fail(`There is no action ${actionUuid}.`);
  if (row.state === 'pending') {
    rejectActions([actionUuid], { never: true, now });
    return;
  }
  if (row.state !== 'rejected') fail(`It is ${row.state}: nothing to decline.`);
  const { db } = THEI_SERVER.useDb();
  db.transaction((tx) =>
    insertNever(
      tx,
      row,
      row.fingerprint,
      actionDef(row.kind).summary((row.proposed ?? row.payload) as never),
      now,
    ),
  );
  // Its card says «never» now, on whatever page shows it.
  publishActions([row]);
}

/** Never to offer one correction of a text edit again: the word stays as written. */
export function neverPart(
  actionUuid: string,
  partId: string,
  now = Date.now(),
) {
  const row =
    findActions([actionUuid])[0] ?? fail(`There is no action ${actionUuid}.`);
  const target = entityTargetOf(row) ?? fail('It is about no entity.');
  const payload = row.payload as {
    kind: string;
    text?: string;
    parts?: AiRevisePart[];
  };
  const part = payload.parts?.find((item) => item.id === partId);
  if (
    payload.kind !== 'revise' ||
    (part?.type !== 'correction' && part?.type !== 'relink')
  )
    fail('Only a correction of a word or a link is kept as it is for good.');
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    insertNever(
      tx,
      row,
      part.type === 'correction'
        ? correctionFingerprint(target, payload.text!, part)
        : relinkFingerprint(target, payload.text!, part, part.to),
      part.type === 'correction'
        ? `"${part.find}" stays as written in ${refOf(target)}, not "${part.replace}"`
        : `The link "${part.words}" in ${refOf(target)} stays leading to ${part.from}, not ${part.to ?? 'no link'}`,
      now,
    );
    if (row.state === 'pending' && row.parts) {
      const parts = (row.parts as PartStateRow[]).map((item) =>
        item.id === partId && item.state !== 'applied'
          ? { id: item.id, state: 'kept' as const }
          : item,
      );
      tx.update(schema.aiActions)
        .set({ parts })
        .where(eq(schema.aiActions.actionUuid, actionUuid))
        .run();
    }
    refreshSessionCounts(tx, schema, row.sessionUuid);
  });
  publishActions([row]);
}

/**
 * Brings back declined or undone actions: they wait again, unless the
 * archive has moved on since and they no longer stand. An undone one starts
 * afresh, as if never applied. A «never» said of a declined one is taken
 * back with it: brought back to be decided, it may be offered again.
 */
export async function restoreActions(
  actionUuids: string[],
): Promise<ActionRow[]> {
  const rows = findActions(actionUuids).filter(
    (row) => row.state === 'rejected' || row.state === 'undone',
  );
  if (!rows.length) fail('None of those was declined or undone.');
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    tx.update(schema.aiActions)
      .set({
        state: 'pending',
        decidedAt: null,
        undo: null,
        appliedBy: null,
        error: null,
      })
      .where(
        and(
          inArray(
            schema.aiActions.actionUuid,
            rows.map((row) => row.actionUuid),
          ),
          inArray(schema.aiActions.state, ['rejected', 'undone']),
        ),
      )
      .run();
    const banned = rows
      .filter((row) => row.state === 'rejected')
      .map((row) => row.fingerprint);
    if (banned.length)
      tx.delete(schema.aiMemory)
        .where(
          and(
            eq(schema.aiMemory.type, 'never'),
            inArray(schema.aiMemory.fingerprint, banned),
          ),
        )
        .run();
    // Parts kept or applied before wait again too.
    for (const row of rows)
      if (row.parts)
        tx.update(schema.aiActions)
          .set({
            parts: (row.parts as PartStateRow[]).map((part) =>
              part.state === 'kept' ||
              (row.state === 'undone' && part.state === 'applied')
                ? { id: part.id, state: 'pending' }
                : part,
            ),
          })
          .where(eq(schema.aiActions.actionUuid, row.actionUuid))
          .run();
    for (const sessionUuid of new Set(rows.map((row) => row.sessionUuid)))
      refreshSessionCounts(tx, schema, sessionUuid);
  });
  publishActions(rows);
  return settleActions(findActions(rows.map((row) => row.actionUuid)));
}
