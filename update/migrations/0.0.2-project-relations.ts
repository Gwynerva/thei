import { defineMigration } from './types';

/**
 * Joins the two relation tables into one that is drawn from projects.
 *
 * Until now a project could be related to a project and an event could point
 * at a project, through two tables that agreed on nothing: the project one
 * carried a direction and a per-side note, the event one carried neither. Now
 * a relation is always drawn from a project, the one entity structured enough
 * to gather others, and it can point at a project, an event or a diary entry.
 * Either end reads it as "related", "depends on" or "influences".
 *
 * The new table takes the old project table's name, so that one is moved
 * aside first. A pair of projects is stored once, the smaller ID first, so
 * the same relation cannot be recorded twice from opposite ends. Rows moved
 * here keep their notes and their ordering; event relations, having had no
 * direction, become plain "related".
 *
 * Also converts `entity-relations`, a shape that only ever existed in
 * pre-release builds of this version, keeping every row that has a project at
 * one end.
 */
export default defineMigration({
  id: '0.0.2/006-project-relations',
  version: '0.0.2',
  title: {
    en: 'Relate projects to events and diary entries',
    ru: 'Связи проектов с событиями и записями дневника',
  },
  description: {
    en: 'Merges project and event relations into one table, drawn from projects, so a project can relate to other projects, events and diary entries.',
    ru: 'Объединяет связи проектов и событий в одну таблицу связей проектов: проект может быть связан с другими проектами, событиями и записями дневника.',
  },
  up({ rawDb, log }) {
    const columnsOf = (table: string) =>
      (
        rawDb.prepare(`PRAGMA table_info(\`${table}\`)`).all() as Array<{
          name: string;
        }>
      ).map((column) => column.name);
    const hasTable = (name: string) =>
      Boolean(
        rawDb
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
          )
          .get(name),
      );

    // The 0.0.1 table sits under the name the new one takes.
    const legacyProjectTable = 'project-relations-legacy';
    if (
      hasTable('project-relations') &&
      columnsOf('project-relations').includes('firstProjectUuid')
    ) {
      rawDb
        .prepare(
          `ALTER TABLE \`project-relations\` RENAME TO \`${legacyProjectTable}\``,
        )
        .run();
    }

    rawDb
      .prepare(
        'CREATE TABLE IF NOT EXISTS `project-relations` (' +
          '`projectUuid` text NOT NULL, ' +
          '`entityType` text NOT NULL, ' +
          '`entityId` text NOT NULL, ' +
          '`type` text NOT NULL, ' +
          '`note` text, ' +
          '`projectSortOrder` integer NOT NULL, ' +
          '`entitySortOrder` integer NOT NULL, ' +
          'PRIMARY KEY(`projectUuid`, `entityType`, `entityId`)' +
          ')',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `project-relations-project-idx` ON `project-relations` (`projectUuid`,`projectSortOrder`)',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `project-relations-entity-idx` ON `project-relations` (`entityType`,`entityId`,`entitySortOrder`)',
      )
      .run();

    const insert = rawDb.prepare(
      'INSERT OR IGNORE INTO `project-relations` ' +
        '(`projectUuid`, `entityType`, `entityId`, `type`, `note`, `projectSortOrder`, `entitySortOrder`) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
    );

    /**
     * Writes one relation given as "a first end and a second end", whatever
     * the source called them. `firstInfluencesSecond` and the per-side note
     * texts follow the same order.
     */
    const write = (row: {
      first: { type: string; id: string };
      second: { type: string; id: string };
      type: 'related' | 'first-influences-second' | 'second-influences-first';
      note: SourceNote;
      firstSortOrder: number;
      secondSortOrder: number;
    }) => {
      const firstIsProject = row.first.type === 'project';
      const secondIsProject = row.second.type === 'project';
      if (!firstIsProject && !secondIsProject) return false;
      // The project end is written first; between two projects, the smaller
      // ID is, so a pair has only one way to be stored.
      const firstIsOwner =
        firstIsProject &&
        (!secondIsProject || row.first.id.localeCompare(row.second.id) <= 0);
      const [owner, other] = firstIsOwner
        ? [row.first, row.second]
        : [row.second, row.first];
      const type =
        row.type === 'related'
          ? 'related'
          : (row.type === 'first-influences-second') === firstIsOwner
            ? 'project-influences-entity'
            : 'entity-influences-project';
      insert.run(
        owner.id,
        other.type,
        other.id,
        type,
        storedNote(row.note, firstIsOwner),
        firstIsOwner ? row.firstSortOrder : row.secondSortOrder,
        firstIsOwner ? row.secondSortOrder : row.firstSortOrder,
      );
      return true;
    };

    let moved = 0;
    let dropped = 0;

    if (hasTable(legacyProjectTable)) {
      const rows = rawDb
        .prepare(`SELECT * FROM \`${legacyProjectTable}\``)
        .all() as Array<{
        firstProjectUuid: string;
        secondProjectUuid: string;
        type: 'related' | 'first-influences-second' | 'second-influences-first';
        note: string | null;
        firstSortOrder: number;
        secondSortOrder: number;
      }>;
      for (const row of rows) {
        write({
          first: { type: 'project', id: row.firstProjectUuid },
          second: { type: 'project', id: row.secondProjectUuid },
          type: row.type,
          note: parseNote(row.note, 'firstProjectText', 'secondProjectText'),
          firstSortOrder: row.firstSortOrder,
          secondSortOrder: row.secondSortOrder,
        });
        moved++;
      }
      rawDb.prepare(`DROP TABLE \`${legacyProjectTable}\``).run();
    }

    if (hasTable('event-project-relations')) {
      const rows = rawDb
        .prepare('SELECT * FROM `event-project-relations`')
        .all() as Array<{
        eventUuid: string;
        projectUuid: string;
        note: string | null;
        sortOrder: number;
      }>;
      // The project side had no ordering of its own, so one is assigned as the
      // rows are read, after whatever the project already lists; the event
      // side keeps the order it had.
      const projectOrder = new Map<string, number>();
      const nextProjectOrder = (projectUuid: string) => {
        const next =
          projectOrder.get(projectUuid) ??
          ((
            rawDb
              .prepare(
                'SELECT MAX(`projectSortOrder`) AS `max` FROM `project-relations` WHERE `projectUuid` = ?',
              )
              .get(projectUuid) as { max: number | null }
          ).max ?? -1) + 1;
        projectOrder.set(projectUuid, next + 1);
        return next;
      };
      for (const row of rows) {
        write({
          first: { type: 'project', id: row.projectUuid },
          second: { type: 'event', id: row.eventUuid },
          type: 'related',
          note: row.note ? { type: 'shared', text: row.note } : null,
          firstSortOrder: nextProjectOrder(row.projectUuid),
          secondSortOrder: row.sortOrder,
        });
        moved++;
      }
      rawDb.prepare('DROP TABLE `event-project-relations`').run();
    }

    if (hasTable('entity-relations')) {
      const rows = rawDb
        .prepare('SELECT * FROM `entity-relations`')
        .all() as Array<{
        firstType: string;
        firstId: string;
        secondType: string;
        secondId: string;
        type: 'related' | 'first-influences-second' | 'second-influences-first';
        note: string | null;
        firstSortOrder: number;
        secondSortOrder: number;
      }>;
      for (const row of rows) {
        const kept = write({
          first: { type: row.firstType, id: row.firstId },
          second: { type: row.secondType, id: row.secondId },
          type: row.type,
          note: parseNote(row.note, 'firstText', 'secondText'),
          firstSortOrder: row.firstSortOrder,
          secondSortOrder: row.secondSortOrder,
        });
        if (kept) moved++;
        else dropped++;
      }
      rawDb.prepare('DROP TABLE `entity-relations`').run();
    }

    log(`Moved ${moved} relations.`);
    if (dropped)
      log(`Dropped ${dropped} relations that did not involve a project.`);
  },
});

/** A note in first/second terms, whatever the source table called them. */
type SourceNote =
  | { type: 'shared'; text?: string }
  | { type: 'split'; firstText?: string; secondText?: string }
  | null;

function parseNote(
  note: string | null,
  firstKey: string,
  secondKey: string,
): SourceNote {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note) as Record<string, unknown>;
    if (parsed?.type === 'shared')
      return {
        type: 'shared',
        text: typeof parsed.text === 'string' ? parsed.text : undefined,
      };
    if (parsed?.type === 'split')
      return {
        type: 'split',
        firstText:
          typeof parsed[firstKey] === 'string'
            ? (parsed[firstKey] as string)
            : undefined,
        secondText:
          typeof parsed[secondKey] === 'string'
            ? (parsed[secondKey] as string)
            : undefined,
      };
    return null;
  } catch {
    return null;
  }
}

/** The note as the new table keeps it: per side, the project's side first. */
function storedNote(note: SourceNote, firstIsProject: boolean): string | null {
  if (!note) return null;
  if (note.type === 'shared') return JSON.stringify(note);
  return JSON.stringify({
    type: 'split',
    projectText: firstIsProject ? note.firstText : note.secondText,
    entityText: firstIsProject ? note.secondText : note.firstText,
  });
}
