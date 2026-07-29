import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../../../server/thei/db/schema';
import {
  applyProjectRelations,
  deleteProjectRelations,
  fromStoredProjectRelationNote,
  fromStoredProjectRelationType,
  toStoredProjectRelationNote,
  toStoredProjectRelationType,
} from '../../../server/thei/projects/relations';

let rawDb: Database.Database | undefined;

afterEach(() => rawDb?.close());

describe('project relation storage', () => {
  it('maps a direction relative to either project', () => {
    expect(toStoredProjectRelationType('dependent', true)).toBe(
      'first-influences-second',
    );
    expect(
      fromStoredProjectRelationType('first-influences-second', false),
    ).toBe('influencing');
    expect(fromStoredProjectRelationType('first-influences-second', true)).toBe(
      'dependent',
    );
    expect(
      toStoredProjectRelationNote(
        {
          type: 'split',
          currentProjectText: 'Current',
          relatedProjectText: 'Related',
        },
        false,
      ),
    ).toEqual({
      type: 'split',
      firstProjectText: 'Related',
      secondProjectText: 'Current',
    });
    expect(
      fromStoredProjectRelationNote(
        {
          type: 'split',
          firstProjectText: 'First',
          secondProjectText: 'Second',
        },
        false,
      ),
    ).toEqual({
      type: 'split',
      currentProjectText: 'Second',
      relatedProjectText: 'First',
    });
  });

  it('keeps one row per pair and preserves the other side order', () => {
    const db = createDb();
    applyProjectRelations(db, schema, 'a', [
      relation('a', 'b', 'related', 'b'),
    ]);
    applyProjectRelations(db, schema, 'b', [
      relation('a', 'b', 'first-influences-second', 'a'),
    ]);

    expect(db.select().from(schema.projectRelations).all()).toMatchObject([
      {
        firstProjectUuid: 'a',
        secondProjectUuid: 'b',
        type: 'first-influences-second',
        firstSortOrder: 0,
        secondSortOrder: 0,
      },
    ]);

    deleteProjectRelations(db, schema, 'a');
    expect(db.select().from(schema.projectRelations).all()).toEqual([]);
  });
});

function createDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE "project-relations" (
      "firstProjectUuid" text NOT NULL,
      "secondProjectUuid" text NOT NULL,
      "type" text NOT NULL,
      "note" text,
      "firstSortOrder" integer NOT NULL,
      "secondSortOrder" integer NOT NULL,
      PRIMARY KEY ("firstProjectUuid", "secondProjectUuid")
    )
  `);
  return drizzle(rawDb, { schema });
}

function relation(
  firstProjectUuid: string,
  secondProjectUuid: string,
  storedType: 'related' | 'first-influences-second' | 'second-influences-first',
  projectUuid: string,
) {
  return {
    projectUuid,
    type: 'related' as const,
    firstProjectUuid,
    secondProjectUuid,
    storedType,
  };
}
