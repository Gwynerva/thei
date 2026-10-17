import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import {
  releaseHistoryHolds,
  touchReleasedAssets,
} from '../../content/history';
import { dropBatches } from '../templates/coverage';
import { publishSession } from './bus';
import { releaseSessionFiles } from './files';

/**
 * How long a session lives. Closed, or quiet for a week with nothing
 * waiting in it, it goes to the archive — and quiet for a month, whatever
 * waits in it: what nobody took up in a month waits for nobody, and goes
 * back with the session if the owner brings it back. A month in the
 * archive, it is purged unless pinned: deleted whole, as the owner deletes
 * one — what was said and proposed goes, the versions of texts and the
 * files its actions held are let go, and so are the entities it concerned.
 * What its actions applied stays applied.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_QUIET_MS = 7 * DAY_MS;
/** Quiet this long, a session goes to the archive even with things waiting. */
export const SESSION_LEFT_MS = 30 * DAY_MS;
export const SESSION_ARCHIVE_MS = 30 * DAY_MS;

/**
 * Archives sessions closed or quiet for a week with nothing waiting, and
 * those quiet for a month whatever waits; returns how many.
 */
export function archiveQuietSessions(now = Date.now()): number {
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiSessions;
  return db
    .update(table)
    .set({ archivedAt: now })
    .where(
      and(
        isNull(table.archivedAt),
        eq(table.pinned, false),
        eq(table.state, 'idle'),
        or(
          lt(table.lastActiveAt, now - SESSION_LEFT_MS),
          and(
            eq(table.waiting, 0),
            or(
              isNotNull(table.closedAt),
              lt(table.lastActiveAt, now - SESSION_QUIET_MS),
            ),
          ),
        ),
      ),
    )
    .run().changes;
}

/**
 * Deletes sessions whole, inside `tx`: what was said and proposed in them
 * and the entities they concerned, letting go of what their actions held —
 * the versions of texts kept for an undo, and the files they brought or
 * freed — of the files brought into them, and of what a check's run in
 * them was given.
 */
function deleteSessions(
  tx: any,
  schema: any,
  sessionUuids: string[],
  now: number,
) {
  if (!sessionUuids.length) return;
  const actions = tx
    .select({
      actionUuid: schema.aiActions.actionUuid,
      assetUuids: schema.aiActions.assetUuids,
    })
    .from(schema.aiActions)
    .where(inArray(schema.aiActions.sessionUuid, sessionUuids))
    .all() as { actionUuid: string; assetUuids: string[] }[];
  releaseHistoryHolds(
    tx,
    schema,
    actions.map((action) => action.actionUuid),
  );
  tx.delete(schema.aiActions)
    .where(inArray(schema.aiActions.sessionUuid, sessionUuids))
    .run();
  tx.delete(schema.aiMessages)
    .where(inArray(schema.aiMessages.sessionUuid, sessionUuids))
    .run();
  touchReleasedAssets(
    tx,
    schema,
    actions.flatMap((action) => action.assetUuids),
    now,
  );
  releaseSessionFiles(tx, schema, sessionUuids, now);
  dropBatches(tx, schema, sessionUuids);
  tx.delete(schema.aiSessionEntities)
    .where(inArray(schema.aiSessionEntities.sessionUuid, sessionUuids))
    .run();
  tx.delete(schema.aiSessions)
    .where(inArray(schema.aiSessions.sessionUuid, sessionUuids))
    .run();
}

/** Purges sessions a month in the archive, the pinned ones aside. */
export function purgeArchivedSessions(now = Date.now()): number {
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiSessions;
  const due = db
    .select({ sessionUuid: table.sessionUuid })
    .from(table)
    .where(
      and(
        eq(table.pinned, false),
        isNotNull(table.archivedAt),
        lt(table.archivedAt, now - SESSION_ARCHIVE_MS),
      ),
    )
    .all()
    .map((row) => row.sessionUuid);
  if (!due.length) return 0;
  db.transaction((tx) => deleteSessions(tx, schema, due, now));
  for (const sessionUuid of due)
    publishSession(sessionUuid, { type: 'session' });
  return due.length;
}

/** Deletes a session at the owner's word, with everything of it. */
export function deleteSession(sessionUuid: string, now = Date.now()) {
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => deleteSessions(tx, schema, [sessionUuid], now));
  publishSession(sessionUuid, { type: 'session' });
}

/** Archives and purges sessions as their time comes: called every hour. */
export function maintainAiSessions(now = Date.now()) {
  try {
    archiveQuietSessions(now);
    purgeArchivedSessions(now);
  } catch (error) {
    THEI_SERVER.console.error('[AI] Keeping sessions failed:', error);
  }
}
