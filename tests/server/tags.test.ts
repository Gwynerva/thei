import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import {
  applyTagUsages,
  deleteTagUsagesForContainer,
} from '../../server/thei/tags';

let rawDb: Database.Database | undefined;
afterEach(() => rawDb?.close());

describe('tag usages', () => {
  it('stores ordered universal usages and cleans simple orphans', () => {
    const db = createDb();
    insertTag(db, 't-1', 'One');
    insertTag(db, 't-2', 'Two');
    const prepared = [
      { tagUuid: 't-2' },
      { tagUuid: 't-1' },
    ];
    applyTagUsages(db, schema, 'project', 'p-1', prepared);
    applyTagUsages(db, schema, 'event', 'e-1', [{ tagUuid: 't-1' }]);

    expect(db.select().from(schema.tagUsages).all()).toEqual([
      { tagUuid: 't-2', containerType: 'project', containerId: 'p-1', sortOrder: 0 },
      { tagUuid: 't-1', containerType: 'project', containerId: 'p-1', sortOrder: 1 },
      { tagUuid: 't-1', containerType: 'event', containerId: 'e-1', sortOrder: 0 },
    ]);

    deleteTagUsagesForContainer(db, schema, 'project', 'p-1');
    expect(db.select().from(schema.tags).all().map((tag) => tag.tagUuid)).toEqual(['t-1']);
  });

  it('keeps an orphan tag when it has authored metadata', () => {
    const db = createDb();
    insertTag(db, 't-1', 'One', { description: 'Curated tag' });
    applyTagUsages(db, schema, 'project', 'p-1', [{ tagUuid: 't-1' }]);

    deleteTagUsagesForContainer(db, schema, 'project', 'p-1');

    expect(db.select().from(schema.tags).all().map((tag) => tag.tagUuid))
      .toEqual(['t-1']);
  });

  it('keeps an orphan tag when it owns an icon usage', () => {
    const db = createDb();
    insertTag(db, 't-1', 'One');
    db.insert(schema.assetUsages).values({
      assetUuid: 'a-1',
      containerType: 'tag',
      containerId: 't-1',
      role: 'icon',
    }).run();
    applyTagUsages(db, schema, 'project', 'p-1', [{ tagUuid: 't-1' }]);

    deleteTagUsagesForContainer(db, schema, 'project', 'p-1');

    expect(db.select().from(schema.tags).all().map((tag) => tag.tagUuid))
      .toEqual(['t-1']);
  });

  it('recovers slug and public ID conflicts prepared by another request', () => {
    const db = createDb();
    insertTag(db, 't-existing', 'Existing', {
      slug: 'new-tag',
      publicId: 'reserved',
    });

    applyTagUsages(db, schema, 'project', 'p-1', [
      {
        tagUuid: 't-new',
        title: 'New tag',
        normalizedTitle: 'new tag',
        slug: 'new-tag',
        publicId: 'reserved',
      },
    ]);

    const created = db
      .select()
      .from(schema.tags)
      .where(eq(schema.tags.tagUuid, 't-new'))
      .get();
    expect(created?.slug).toBe('new-tag-2');
    expect(created?.publicId).not.toBe('reserved');
  });
});

function createDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE tags (
      tagUuid text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      normalizedTitle text NOT NULL UNIQUE,
      slug text NOT NULL UNIQUE,
      publicId text NOT NULL UNIQUE,
      description text DEFAULT '' NOT NULL,
      accentColor text
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
  return drizzle(rawDb, { schema });
}

function insertTag(
  db: ReturnType<typeof createDb>,
  tagUuid: string,
  title: string,
  overrides: Partial<typeof schema.tags.$inferInsert> = {},
) {
  db.insert(schema.tags)
    .values({
      tagUuid,
      title,
      normalizedTitle: title.toLocaleLowerCase(),
      slug: title.toLocaleLowerCase(),
      publicId: tagUuid.replace('-', ''),
      ...overrides,
    })
    .run();
}
