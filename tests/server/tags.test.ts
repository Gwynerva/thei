import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import {
  applyTagUsages,
  deleteTagUsagesForContainer,
  prepareTagUsages,
} from '../../server/thei/tags';

let rawDb: Database.Database | undefined;
afterEach(() => {
  rawDb?.close();
  vi.unstubAllGlobals();
});

describe('tag usages', () => {
  it('stores ordered universal usages and cleans simple orphans', () => {
    const db = createDb();
    insertTag(db, 't-1', 'One');
    insertTag(db, 't-2', 'Two');
    const prepared = [{ tagUuid: 't-2' }, { tagUuid: 't-1' }];
    applyTagUsages(db, schema, 'project', 'p-1', prepared);
    applyTagUsages(db, schema, 'event', 'e-1', [{ tagUuid: 't-1' }]);

    expect(db.select().from(schema.tagUsages).all()).toEqual([
      {
        tagUuid: 't-2',
        containerType: 'project',
        containerId: 'p-1',
        sortOrder: 0,
      },
      {
        tagUuid: 't-1',
        containerType: 'project',
        containerId: 'p-1',
        sortOrder: 1,
      },
      {
        tagUuid: 't-1',
        containerType: 'event',
        containerId: 'e-1',
        sortOrder: 0,
      },
    ]);

    deleteTagUsagesForContainer(db, schema, 'project', 'p-1');
    expect(
      db
        .select()
        .from(schema.tags)
        .all()
        .map((tag) => tag.tagUuid),
    ).toEqual(['t-1']);
  });

  it('keeps an orphan tag when it has authored metadata', () => {
    const db = createDb();
    insertTag(db, 't-1', 'One', { description: 'Curated tag' });
    applyTagUsages(db, schema, 'project', 'p-1', [{ tagUuid: 't-1' }]);

    deleteTagUsagesForContainer(db, schema, 'project', 'p-1');

    expect(
      db
        .select()
        .from(schema.tags)
        .all()
        .map((tag) => tag.tagUuid),
    ).toEqual(['t-1']);
  });

  it('keeps an orphan tag when it owns an icon usage', () => {
    const db = createDb();
    insertTag(db, 't-1', 'One');
    db.insert(schema.assetUsages)
      .values({
        assetUuid: 'a-1',
        containerType: 'tag',
        containerId: 't-1',
        role: 'icon',
      })
      .run();
    applyTagUsages(db, schema, 'project', 'p-1', [{ tagUuid: 't-1' }]);

    deleteTagUsagesForContainer(db, schema, 'project', 'p-1');

    expect(
      db
        .select()
        .from(schema.tags)
        .all()
        .map((tag) => tag.tagUuid),
    ).toEqual(['t-1']);
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
        create: {
          title: 'New tag',
          normalizedTitle: 'new tag',
          slug: 'new-tag',
          publicId: 'reserved',
        },
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

  it('places a tag once when a new title turns out to name it', () => {
    const db = createDb();
    insertTag(db, 't-1', 'One');

    applyTagUsages(db, schema, 'project', 'p-1', [
      { tagUuid: 't-1' },
      {
        tagUuid: 't-new',
        create: {
          title: 'One',
          normalizedTitle: 'one',
          slug: 'one-2',
          publicId: 'fresh',
        },
      },
    ]);

    expect(db.select().from(schema.tagUsages).all()).toEqual([
      {
        tagUuid: 't-1',
        containerType: 'project',
        containerId: 'p-1',
        sortOrder: 0,
      },
    ]);
    expect(db.select().from(schema.tags).all()).toHaveLength(1);
  });
});

describe('prepared tag usages', () => {
  it('resolves a renamed tag typed again by its new name to one tag', async () => {
    const db = createDb();
    insertTag(db, 't-1', 'Travel');
    vi.stubGlobal('THEI_SERVER', {
      useDb: () => ({ db, schema }),
      language: { slugify: (value: string) => value.toLowerCase() },
    });

    // The form still holds the tag under its old title, and the person typed
    // its new one as if it were a new tag.
    const prepared = await prepareTagUsages([
      { tagUuid: 't-1', title: 'Trips', slug: 'trips', publicId: 't1' },
      { title: '  travel ' },
      { title: 'New  one' },
      { title: 'new one' },
    ]);

    expect(prepared).toHaveLength(2);
    expect(prepared?.[0]).toEqual({ tagUuid: 't-1' });
    expect(prepared?.[1]?.create).toMatchObject({
      title: 'New one',
      normalizedTitle: 'new one',
    });
  });

  it('refuses a tag that does not exist', async () => {
    const db = createDb();
    vi.stubGlobal('THEI_SERVER', { useDb: () => ({ db, schema }) });
    await expect(
      prepareTagUsages([
        { tagUuid: 't-missing', title: 'Gone', slug: 'gone', publicId: 'g' },
      ]),
    ).rejects.toThrow('Tag not found');
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
