import { and, asc, eq } from 'drizzle-orm';
import { contentPlainText } from '#layers/thei/shared/content';
import type { Period } from '#layers/thei/shared/period';
import {
  isRelationEntityType,
  RELATION_WORD_OF_TYPE,
  type RelationWord,
} from '#layers/thei/shared/relation';
import { readPeriods } from '../../periods';
import { readRelationRows } from '../../relations';
import { readStoredText } from '../../entity-patch/text';
import {
  entityRow,
  entityText,
  refOf,
  type EntityKey,
} from '../../entity-kinds';

export function currentField(key: EntityKey, field: string): unknown {
  return entityRow(key)?.[field];
}

export function currentPeriods(key: EntityKey): Period[] {
  if (key.kind !== 'event' && key.kind !== 'project-section') return [];
  const { db, schema } = THEI_SERVER.useDb();
  return readPeriods(db, schema, key.kind, key.id);
}

export function currentTags(key: EntityKey): { ref: string; title: string }[] {
  if (key.kind !== 'project' && key.kind !== 'event') return [];
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ id: schema.tags.tagUuid, title: schema.tags.title })
    .from(schema.tagUsages)
    .innerJoin(schema.tags, eq(schema.tags.tagUuid, schema.tagUsages.tagUuid))
    .where(
      and(
        eq(schema.tagUsages.containerType, key.kind),
        eq(schema.tagUsages.containerId, key.id),
      ),
    )
    .orderBy(asc(schema.tagUsages.sortOrder))
    .all()
    .map((tag) => ({
      ref: refOf({ kind: 'tag', id: tag.id }),
      title: tag.title,
    }));
}

/** The relation between two entities as read from the first, if any. */
export function currentRelation(
  key: EntityKey,
  other: EntityKey,
): RelationWord | undefined {
  if (!isRelationEntityType(key.kind) || !isRelationEntityType(other.kind))
    return undefined;
  const row = readRelationRows({ type: key.kind, id: key.id }).find(
    (item) => item.other.type === other.kind && item.other.id === other.id,
  );
  return row && RELATION_WORD_OF_TYPE[row.type];
}

export function notesSlotOf(key: EntityKey) {
  return entityText(key.kind, 'notes');
}

export function currentNotesText(key: EntityKey): string {
  const notes = notesSlotOf(key);
  if (!notes) return '';
  return contentPlainText(
    readStoredText({
      ownerType: key.kind as never,
      ownerId: key.id,
      slot: notes.slot,
    }).data,
  );
}

export function currentText(key: EntityKey, name: string) {
  const text = entityText(key.kind, name);
  if (!text) return undefined;
  return readStoredText({
    ownerType: key.kind as never,
    ownerId: key.id,
    slot: text.slot,
  });
}
