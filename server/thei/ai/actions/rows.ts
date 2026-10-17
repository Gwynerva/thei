import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { AiActionState } from '#layers/thei/shared/ai';
import type { EntityKey } from '../../entity-kinds';
import type { ActionTarget } from './target';
import type { ActionRow } from './types';

/**
 * Actions as stored, read by id, by session, by bundle.
 */

export function findAction(actionUuid: string): ActionRow | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiActions)
    .where(eq(schema.aiActions.actionUuid, actionUuid))
    .get() as ActionRow | undefined;
}

export function findActions(actionUuids: string[]): ActionRow[] {
  if (!actionUuids.length) return [];
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.aiActions)
    .where(inArray(schema.aiActions.actionUuid, actionUuids))
    .all() as ActionRow[];
  const order = new Map(actionUuids.map((id, index) => [id, index]));
  return rows.sort(
    (a, b) => order.get(a.actionUuid)! - order.get(b.actionUuid)!,
  );
}

export function sessionActions(sessionUuid: string): ActionRow[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiActions)
    .where(eq(schema.aiActions.sessionUuid, sessionUuid))
    .orderBy(asc(schema.aiActions.createdAt), asc(schema.aiActions.bundleOrder))
    .all() as ActionRow[];
}

/**
 * Whether any of these actions is in a session in the archive: only read
 * until the owner brings it back, nothing is decided in it.
 */
export function inArchivedSession(rows: Pick<ActionRow, 'sessionUuid'>[]) {
  const sessions = [...new Set(rows.map((row) => row.sessionUuid))];
  if (!sessions.length) return false;
  const { db, schema } = THEI_SERVER.useDb();
  return Boolean(
    db
      .select({ sessionUuid: schema.aiSessions.sessionUuid })
      .from(schema.aiSessions)
      .where(
        and(
          inArray(schema.aiSessions.sessionUuid, sessions),
          isNotNull(schema.aiSessions.archivedAt),
        ),
      )
      .get(),
  );
}

/** Actions about an entity, in these states. */
export function actionsAbout(
  key: Pick<EntityKey, 'kind' | 'id'>,
  states: AiActionState[],
): ActionRow[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiActions)
    .where(
      and(
        eq(schema.aiActions.targetType, key.kind as never),
        eq(schema.aiActions.targetId, key.id),
        inArray(schema.aiActions.state, states),
      ),
    )
    .orderBy(asc(schema.aiActions.createdAt))
    .all() as ActionRow[];
}

/** The entity or the file an action is about, when it names one. */
export function targetOf(
  row: Pick<ActionRow, 'targetType' | 'targetId'>,
): ActionTarget | undefined {
  return row.targetType && row.targetId
    ? ({ kind: row.targetType, id: row.targetId } as ActionTarget)
    : undefined;
}

/** The entity an action is about, for the kinds that are about one. */
export function entityTargetOf(
  row: Pick<ActionRow, 'targetType' | 'targetId'>,
): EntityKey | undefined {
  const key = targetOf(row);
  return key && key.kind !== 'asset' ? key : undefined;
}
