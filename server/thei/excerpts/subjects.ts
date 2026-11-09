import { and, eq, inArray, or } from 'drizzle-orm';
import type { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { RelationTargetType } from '#layers/thei/shared/relation';

/**
 * What an excerpt is about, as its visibility is judged by: the entity and
 * how open it is now. Read with the excerpt, never stored on it, so an
 * excerpt opens and closes with what it is about.
 */
export type ExcerptSubject = {
  type: RelationTargetType;
  id: string;
  access: ProjectEventAccessLevel;
};

/** What each of some excerpts is about, by the excerpt's uuid; nothing for one about nothing. */
export function readExcerptSubjects(
  db: any,
  schema: any,
  excerptUuids: readonly string[],
): Map<string, ExcerptSubject> {
  const subjects = new Map<string, ExcerptSubject>();
  if (!excerptUuids.length) return subjects;
  const rows = db
    .select()
    .from(schema.entityRelations)
    .where(
      or(
        and(
          eq(schema.entityRelations.firstType, 'excerpt'),
          inArray(schema.entityRelations.firstId, [...excerptUuids]),
        ),
        and(
          eq(schema.entityRelations.secondType, 'excerpt'),
          inArray(schema.entityRelations.secondId, [...excerptUuids]),
        ),
      ),
    )
    .all();
  const ends = rows.map((row: any) =>
    row.firstType === 'excerpt'
      ? { excerptUuid: row.firstId, type: row.secondType, id: row.secondId }
      : { excerptUuid: row.secondId, type: row.firstType, id: row.firstId },
  ) as { excerptUuid: string; type: RelationTargetType; id: string }[];
  const idsOf = (type: RelationTargetType) =>
    ends.filter((end) => end.type === type).map((end) => end.id);
  const access = new Map<string, ProjectEventAccessLevel>();
  const read = (
    type: RelationTargetType,
    table: any,
    idColumn: any,
    accessColumn: any,
  ) => {
    const ids = idsOf(type);
    if (!ids.length) return;
    for (const row of db
      .select({ id: idColumn, access: accessColumn })
      .from(table)
      .where(inArray(idColumn, ids))
      .all())
      access.set(`${type}:${row.id}`, row.access);
  };
  read(
    'project',
    schema.projects,
    schema.projects.projectUuid,
    schema.projects.access,
  );
  read('event', schema.events, schema.events.eventUuid, schema.events.access);
  read(
    'diary-entry',
    schema.diaryEntries,
    schema.diaryEntries.diaryUuid,
    schema.diaryEntries.access,
  );
  for (const end of ends) {
    const level = access.get(`${end.type}:${end.id}`);
    // One at most (`normalizeExcerptAbout`); a row whose other end is gone is no subject.
    if (level && !subjects.has(end.excerptUuid))
      subjects.set(end.excerptUuid, {
        type: end.type,
        id: end.id,
        access: level,
      });
  }
  return subjects;
}
