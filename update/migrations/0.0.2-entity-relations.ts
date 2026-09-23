import { defineMigration } from './types';

/**
 * Joins the two relation tables into one that relates entities, not projects.
 *
 * Until now a project could be related to a project and an event could point
 * at a project, through two tables that agreed on nothing: the project one
 * carried a direction and a per-side note, the event one carried neither. One
 * table means an event's relations are as expressive as a project's, and the
 * "related / depends on / influences" reading works from either end.
 *
 * A pair is stored once, in a canonical order, so the same relation cannot be
 * recorded twice from opposite ends. Rows moved here keep their notes and
 * their ordering; event relations, having had no direction, become plain
 * "related".
 */
export default defineMigration({
  id: '0.0.2/006-entity-relations',
  version: '0.0.2',
  title: {
    en: 'Relate entities, not only projects',
    ru: 'Связи между сущностями, а не только проектами',
  },
  description: {
    en: 'Merges project and event relations into one table so events can carry the same kinds of relation projects do.',
    ru: 'Объединяет связи проектов и событий в одну таблицу, чтобы у событий были те же виды связей, что и у проектов.',
  },
  up({ rawDb, log }) {
    rawDb
      .prepare(
        'CREATE TABLE IF NOT EXISTS `entity-relations` (' +
          '`firstType` text NOT NULL, ' +
          '`firstId` text NOT NULL, ' +
          '`secondType` text NOT NULL, ' +
          '`secondId` text NOT NULL, ' +
          '`type` text NOT NULL, ' +
          '`note` text, ' +
          '`firstSortOrder` integer NOT NULL, ' +
          '`secondSortOrder` integer NOT NULL, ' +
          'PRIMARY KEY(`firstType`, `firstId`, `secondType`, `secondId`)' +
          ')',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `entity-relations-first-idx` ON `entity-relations` (`firstType`,`firstId`,`firstSortOrder`)',
      )
      .run();
    rawDb
      .prepare(
        'CREATE INDEX IF NOT EXISTS `entity-relations-second-idx` ON `entity-relations` (`secondType`,`secondId`,`secondSortOrder`)',
      )
      .run();

    const hasTable = (name: string) =>
      Boolean(
        rawDb
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
          )
          .get(name),
      );

    const insert = rawDb.prepare(
      'INSERT OR IGNORE INTO `entity-relations` ' +
        '(`firstType`, `firstId`, `secondType`, `secondId`, `type`, `note`, `firstSortOrder`, `secondSortOrder`) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );

    /**
     * The canonical order of a pair: the same two ends always land the same
     * way round, whichever side the caller came from.
     */
    const ordered = (
      aType: string,
      aId: string,
      bType: string,
      bId: string,
    ): [string, string, string, string, boolean] =>
      `${aType}:${aId}`.localeCompare(`${bType}:${bId}`) < 0
        ? [aType, aId, bType, bId, true]
        : [bType, bId, aType, aId, false];

    let moved = 0;

    if (hasTable('project-relations')) {
      const rows = rawDb
        .prepare('SELECT * FROM `project-relations`')
        .all() as Array<{
        firstProjectUuid: string;
        secondProjectUuid: string;
        type: string;
        note: string | null;
        firstSortOrder: number;
        secondSortOrder: number;
      }>;
      for (const row of rows) {
        // Already canonical among projects, and both ends are projects, so the
        // direction and the per-side notes carry over untouched.
        insert.run(
          'project',
          row.firstProjectUuid,
          'project',
          row.secondProjectUuid,
          row.type,
          renameNoteKeys(row.note),
          row.firstSortOrder,
          row.secondSortOrder,
        );
        moved++;
      }
      rawDb.prepare('DROP TABLE `project-relations`').run();
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
      // rows are read; the event side keeps the order it had.
      const projectOrder = new Map<string, number>();
      for (const row of rows) {
        const [firstType, firstId, secondType, secondId, eventIsFirst] =
          ordered('event', row.eventUuid, 'project', row.projectUuid);
        const nextProjectOrder = projectOrder.get(row.projectUuid) ?? 0;
        projectOrder.set(row.projectUuid, nextProjectOrder + 1);
        const note = row.note
          ? JSON.stringify({ type: 'shared', text: row.note })
          : null;
        insert.run(
          firstType,
          firstId,
          secondType,
          secondId,
          'related',
          note,
          eventIsFirst ? row.sortOrder : nextProjectOrder,
          eventIsFirst ? nextProjectOrder : row.sortOrder,
        );
        moved++;
      }
      rawDb.prepare('DROP TABLE `event-project-relations`').run();
    }

    log(`Moved ${moved} relations.`);
  },
});

/**
 * The per-side note keys lose their "project" wording, since a side may now be
 * an event. The shape is otherwise unchanged.
 */
function renameNoteKeys(note: string | null): string | null {
  if (!note) return null;
  try {
    const parsed = JSON.parse(note) as Record<string, unknown>;
    if (parsed?.type !== 'split') return note;
    return JSON.stringify({
      type: 'split',
      firstText: parsed.firstProjectText,
      secondText: parsed.secondProjectText,
    });
  } catch {
    return null;
  }
}
