import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import {
  applyExcerpts,
  countExcerptsOfParent,
  countExcerptsOfTarget,
  deleteExcerptsOfParent,
  detachExcerptsFromTarget,
  listExcerpts,
  prepareExcerpts,
} from '../../server/thei/excerpts';
import {
  applyRelations,
  deleteRelations,
  loadRelationTargets,
  prepareRelations,
  readRelationRows,
} from '../../server/thei/relations';
import type { ExcerptItem } from '../../shared/excerpt';
import { baselineSql } from '../../update/migrations';
import { loadLanguage } from '../../shared/language';

const language = await loadLanguage('en');

let rawDb: Database.Database | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  rawDb?.close();
  rawDb = undefined;
  delete (globalThis as any).THEI_SERVER;
});

const entry = { type: 'diary-entry', id: 'd1' } as const;
const kayak = { type: 'project', id: 'p1' } as const;
const launch = { type: 'event', id: 'e1' } as const;

function excerpt(
  publicId: string,
  title: string,
  overrides: Partial<ExcerptItem> = {},
): ExcerptItem {
  return {
    title,
    summary: '',
    humanReadableSlug: publicId.toLowerCase(),
    publicId,
    isPrivate: false,
    content: {
      data: { blocks: [{ type: 'paragraph', data: { text: `${title}.` } }] },
    },
    relations: [{ entityType: 'project', entityId: 'p1', type: 'related' }],
    ...overrides,
  };
}

describe('excerpts of a diary entry', () => {
  it('are saved with their texts and relations, and given ids once', async () => {
    const db = createDb();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const prepared = await prepareExcerpts(entry, [
      excerpt('Stringers00000', 'Stringers'),
      excerpt('Launch00000000', 'Launch day', {
        relations: [
          { entityType: 'project', entityId: 'p1', type: 'related' },
          { entityType: 'event', entityId: 'e1', type: 'influencing' },
        ],
      }),
    ]);
    expect(prepared).toHaveLength(2);
    expect(prepared![0]!.excerptUuid).toMatch(/^x-/);
    applyExcerpts(db, schema, entry, prepared);

    expect(listExcerpts(entry)).toMatchObject([
      { title: 'Stringers', parentId: 'd1' },
      { title: 'Launch day' },
    ]);
    expect(countExcerptsOfParent(entry)).toBe(2);
    const first = prepared![0]!.excerptUuid;
    const second = prepared![1]!.excerptUuid;
    expect(
      db
        .select()
        .from(schema.content)
        .all()
        .map((row) => `${row.ownerType}:${row.ownerId}:${row.slot}`),
    ).toEqual([
      `excerpt:${first}:excerpt-body`,
      `excerpt:${second}:excerpt-body`,
    ]);
    // The excerpt's relations are its own rows, read from its side.
    expect(readRelationRows({ type: 'excerpt', id: second })).toMatchObject([
      { other: kayak, type: 'related' },
      { other: launch, type: 'influencing' },
    ]);
    // The project moved: an open form of it learns the excerpt relates to it.
    expect(projectVersion(db)).toBe(1000);

    // Saved again with the same ids: nothing new is made, nothing changes.
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    const again = await prepareExcerpts(
      entry,
      listExcerpts(entry).map((row, index) => ({
        ...excerpt(row.publicId, row.title),
        excerptUuid: row.excerptUuid,
        relations: prepared![index]!.relations.map((relation) => ({
          entityType: relation.entityType,
          entityId: relation.entityId,
          type: relation.type,
        })),
        content: {
          data: {
            blocks: [{ type: 'paragraph', data: { text: `${row.title}.` } }],
          },
        },
      })),
    );
    applyExcerpts(db, schema, entry, again);
    expect(listExcerpts(entry).map((row) => row.updatedAt)).toEqual([
      1000, 1000,
    ]);
  });

  it('refuses an excerpt about its own parent or about nothing that exists', async () => {
    createDb();
    await expect(
      prepareExcerpts(entry, [
        excerpt('Self0000000000', 'Self', {
          relations: [
            { entityType: 'diary-entry', entityId: 'd1', type: 'related' },
          ],
        }),
      ]),
    ).rejects.toThrow('not related to its own parent');
    await expect(
      prepareExcerpts(entry, [
        excerpt('Gone0000000000', 'Gone', {
          relations: [
            { entityType: 'project', entityId: 'missing', type: 'related' },
          ],
        }),
      ]),
    ).rejects.toThrow('Related entity not found');
    await expect(
      prepareExcerpts(entry, [
        excerpt('Mute0000000000', 'Mute', {
          content: { data: { blocks: [] } },
        }),
      ]),
    ).rejects.toThrow('An excerpt needs a text');
  });

  it("survive the target's own save, which never carries them", async () => {
    const db = createDb();
    const prepared = await prepareExcerpts(entry, [
      excerpt('Stringers00000', 'Stringers'),
    ]);
    applyExcerpts(db, schema, entry, prepared);
    const id = prepared![0]!.excerptUuid;

    // The project's form reads its relations without the excerpt's row…
    expect(readRelationRows(kayak)).toEqual([]);
    // …and saving the project with an empty list leaves that row alone.
    applyRelations(
      db,
      schema,
      kayak,
      await prepareRelations(kayak, [
        { entityType: 'event', entityId: 'e1', type: 'related' },
      ]),
    );
    applyRelations(db, schema, kayak, await prepareRelations(kayak, []));
    expect(db.select().from(schema.entityRelations).all()).toMatchObject([
      { firstType: 'excerpt', firstId: id, secondType: 'project' },
    ]);
    // The same for the project's deletion of its own relations.
    deleteRelations(db, schema, kayak);
    expect(db.select().from(schema.entityRelations).all()).toHaveLength(1);
  });

  it('describe the excerpt end of a relation by its parent', async () => {
    const db = createDb();
    const prepared = await prepareExcerpts(entry, [
      excerpt('Stringers00000', 'Stringers', { isPrivate: true }),
    ]);
    applyExcerpts(db, schema, entry, prepared);
    const id = prepared![0]!.excerptUuid;
    const targets = await loadRelationTargets([{ type: 'excerpt', id }]);
    expect(targets.get(`excerpt:${id}`)).toMatchObject({
      title: 'Stringers',
      date: '2024-03-02',
      access: 'private',
      parent: { type: 'diary-entry', id: 'd1', title: '2024-03-02' },
    });
  });

  it('go with their parent, texts, banners and relations included', async () => {
    const db = createDb();
    const prepared = await prepareExcerpts(entry, [
      excerpt('Stringers00000', 'Stringers', { bannerAssetUuid: 'banner-1' }),
    ]);
    applyExcerpts(db, schema, entry, prepared);
    expect(
      db
        .select()
        .from(schema.assetUsages)
        .all()
        .filter((row) => row.role === 'banner'),
    ).toHaveLength(1);
    deleteExcerptsOfParent(db, schema, entry);
    expect(db.select().from(schema.excerpts).all()).toEqual([]);
    expect(db.select().from(schema.content).all()).toEqual([]);
    expect(db.select().from(schema.entityRelations).all()).toEqual([]);
    expect(
      db
        .select()
        .from(schema.assetUsages)
        .all()
        .filter((row) => row.role === 'banner'),
    ).toEqual([]);
  });

  it('are kept or deleted with a target the owner deletes, as the owner chose', async () => {
    const db = createDb();
    const prepared = await prepareExcerpts(entry, [
      excerpt('OnlyKayak00000', 'Only the kayak'),
      excerpt('KayakAndLaunch', 'Kayak and launch', {
        relations: [
          { entityType: 'project', entityId: 'p1', type: 'related' },
          { entityType: 'event', entityId: 'e1', type: 'related' },
        ],
      }),
    ]);
    applyExcerpts(db, schema, entry, prepared);
    expect(countExcerptsOfTarget(kayak)).toEqual({ related: 2, onlyTarget: 1 });

    // Kept: both stay, the first with no relation left, both edited.
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    expect(detachExcerptsFromTarget(db, schema, kayak, 'keep')).toHaveLength(2);
    expect(listExcerpts(entry)).toMatchObject([
      { title: 'Only the kayak', updatedAt: 5000 },
      { title: 'Kayak and launch', updatedAt: 5000 },
    ]);
    expect(db.select().from(schema.entityRelations).all()).toMatchObject([
      { firstType: 'event', firstId: 'e1', secondType: 'excerpt' },
    ]);
    // The parent moved with them: its form is read again before a save.
    expect(db.select().from(schema.diaryEntries).get()!.updatedAt).toBe(5000);

    // Deleted: whatever was about the target goes with it.
    expect(detachExcerptsFromTarget(db, schema, launch, 'delete')).toEqual([
      prepared![1]!.excerptUuid,
    ]);
    expect(listExcerpts(entry).map((row) => row.title)).toEqual([
      'Only the kayak',
    ]);
    expect(db.select().from(schema.entityRelations).all()).toEqual([]);
  });
});

function projectVersion(db: ReturnType<typeof createDb>) {
  return db.select().from(schema.projects).get()!.updatedAt;
}

function createDb() {
  rawDb = new Database(':memory:');
  for (const statement of baselineSql) rawDb.prepare(statement).run();
  const db = drizzle(rawDb, { schema });
  db.insert(schema.projects)
    .values({
      projectUuid: 'p1',
      publicId: 'p1',
      humanReadableSlug: 'kayak',
      title: 'Kayak',
      summary: '',
      access: 'public',
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.events)
    .values({
      eventUuid: 'e1',
      publicId: 'e1',
      humanReadableSlug: 'launch',
      title: 'Launch',
      summary: '',
      access: 'public',
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.diaryEntries)
    .values({
      diaryUuid: 'd1',
      date: '2024-03-02',
      access: 'public',
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ db, schema }),
    language,
    assets: { findByUuid: async () => undefined },
    content: {
      buildFieldValue: async () => undefined,
    },
  };
  return db;
}
