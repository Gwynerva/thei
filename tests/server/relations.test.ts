import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import {
  applyRelations,
  deleteRelations,
  fromStoredRelationNote,
  fromStoredRelationType,
  prepareRelations,
  toStoredRelationNote,
  toStoredRelationType,
} from '../../server/thei/relations';
import projectRelationsMigration from '../../update/migrations/0.0.2-project-relations';

let rawDb: Database.Database | undefined;

afterEach(() => rawDb?.close());

describe('project relation storage', () => {
  it('maps a direction relative to either end', () => {
    expect(toStoredRelationType('dependent', true)).toBe(
      'project-influences-entity',
    );
    expect(fromStoredRelationType('project-influences-entity', false)).toBe(
      'influencing',
    );
    expect(fromStoredRelationType('project-influences-entity', true)).toBe(
      'dependent',
    );
    expect(
      toStoredRelationNote(
        { type: 'split', currentText: 'Current', relatedText: 'Related' },
        false,
      ),
    ).toEqual({
      type: 'split',
      projectText: 'Related',
      entityText: 'Current',
    });
    expect(
      fromStoredRelationNote(
        { type: 'split', projectText: 'Project', entityText: 'Entity' },
        false,
      ),
    ).toEqual({
      type: 'split',
      currentText: 'Entity',
      relatedText: 'Project',
    });
  });

  it('keeps one row per pair of projects and preserves the other side order', () => {
    const db = createDb();
    applyRelations(db, schema, project('a'), [
      prepared('a', project('b'), 'related'),
    ]);
    applyRelations(db, schema, project('b'), [
      prepared('a', project('b'), 'project-influences-entity'),
    ]);

    expect(db.select().from(schema.projectRelations).all()).toMatchObject([
      {
        projectUuid: 'a',
        entityType: 'project',
        entityId: 'b',
        type: 'project-influences-entity',
        projectSortOrder: 0,
        entitySortOrder: 0,
      },
    ]);

    deleteRelations(db, schema, project('a'));
    expect(db.select().from(schema.projectRelations).all()).toEqual([]);
  });

  it('stores a project and an event with the project as its owner', () => {
    const db = createDb();
    applyRelations(db, schema, project('p1'), [
      prepared('p1', event('e1'), 'related'),
    ]);

    const rows = db.select().from(schema.projectRelations).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectUuid: 'p1',
      entityType: 'event',
      entityId: 'e1',
    });

    // The event's side is cleaned up when the event goes.
    deleteRelations(db, schema, event('e1'));
    expect(db.select().from(schema.projectRelations).all()).toEqual([]);
  });

  it('refuses relations edited from anything but a project', async () => {
    await expect(
      prepareRelations(event('e1'), [
        { entityType: 'project', entityId: 'p1', type: 'related' },
      ]),
    ).rejects.toThrow('Only a project can edit its relations');
  });
});

describe('project relations migration', () => {
  it('moves 0.0.1 project and event relations into one table', () => {
    rawDb = new Database(':memory:');
    rawDb.exec(`
      CREATE TABLE "project-relations" (
        "firstProjectUuid" text NOT NULL,
        "secondProjectUuid" text NOT NULL,
        "type" text NOT NULL,
        "note" text,
        "firstSortOrder" integer NOT NULL,
        "secondSortOrder" integer NOT NULL,
        PRIMARY KEY("firstProjectUuid", "secondProjectUuid")
      );
      CREATE INDEX "project-relations-first-idx" ON "project-relations" ("firstProjectUuid", "firstSortOrder");
      CREATE TABLE "event-project-relations" (
        "eventUuid" text NOT NULL,
        "projectUuid" text NOT NULL,
        "note" text,
        "sortOrder" integer NOT NULL,
        PRIMARY KEY("eventUuid", "projectUuid")
      );
      INSERT INTO "project-relations" VALUES
        ('pa', 'pb', 'second-influences-first',
         '{"type":"split","firstProjectText":"A","secondProjectText":"B"}', 0, 1);
      INSERT INTO "event-project-relations" VALUES ('e1', 'pa', 'Note', 3);
    `);

    const run = () =>
      projectRelationsMigration.up!({
        rawDb: rawDb!,
        log: () => {},
      } as any);
    run();
    // Safe to repeat: a second run finds the new shape and changes nothing.
    run();

    const rows = rawDb
      .prepare('SELECT * FROM "project-relations" ORDER BY "entityType"')
      .all();
    expect(rows).toEqual([
      {
        projectUuid: 'pa',
        entityType: 'event',
        entityId: 'e1',
        type: 'related',
        note: '{"type":"shared","text":"Note"}',
        projectSortOrder: 1,
        entitySortOrder: 3,
      },
      {
        projectUuid: 'pa',
        entityType: 'project',
        entityId: 'pb',
        type: 'entity-influences-project',
        note: '{"type":"split","projectText":"A","entityText":"B"}',
        projectSortOrder: 0,
        entitySortOrder: 1,
      },
    ]);
    expect(
      rawDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'project-relations'",
        )
        .all(),
    ).toEqual([]);
  });
});

function project(id: string) {
  return { type: 'project' as const, id };
}

function event(id: string) {
  return { type: 'event' as const, id };
}

function prepared(
  projectUuid: string,
  entity: { type: 'project' | 'event'; id: string },
  storedType:
    'related' | 'project-influences-entity' | 'entity-influences-project',
) {
  return {
    entityType: entity.type,
    entityId: entity.id,
    type: 'related' as const,
    row: { projectUuid, entityType: entity.type, entityId: entity.id },
    storedType,
  };
}

function createDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE "project-relations" (
      "projectUuid" text NOT NULL,
      "entityType" text NOT NULL,
      "entityId" text NOT NULL,
      "type" text NOT NULL,
      "note" text,
      "projectSortOrder" integer NOT NULL,
      "entitySortOrder" integer NOT NULL,
      PRIMARY KEY("projectUuid", "entityType", "entityId")
    );
  `);
  return drizzle(rawDb, { schema });
}
