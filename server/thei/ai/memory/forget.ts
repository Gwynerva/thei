import { and, eq, inArray, or } from 'drizzle-orm';

/**
 * What the AI kept about entities that are deleted, deleted with them in the
 * same transaction: the memory anchored to them, alone or with another, the
 * model's digest of them, what templates last read of them, and the
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
  for (const table of [schema.aiDigests, schema.aiTemplateMarks])
    tx.delete(table)
      .where(and(eq(table.entityType, type), inArray(table.entityId, ids)))
      .run();
  tx.delete(schema.aiSessionEntities)
    .where(
      and(
        eq(schema.aiSessionEntities.entityType, type),
        inArray(schema.aiSessionEntities.entityId, ids),
      ),
    )
    .run();
}
