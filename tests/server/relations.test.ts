import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import {
  applyRelations,
  deleteRelations,
  fromStoredRelationNote,
  fromStoredRelationType,
  toStoredRelationNote,
  toStoredRelationType,
} from '../../server/thei/relations';

let rawDb: Database.Database | undefined;

afterEach(() => rawDb?.close());

describe('entity relation storage', () => {
  it('maps a direction relative to either end', () => {
    expect(toStoredRelationType('dependent', true)).toBe(
      'first-influences-second',
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
    ).toEqual({
      type: 'split',
      firstText: 'Related',
      secondText: 'Current',
    });
    expect(
      fromStoredRelationNote(
        { type: 'split', firstText: 'First', secondText: 'Second' },
        false,
      ),
    ).toEqual({
      type: 'split',
      currentText: 'Second',
      relatedText: 'First',
    });
  });

  it('keeps one row per pair and preserves the other side order', () => {
    const db = createDb();
    applyRelations(db, schema, project('a'), [
      prepared(project('a'), project('b'), 'related', 'b'),
    ]);
    applyRelations(db, schema, project('b'), [
      prepared(project('a'), project('b'), 'first-influences-second', 'a'),
    ]);

    expect(db.select().from(schema.entityRelations).all()).toMatchObject([
      {
        firstType: 'project',
        firstId: 'a',
        secondType: 'project',
        secondId: 'b',
        type: 'first-influences-second',
        firstSortOrder: 0,
        secondSortOrder: 0,
      },
    ]);

    deleteRelations(db, schema, project('a'));
    expect(db.select().from(schema.entityRelations).all()).toEqual([]);
  });

  it('stores a project and an event in one canonically ordered row', () => {
    const db = createDb();
    // Written from the event's side, then from the project's: the pair has to
    // land the same way round either way, or the relation exists twice.
    applyRelations(db, schema, event('e1'), [
      prepared(event('e1'), project('p1'), 'related', 'p1'),
    ]);
    applyRelations(db, schema, project('p1'), [
      prepared(event('e1'), project('p1'), 'related', 'e1'),
    ]);

    const rows = db.select().from(schema.entityRelations).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      firstType: 'event',
      firstId: 'e1',
      secondType: 'project',
      secondId: 'p1',
    });
  });
});

function project(id: string) {
  return { type: 'project' as const, id };
}

function event(id: string) {
  return { type: 'event' as const, id };
}

function prepared(
  first: { type: 'project' | 'event'; id: string },
  second: { type: 'project' | 'event'; id: string },
  storedType: 'related' | 'first-influences-second' | 'second-influences-first',
  otherId: string,
) {
  const other = first.id === otherId ? first : second;
  return {
    entityType: other.type,
    entityId: other.id,
    type: 'related' as const,
    first,
    second,
    storedType,
  };
}

function createDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE "entity-relations" (
      "firstType" text NOT NULL,
      "firstId" text NOT NULL,
      "secondType" text NOT NULL,
      "secondId" text NOT NULL,
      "type" text NOT NULL,
      "note" text,
      "firstSortOrder" integer NOT NULL,
      "secondSortOrder" integer NOT NULL,
      PRIMARY KEY("firstType", "firstId", "secondType", "secondId")
    );
  `);
  return drizzle(rawDb, { schema });
}
