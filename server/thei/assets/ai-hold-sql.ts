import { sql } from 'drizzle-orm';

/**
 * Which AI actions still need their files: one waiting for the owner, being
 * applied, or applied and undoable. Kept apart from `holds.ts`, so the
 * history of texts can ask it without a cycle.
 */
export const AI_HOLDING_STATES = `'pending', 'applying', 'applied'`;

/** SQL for "some AI action still needs this asset". */
export function assetHeldByAiSql(assetUuidColumn: unknown) {
  return sql`EXISTS (SELECT 1 FROM "ai-actions" a, json_each(a.assetUuids) j WHERE j.value = ${assetUuidColumn} AND a.state IN (${sql.raw(AI_HOLDING_STATES)}))`;
}
