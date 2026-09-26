import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import tagNames from '../../update/migrations/0.0.2-tag-names';

let rawDb: Database.Database | undefined;
afterEach(() => rawDb?.close());

/** The tables as 0.0.1 left them. */
function legacyDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE tags (
      tagUuid text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      normalizedTitle text NOT NULL UNIQUE,
      slug text NOT NULL UNIQUE,
      publicId text NOT NULL UNIQUE,
      description text DEFAULT '' NOT NULL
    );
    CREATE TABLE "tag-usages" (
      tagUuid text NOT NULL,
      containerType text NOT NULL,
      containerId text NOT NULL,
      sortOrder integer NOT NULL,
      PRIMARY KEY (tagUuid, containerType, containerId)
    );
    CREATE TABLE "asset-usages" (
      assetUuid text NOT NULL,
      containerType text NOT NULL,
      containerId text NOT NULL,
      role text NOT NULL,
      meta text,
      PRIMARY KEY (assetUuid, containerType, containerId, role)
    );
  `);
  return rawDb;
}

function tag(
  db: Database.Database,
  tagUuid: string,
  title: string,
  description = '',
) {
  db.prepare(
    'INSERT INTO tags (tagUuid, title, normalizedTitle, slug, publicId, description) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    tagUuid,
    title,
    title.toLocaleLowerCase(),
    tagUuid,
    tagUuid,
    description,
  );
}

function usage(
  db: Database.Database,
  tagUuid: string,
  containerId: string,
  sortOrder = 0,
) {
  db.prepare('INSERT INTO "tag-usages" VALUES (?, \'event\', ?, ?)').run(
    tagUuid,
    containerId,
    sortOrder,
  );
}

describe('tag names migration', () => {
  it('adds synonyms and merges tags differing only in ё into the most used', () => {
    const db = legacyDb();
    tag(db, 't-yo', 'Ёлка');
    tag(db, 't-ye', 'Елка', 'New Year tree');
    tag(db, 't-sea', 'Море');
    usage(db, 't-yo', 'e-1');
    usage(db, 't-yo', 'e-2');
    usage(db, 't-yo', 'e-4');
    usage(db, 't-ye', 'e-2', 3);
    usage(db, 't-ye', 'e-3', 1);
    usage(db, 't-sea', 'e-1', 1);
    db.prepare(
      "INSERT INTO \"asset-usages\" VALUES ('a-icon', 'tag', 't-ye', 'icon', NULL)",
    ).run();

    tagNames.up({ rawDb: db } as never);
    // Repeatable: a second run changes nothing.
    tagNames.up({ rawDb: db } as never);

    expect(
      db
        .prepare(
          'SELECT tagUuid, normalizedTitle, description, synonyms FROM tags ORDER BY tagUuid',
        )
        .all(),
    ).toEqual([
      {
        tagUuid: 't-sea',
        normalizedTitle: 'море',
        description: '',
        synonyms: '[]',
      },
      {
        tagUuid: 't-yo',
        normalizedTitle: 'елка',
        description: 'New Year tree',
        synonyms: '[]',
      },
    ]);
    expect(
      db
        .prepare(
          'SELECT containerId, sortOrder FROM "tag-usages" WHERE tagUuid = \'t-yo\' ORDER BY containerId',
        )
        .all(),
    ).toEqual([
      { containerId: 'e-1', sortOrder: 0 },
      { containerId: 'e-2', sortOrder: 0 },
      { containerId: 'e-3', sortOrder: 1 },
      { containerId: 'e-4', sortOrder: 0 },
    ]);
    expect(db.prepare('SELECT containerId FROM "asset-usages"').all()).toEqual([
      { containerId: 't-yo' },
    ]);
  });
});
