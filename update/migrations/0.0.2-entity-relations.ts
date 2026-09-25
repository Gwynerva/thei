import { defineMigration } from './types';

/**
 * Joins the two relation tables of 0.0.1 into one between any two entities.
 *
 * Until now a project could be related to a project and an event could point
 * at a project, through two tables that agreed on nothing: the project one
 * carried a direction and a per-side note, the event one carried neither. Now
 * a relation joins any two of a project, an event and a diary entry, either
 * end edits it, and either end reads it as "related", "depends on" or
 * "affects".
 *
 * A pair is stored once, in a canonical order — the smaller `type:id` key
 * first — so the same relation cannot be recorded twice from opposite ends.
 * Rows moved here keep their notes and their ordering; event relations,
 * having had no direction, become plain "related".
 */
export default defineMigration({
  id: '0.0.2/006-relations',
  version: '0.0.2',
  title: {
    en: 'Relate projects, events and diary entries to each other',
    ru: 'Связи между проектами, событиями и записями дневника',
  },
  description: {
    en: 'Merges project and event relations into one table of relations between any two entities, so a project, an event or a diary entry can relate to any of the three.',
    ru: 'Объединяет связи проектов и событий в одну таблицу связей между любыми двумя сущностями: проект, событие и запись дневника могут быть связаны с любой из трёх.',
  },
  up({ rawDb, log }) {
    const hasTable = (name: string) =>
      Boolean(
        rawDb
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
          )
          .get(name),
      );

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

    const insert = rawDb.prepare(
      'INSERT OR IGNORE INTO `entity-relations` ' +
        '(`firstType`, `firstId`, `secondType`, `secondId`, `type`, `note`, `firstSortOrder`, `secondSortOrder`) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const keyOf = (endpoint: Endpoint) => `${endpoint.type}:${endpoint.id}`;

    /**
     * Writes one relation given as "a first end and a second end", whatever
     * the source called them. `type` and the per-side note texts follow the
     * same order; the row itself is written in the canonical order.
     */
    const write = (row: {
      first: Endpoint;
      second: Endpoint;
      type: 'related' | 'first-influences-second' | 'second-influences-first';
      note: SourceNote;
      firstSortOrder: number;
      secondSortOrder: number;
    }) => {
      const keepOrder = keyOf(row.first) < keyOf(row.second);
      const [first, second] = keepOrder
        ? [row.first, row.second]
        : [row.second, row.first];
      const type =
        row.type === 'related'
          ? 'related'
          : (row.type === 'first-influences-second') === keepOrder
            ? 'first-influences-second'
            : 'second-influences-first';
      insert.run(
        first.type,
        first.id,
        second.type,
        second.id,
        type,
        storedNote(row.note, keepOrder),
        keepOrder ? row.firstSortOrder : row.secondSortOrder,
        keepOrder ? row.secondSortOrder : row.firstSortOrder,
      );
    };

    let moved = 0;

    if (hasTable('project-relations')) {
      const rows = rawDb
        .prepare('SELECT * FROM `project-relations`')
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
      // The project side had no ordering of its own, so one is assigned as
      // the rows are read, after whatever the project already lists; the
      // event side keeps the order it had.
      const projectOrder = new Map<string, number>();
      const nextProjectOrder = (projectUuid: string) => {
        const next =
          projectOrder.get(projectUuid) ??
          ((
            rawDb
              .prepare(
                'SELECT MAX(CASE WHEN `firstType` = ? AND `firstId` = ? THEN `firstSortOrder` ELSE `secondSortOrder` END) AS `max` ' +
                  'FROM `entity-relations` ' +
                  'WHERE (`firstType` = ? AND `firstId` = ?) OR (`secondType` = ? AND `secondId` = ?)',
              )
              .get(
                'project',
                projectUuid,
                'project',
                projectUuid,
                'project',
                projectUuid,
              ) as { max: number | null }
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

    log(`Moved ${moved} relations.`);
  },
});

type Endpoint = { type: string; id: string };

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

/** The note as the new table keeps it: per side, in the row's own order. */
function storedNote(note: SourceNote, keepOrder: boolean): string | null {
  if (!note) return null;
  if (note.type === 'shared') return JSON.stringify(note);
  return JSON.stringify({
    type: 'split',
    firstText: keepOrder ? note.firstText : note.secondText,
    secondText: keepOrder ? note.secondText : note.firstText,
  });
}
