import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import {
  applyRelations,
  canonicalPair,
  deleteRelations,
  fromStoredRelationNote,
  fromStoredRelationType,
  prepareRelations,
  readRelationRows,
  toStoredRelationNote,
  toStoredRelationType,
} from '../../server/thei/relations';
import type { RelationEndpoint, RelationType } from '../../shared/relation';
import { baselineSql } from '../../update/migrations';
import relationsMigration from '../../update/migrations/0.0.2-entity-relations';

let rawDb: Database.Database | undefined;

afterEach(() => {
  rawDb?.close();
  delete (globalThis as any).THEI_SERVER;
});

describe('entity relation storage', () => {
  it('writes a pair in one canonical order whichever side draws it', () => {
    // `event:e1` sorts before `project:p1`, so the event is the first end
    // however the pair is given.
    expect(canonicalPair(project('p1'), event('e1'))).toEqual([
      {
        firstType: 'event',
        firstId: 'e1',
        secondType: 'project',
        secondId: 'p1',
      },
      false,
    ]);
    expect(canonicalPair(event('e1'), project('p1'))[1]).toBe(true);
    expect(canonicalPair(diary('d1'), event('e1'))).toEqual([
      {
        firstType: 'diary-entry',
        firstId: 'd1',
        secondType: 'event',
        secondId: 'e1',
      },
      true,
    ]);
    expect(canonicalPair(project('b'), project('a'))).toEqual([
      {
        firstType: 'project',
        firstId: 'a',
        secondType: 'project',
        secondId: 'b',
      },
      false,
    ]);
  });

  it('maps a direction and a split note relative to either end', () => {
    expect(toStoredRelationType('dependent', true)).toBe(
      'first-influences-second',
    );
    expect(toStoredRelationType('dependent', false)).toBe(
      'second-influences-first',
    );
    expect(fromStoredRelationType('first-influences-second', false)).toBe(
      'influencing',
    );
    expect(fromStoredRelationType('first-influences-second', true)).toBe(
      'dependent',
    );
    expect(
      toStoredRelationNote(
        { type: 'split', currentText: 'Current', relatedText: 'Related' },
        false,
      ),
    ).toEqual({ type: 'split', firstText: 'Related', secondText: 'Current' });
    expect(
      fromStoredRelationNote(
        { type: 'split', firstText: 'First', secondText: 'Second' },
        false,
      ),
    ).toEqual({ type: 'split', currentText: 'Second', relatedText: 'First' });
  });

  it('keeps one row per pair and gives each side its own order', () => {
    const db = createDb();
    applyRelations(db, schema, project('p1'), [
      prepared(project('p1'), event('e1'), 'related'),
      prepared(project('p1'), project('p2'), 'related'),
    ]);
    // The event then says it influences the project: the same row, with
    // the direction written in, and the project's order left alone.
    applyRelations(db, schema, event('e1'), [
      prepared(event('e1'), project('p1'), 'dependent'),
    ]);

    expect(
      db
        .select()
        .from(schema.entityRelations)
        .all()
        .sort((a, b) => a.firstType.localeCompare(b.firstType)),
    ).toMatchObject([
      {
        firstType: 'event',
        firstId: 'e1',
        secondType: 'project',
        secondId: 'p1',
        type: 'first-influences-second',
        firstSortOrder: 0,
        secondSortOrder: 0,
      },
      {
        firstType: 'project',
        firstId: 'p1',
        secondType: 'project',
        secondId: 'p2',
        type: 'related',
        firstSortOrder: 1,
        secondSortOrder: 0,
      },
    ]);
    expect(readRelationRows(project('p1'))).toMatchObject([
      { other: { type: 'event', id: 'e1' }, type: 'influencing', order: 0 },
      { other: { type: 'project', id: 'p2' }, type: 'related', order: 1 },
    ]);
    expect(readRelationRows(event('e1'))).toMatchObject([
      { other: { type: 'project', id: 'p1' }, type: 'dependent', order: 0 },
    ]);

    deleteRelations(db, schema, event('e1'));
    expect(db.select().from(schema.entityRelations).all()).toMatchObject([
      { firstId: 'p1', secondId: 'p2' },
    ]);
  });

  it('refuses a relation to itself or to nothing, from any kind', async () => {
    const db = createDb();
    await expect(
      prepareRelations(event('e1'), [
        { entityType: 'event', entityId: 'e1', type: 'related' },
      ]),
    ).rejects.toThrow('An entity cannot be related to itself');
    await expect(
      prepareRelations(diary('d1'), [
        { entityType: 'project', entityId: 'missing', type: 'related' },
      ]),
    ).rejects.toThrow('Related entity not found');

    db.insert(schema.projects)
      .values({
        projectUuid: 'p1',
        publicId: 'p1',
        humanReadableSlug: 'p1',
        title: 'P1',
        summary: '',
        access: 'public',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    await expect(
      prepareRelations(diary('d1'), [
        {
          entityType: 'project',
          entityId: 'p1',
          type: 'influencing',
          note: { type: 'split', currentText: 'Mine', relatedText: 'Theirs' },
        },
      ]),
    ).resolves.toMatchObject([
      {
        row: {
          firstType: 'diary-entry',
          firstId: 'd1',
          secondType: 'project',
          secondId: 'p1',
        },
        storedType: 'second-influences-first',
        storedNote: { type: 'split', firstText: 'Mine', secondText: 'Theirs' },
      },
    ]);
  });
});

describe('relations migration', () => {
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
      relationsMigration.up!({
        rawDb: rawDb!,
        log: () => {},
      } as any);
    run();
    // Safe to repeat: a second run finds nothing left to move.
    run();

    const rows = rawDb
      .prepare('SELECT * FROM "entity-relations" ORDER BY "firstType"')
      .all();
    expect(rows).toEqual([
      // `event:e1` sorts before `project:pa`: the event is the first end,
      // keeps its own order, and the project side lands after its existing
      // relation.
      {
        firstType: 'event',
        firstId: 'e1',
        secondType: 'project',
        secondId: 'pa',
        type: 'related',
        note: '{"type":"shared","text":"Note"}',
        firstSortOrder: 3,
        secondSortOrder: 1,
      },
      {
        firstType: 'project',
        firstId: 'pa',
        secondType: 'project',
        secondId: 'pb',
        type: 'second-influences-first',
        note: '{"type":"split","firstText":"A","secondText":"B"}',
        firstSortOrder: 0,
        secondSortOrder: 1,
      },
    ]);
    expect(
      rawDb
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'entity-relations'",
        )
        .all(),
    ).toEqual([]);
  });
});

function project(id: string): RelationEndpoint {
  return { type: 'project', id };
}

function event(id: string): RelationEndpoint {
  return { type: 'event', id };
}

function diary(id: string): RelationEndpoint {
  return { type: 'diary-entry', id };
}

/** A relation as `prepareRelations` would hand it over, from `owner`'s side. */
function prepared(
  owner: RelationEndpoint,
  other: RelationEndpoint,
  type: RelationType,
) {
  const [row, ownerFirst] = canonicalPair(owner, other);
  return {
    entityType: other.type,
    entityId: other.id,
    type,
    row,
    storedType: toStoredRelationType(type, ownerFirst),
  };
}

function createDb() {
  rawDb = new Database(':memory:');
  for (const statement of baselineSql) rawDb.prepare(statement).run();
  const db = drizzle(rawDb, { schema });
  Object.assign(globalThis, { THEI_SERVER: { useDb: () => ({ db, schema }) } });
  return db;
}
