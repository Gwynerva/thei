import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import { countPages } from '../../server/thei/pages/repository/count';
import { findPageBySlug } from '../../server/thei/pages/repository/find-by-slug';
import { findPageByUuid } from '../../server/thei/pages/repository/find-by-id';
import { listPages } from '../../server/thei/pages/repository/list';
import { deletePage } from '../../server/thei/pages/delete';
import { buildPublicPageListItem } from '../../server/thei/public/entities';

let rawDb: Database.Database | undefined;
afterEach(() => rawDb?.close());

describe('pages repository', () => {
  it('stores a unique slug and finds pages by UUID or slug', async () => {
    const db = createDb();
    insertPage(db, 'pg-one', 'one', 1);

    expect(await countPages()).toBe(1);
    expect((await findPageByUuid('pg-one'))?.slug).toBe('one');
    expect((await findPageBySlug('one'))?.pageUuid).toBe('pg-one');
    expect(await findPageBySlug('one', 'pg-one')).toBeUndefined();

    expect(() => insertPage(db, 'pg-two', 'one', 2)).toThrowError(
      expect.objectContaining({ code: 'SQLITE_CONSTRAINT_UNIQUE' }),
    );
  });

  it('sorts by updatedAt and applies the requested limit', async () => {
    const db = createDb();
    for (let index = 0; index < 12; index++)
      insertPage(db, `pg-${index}`, `page-${index}`, index);

    const latest = await listPages(0, 10);
    expect(latest).toHaveLength(10);
    expect(latest.map((page) => page.updatedAt)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
  });

  it('exposes updatedAt as a public calendar date', async () => {
    const db = createDb();
    const updatedAt = Date.UTC(2026, 7, 23, 18, 30);
    insertPage(db, 'pg-one', 'one', updatedAt);
    const page = await findPageByUuid('pg-one');

    expect(await buildPublicPageListItem(page!)).toMatchObject({
      updatedAt: '2026-08-23',
    });
  });

  it('deletes the page body, content usages, and icon usages', () => {
    const db = createDb();
    insertPage(db, 'pg-one', 'one', 1);
    db.insert(schema.content)
      .values({
        contentUuid: 'c-one',
        ownerType: 'page',
        ownerId: 'pg-one',
        slot: 'page-body',
        data: { blocks: [{ type: 'paragraph', data: { text: 'Body' } }] },
        blockCount: 1,
        assetCount: 1,
        assetTotalSize: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.assetUsages)
      .values([
        {
          assetUuid: 'a-icon',
          containerType: 'page',
          containerId: 'pg-one',
          role: 'icon',
        },
        {
          assetUuid: 'a-body',
          containerType: 'content',
          containerId: 'c-one',
          role: 'content',
        },
      ])
      .run();

    deletePage('pg-one');

    expect(db.select().from(schema.pages).all()).toEqual([]);
    expect(db.select().from(schema.content).all()).toEqual([]);
    expect(db.select().from(schema.assetUsages).all()).toEqual([]);
  });
});

function createDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE pages (
      pageUuid text PRIMARY KEY NOT NULL,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      summary text NOT NULL,
      access text NOT NULL,
      createdAt integer NOT NULL,
      updatedAt integer NOT NULL
    );
    CREATE TABLE content (
      contentUuid text PRIMARY KEY NOT NULL,
      ownerType text NOT NULL,
      ownerId text NOT NULL,
      slot text NOT NULL,
      data text NOT NULL,
      blockCount integer NOT NULL DEFAULT 0,
      assetCount integer NOT NULL DEFAULT 0,
      assetTotalSize integer NOT NULL DEFAULT 0,
      createdAt integer NOT NULL,
      updatedAt integer NOT NULL
    );
    CREATE UNIQUE INDEX "content-owner-slot-idx"
      ON content (ownerType, ownerId, slot);
    CREATE TABLE "asset-usages" (
      assetUuid text NOT NULL,
      containerType text NOT NULL,
      containerId text NOT NULL,
      role text NOT NULL,
      meta text,
      PRIMARY KEY(assetUuid, containerType, containerId, role)
    );
  `);
  const db = drizzle(rawDb, { schema });
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ db, schema }),
    assets: {
      usages: { findByContainer: async () => [] },
    },
  };
  return db;
}

function insertPage(
  db: ReturnType<typeof createDb>,
  pageUuid: string,
  slug: string,
  updatedAt: number,
) {
  db.insert(schema.pages)
    .values({
      pageUuid,
      slug,
      title: slug,
      summary: `${slug} summary`,
      access: 'public' as any,
      createdAt: updatedAt,
      updatedAt,
    })
    .run();
}
