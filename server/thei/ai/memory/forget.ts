import { and, eq, inArray, or } from 'drizzle-orm';
import { forgetCoverage } from '../templates/coverage';

/**
 * What the AI kept about entities that are deleted, deleted with them in the
 * same transaction: the memory anchored to them, alone or with another, the
 * model's digest of them, what the checks looked at of them, and the
 * sessions' links to them. Every place that deletes an entity calls this
 * beside deleting its texts.
 */
export function forgetAiAnchors(
  tx: any,
  schema: any,
  type: string,
  ids: string[],
) {
  if (!ids.length) return;
  const memory = schema.aiMemory;
  tx.delete(memory)
    .where(
      or(
        and(
          inArray(memory.anchor, ['entity', 'pair']),
          eq(memory.anchorType, type),
          inArray(memory.anchorId, ids),
        ),
        and(
          eq(memory.anchor, 'pair'),
          eq(memory.otherType, type),
          inArray(memory.otherId, ids),
        ),
      ),
    )
    .run();
  // A file has no digest, and what a check looked at of it is its family's.
  if (type !== 'asset') {
    tx.delete(schema.aiDigests)
      .where(
        and(
          eq(schema.aiDigests.entityType, type),
          inArray(schema.aiDigests.entityId, ids),
        ),
      )
      .run();
    forgetCoverage(tx, schema, type, ids);
  }
  tx.delete(schema.aiSessionEntities)
    .where(
      and(
        eq(schema.aiSessionEntities.entityType, type),
        inArray(schema.aiSessionEntities.entityId, ids),
      ),
    )
    .run();
}
