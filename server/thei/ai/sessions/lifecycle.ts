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
 * waiting in it, it goes to the archive; a month in the archive, it is
 * purged unless pinned: what was said and proposed goes — the versions of
 * texts and the files its actions held are let go — while its title, its
 * summary and the entities it concerned stay.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_QUIET_MS = 7 * DAY_MS;
export const SESSION_ARCHIVE_MS = 30 * DAY_MS;

/** Archives sessions closed or quiet for a week; returns how many. */
export function archiveQuietSessions(now = Date.now()): number {
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiSessions;
  return db
    .update(table)
    .set({ archivedAt: now })
    .where(
      and(
        isNull(table.archivedAt),
        isNull(table.purgedAt),
        eq(table.pinned, false),
        eq(table.waiting, 0),
        eq(table.state, 'idle'),
        or(
          isNotNull(table.closedAt),
          lt(table.lastActiveAt, now - SESSION_QUIET_MS),
        ),
      ),
    )
    .run().changes;
}

/**
 * Drops what was said and proposed in sessions, inside `tx`, letting go of
 * what their actions held — the versions of texts kept for an undo, and the
 * files they brought or freed — of the files brought into them, and of what
 * a check's run in them was given.
 */
function dropContents(
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
        isNull(table.purgedAt),
        eq(table.pinned, false),
        isNotNull(table.archivedAt),
        lt(table.archivedAt, now - SESSION_ARCHIVE_MS),
      ),
    )
    .all()
    .map((row) => row.sessionUuid);
  if (!due.length) return 0;
  db.transaction((tx) => {
    dropContents(tx, schema, due, now);
    tx.update(table)
      .set({ purgedAt: now, state: 'closed', waiting: 0 })
      .where(inArray(table.sessionUuid, due))
      .run();
  });
  return due.length;
}

/** Deletes a session at the owner's word, with everything of it. */
export function deleteSession(sessionUuid: string, now = Date.now()) {
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    dropContents(tx, schema, [sessionUuid], now);
    tx.delete(schema.aiSessionEntities)
      .where(eq(schema.aiSessionEntities.sessionUuid, sessionUuid))
      .run();
    tx.delete(schema.aiSessions)
      .where(eq(schema.aiSessions.sessionUuid, sessionUuid))
      .run();
  });
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
