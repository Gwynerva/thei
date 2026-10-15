import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AiActionState } from '#layers/thei/shared/ai';
import type { EntityKey } from '../../entity-kinds';
import type { ActionRow } from './types';

/**
 * Actions as stored, read by id, by session, by bundle.
 */

export function findAction(
  actionUuid: string,
  tx?: any,
): ActionRow | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  return (tx ?? db)
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

/** The entity an action is about, when it names one. */
export function targetOf(row: Pick<ActionRow, 'targetType' | 'targetId'>) {
  return row.targetType && row.targetId
    ? ({ kind: row.targetType, id: row.targetId } as EntityKey)
    : undefined;
}
