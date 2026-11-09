import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import {
  applyExcerpts,
  countExcerptsOfParent,
  deleteExcerptsOfParent,
  detachExcerptsFromTarget,
  listExcerpts,
  listExcerptsByIds,
  prepareExcerpts,
} from '../../server/thei/excerpts';
import { loadExcerptParents } from '../../server/thei/excerpts/parents';
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
    about: { entityType: 'project', entityId: 'p1', type: 'related' },
    ...overrides,
  };
}

describe('excerpts of a diary entry', () => {
  it('are saved with their texts and what they are about, and given ids once', async () => {
    const db = createDb();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const prepared = await prepareExcerpts(entry, [
      excerpt('Stringers00000', 'Stringers'),
      excerpt('Launch00000000', 'Launch day', {
        about: { entityType: 'event', entityId: 'e1', type: 'influencing' },
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
    // What an excerpt is about is a row of its own, read from its side.
    expect(readRelationRows({ type: 'excerpt', id: first })).toMatchObject([
      { other: kayak, type: 'related' },
    ]);
    expect(readRelationRows({ type: 'excerpt', id: second })).toMatchObject([
      { other: launch, type: 'influencing' },
    ]);
    expect(listExcerpts(entry).map((row) => row.subject)).toMatchObject([
      { type: 'project', id: 'p1' },
      { type: 'event', id: 'e1' },
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
        about: prepared![index]!.relations.map((relation) => ({
          entityType: relation.entityType,
          entityId: relation.entityId,
          type: relation.type,
        }))[0]!,
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
          about: { entityType: 'diary-entry', entityId: 'd1', type: 'related' },
        }),
      ]),
    ).rejects.toThrow('not related to its own parent');
    await expect(
      prepareExcerpts(entry, [
        excerpt('Gone0000000000', 'Gone', {
          about: {
            entityType: 'project',
            entityId: 'missing',
            type: 'related',
          },
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

  it('save about nothing, once what they were about is deleted, and only then', async () => {
    const db = createDb();
    // A new one says what it is about.
    await expect(
      prepareExcerpts(entry, [
        excerpt('Orphan00000000', 'Orphan', { about: null }),
      ]),
    ).rejects.toThrow('says what it is about');
    const prepared = await prepareExcerpts(entry, [
      excerpt('Orphan00000000', 'Orphan', {
        about: { entityType: 'event', entityId: 'e1', type: 'related' },
      }),
    ]);
    applyExcerpts(db, schema, entry, prepared);
    const kept = {
      ...excerpt('Orphan00000000', 'Orphan', { about: null }),
      excerptUuid: prepared![0]!.excerptUuid,
    };
    // One about something keeps it: nothing does not take its place.
    await expect(prepareExcerpts(entry, [kept])).rejects.toThrow(
      'says what it is about',
    );
    // The parent's form sends every excerpt with each save: one left about
    // nothing by a deleted target must not keep the parent from saving.
    detachExcerptsFromTarget(db, schema, launch, 'keep');
    applyExcerpts(db, schema, entry, await prepareExcerpts(entry, [kept]));
    expect(listExcerpts(entry)).toMatchObject([
      { title: 'Orphan', subject: null },
    ]);
    expect(db.select().from(schema.entityRelations).all()).toEqual([]);
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
      excerpt('AboutKayak0000', 'About the kayak'),
      excerpt('AboutLaunch000', 'About the launch', {
        about: { entityType: 'event', entityId: 'e1', type: 'related' },
      }),
    ]);
    applyExcerpts(db, schema, entry, prepared);

    // Kept: it stays, about nothing, and edited.
    vi.spyOn(Date, 'now').mockReturnValue(5000);
    expect(detachExcerptsFromTarget(db, schema, kayak, 'keep')).toHaveLength(1);
    expect(listExcerpts(entry)).toMatchObject([
      { title: 'About the kayak', updatedAt: 5000, subject: null },
      { title: 'About the launch', subject: { type: 'event', id: 'e1' } },
    ]);
    expect(db.select().from(schema.entityRelations).all()).toMatchObject([
      { firstType: 'event', firstId: 'e1', secondType: 'excerpt' },
    ]);
    // The parent moved with them: its form is read again before a save.
    expect(db.select().from(schema.diaryEntries).get()!.updatedAt).toBe(5000);

    // Deleted: whatever was about the target goes with it, and the parent
    // moves all the same: an open form of it no longer holds them.
    vi.spyOn(Date, 'now').mockReturnValue(6000);
    expect(detachExcerptsFromTarget(db, schema, launch, 'delete')).toEqual([
      prepared![1]!.excerptUuid,
    ]);
    expect(listExcerpts(entry).map((row) => row.title)).toEqual([
      'About the kayak',
    ]);
    expect(db.select().from(schema.entityRelations).all()).toEqual([]);
    expect(db.select().from(schema.diaryEntries).get()!.updatedAt).toBe(6000);
  });

  it('are read by their ids across parents, and the parents a kind at a time', async () => {
    const db = createDb();
    const ofLaunch = await prepareExcerpts(launch, [
      excerpt('OfTheLaunch000', 'Of the launch'),
    ]);
    applyExcerpts(db, schema, launch, ofLaunch);
    const ofDay = await prepareExcerpts(entry, [
      excerpt('OfTheDay000000', 'Of the day'),
      excerpt('Unasked0000000', 'Not asked for'),
    ]);
    applyExcerpts(db, schema, entry, ofDay);
    const wanted = [ofLaunch![0]!.excerptUuid, ofDay![0]!.excerptUuid];
    expect(
      listExcerptsByIds(wanted)
        .map((row) => [row.title, row.parentType, row.subject?.id])
        .sort(),
    ).toEqual([
      ['Of the day', 'diary-entry', 'p1'],
      ['Of the launch', 'event', 'p1'],
    ]);
    expect(listExcerptsByIds([])).toEqual([]);
    const parents = loadExcerptParents([launch, entry, launch, kayak]);
    expect([...parents.keys()].sort()).toEqual([
      'diary-entry:d1',
      'event:e1',
      'project:p1',
    ]);
    expect(parents.get('diary-entry:d1')).toMatchObject({
      date: '2024-03-02',
      href: '/diary/2024-03-02/',
    });
  });

  it('move the version of every parent a deleted target takes excerpts from', async () => {
    const db = createDb();
    const prepared = await prepareExcerpts(launch, [
      excerpt('OfTheLaunch000', 'Of the launch'),
    ]);
    applyExcerpts(db, schema, launch, prepared);
    applyExcerpts(
      db,
      schema,
      entry,
      await prepareExcerpts(entry, [excerpt('OfTheDay000000', 'Of the day')]),
    );
    vi.spyOn(Date, 'now').mockReturnValue(7000);
    expect(detachExcerptsFromTarget(db, schema, kayak, 'delete')).toHaveLength(
      2,
    );
    expect(db.select().from(schema.events).get()!.updatedAt).toBe(7000);
    expect(db.select().from(schema.diaryEntries).get()!.updatedAt).toBe(7000);
    expect(db.select().from(schema.excerpts).all()).toEqual([]);
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
