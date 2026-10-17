import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import {
  releaseHistoryHolds,
  touchReleasedAssets,
} from '../../content/history';
import { withEntityLocks } from './lock';
import { findAction } from './rows';
import type { ActionRow } from './types';
import {
  undoLocks,
  undoMayComeBack,
  undoState,
  type StoredUndo,
  type UndoState,
} from './undo';

/**
 * What applied actions hold for their undo — the version of a text each
 * replaced, the files each brought or freed — is let go once the undo can no
 * longer happen, rather than when the session goes: a pinned session never
 * goes, and its actions would hold them for ever. An action whose target is
 * gone, whose undo is final, or whose change moved on for good lets go, and
 * its texts and files live as any other from then on; it stays as it was
 * found, since what an undo would put back may be swept. One that a later
 * undo may still bring back keeps everything.
 */

/** Actions looked at in one read. */
const BATCH = 100;

let running: Promise<number> | undefined;

/**
 * Lets go of what applied actions hold for an undo that can no longer
 * happen; returns how many let go. Only the actions still holding something
 * are read, a batch at a time, and each is decided holding its entity, as
 * an undo would be. A run asked for while one goes on joins it.
 */
export function releaseSettledHolds(now = Date.now()): Promise<number> {
  running ??= releaseAll(now).finally(() => (running = undefined));
  return running;
}

async function releaseAll(now: number): Promise<number> {
  const { db, schema } = THEI_SERVER.useDb();
  const t = schema.aiActions;
  let after = '';
  let released = 0;
  for (;;) {
    const batch = db
      .select({ actionUuid: t.actionUuid })
      .from(t)
      .where(
        and(
          eq(t.state, 'applied'),
          gt(t.actionUuid, after),
          or(
            sql`json_array_length(${t.assetUuids}) > 0`,
            // A text it replaced, held in the history; once let go, the
            // undo says so.
            sql`(json_extract(${t.undo}, '$.kind') = 'text' AND json_extract(${t.undo}, '$.beforeDigest') IS NOT NULL AND json_extract(${t.undo}, '$.released') IS NULL)`,
          ),
        ),
      )
      .orderBy(asc(t.actionUuid))
      .limit(BATCH)
      .all();
    if (!batch.length) return released;
    after = batch.at(-1)!.actionUuid;
    for (const { actionUuid } of batch) {
      try {
        if (await releaseOne(actionUuid, now)) released++;
      } catch (error) {
        THEI_SERVER.console.error(
          `[AI] Letting go of what ${actionUuid} held failed:`,
          error,
        );
      }
    }
  }
}

async function releaseOne(actionUuid: string, now: number): Promise<boolean> {
  const row = findAction(actionUuid);
  if (!row || row.state !== 'applied') return false;
  return withEntityLocks(undoLocks(row), async () => {
    // Read again: it may have been undone while the lock was waited for.
    const current = findAction(actionUuid);
    if (!current || current.state !== 'applied') return false;
    const state = await undoState(current);
    if (state === 'ready' || state === 'undone') return false;
    if (state === 'changed' && (await undoMayComeBack(current))) return false;
    return letGo(current, state, now);
  });
}

/**
 * Lets go of what an action holds, in one transaction: its files, the
 * version of a text it replaced, and its undo marked with how it stood.
 */
function letGo(
  row: ActionRow,
  state: Exclude<UndoState, 'ready' | 'undone'>,
  now: number,
): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  const t = schema.aiActions;
  const undo = row.undo as StoredUndo | null;
  return db.transaction((tx) => {
    const result = tx
      .update(t)
      .set({
        assetUuids: [],
        ...(undo ? { undo: { ...undo, released: { at: now, state } } } : {}),
      })
      .where(and(eq(t.actionUuid, row.actionUuid), eq(t.state, 'applied')))
      .run() as { changes: number };
    if (!result.changes) return false;
    releaseHistoryHolds(tx, schema, [row.actionUuid]);
    // What nothing else holds gets its day of grace from now.
    touchReleasedAssets(tx, schema, row.assetUuids, now);
    return true;
  });
}
