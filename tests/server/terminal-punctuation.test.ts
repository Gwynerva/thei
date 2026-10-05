import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../../server/thei/db/schema';
import { baselineSql } from '../../update/migrations';
import { punctuateStoredTexts } from '../../server/thei/terminal-punctuation';
import { describeHistoryData } from '../../server/thei/content/history';
import type { ContentOutputData } from '../../shared/content';

let rawDb: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  rawDb = new Database(':memory:');
  for (const statement of baselineSql) rawDb.prepare(statement).run();
  db = drizzle(rawDb, { schema });
  Object.assign(globalThis, {
    THEI_SERVER: { useDb: () => ({ db, schema, rawDb }) },
  });
});

afterEach(() => {
  rawDb.close();
  delete (globalThis as any).THEI_SERVER;
});

const text = (caption: string, header: string): ContentOutputData => ({
  blocks: [
    { id: 'h', type: 'header', data: { text: header, level: 2 } },
    {
      id: 'q',
      type: 'quote',
      data: { text: 'Слова', caption, alignment: 'left' },
    },
    { id: 'p', type: 'paragraph', data: { text: 'Абзац остаётся.' } },
  ],
});

const entity = { summary: '', access: 'public', createdAt: 1, updatedAt: 2 };

function seed() {
  db.insert(schema.projects)
    .values({
      ...entity,
      projectUuid: 'pr-1',
      title: 'Проект.',
      humanReadableSlug: 'project',
      publicId: 'pr1',
    })
    .run();
  db.insert(schema.events)
    .values({
      ...entity,
      eventUuid: 'ev-1',
      title: 'Событие!',
      humanReadableSlug: 'event',
      publicId: 'ev1',
    })
    .run();
  db.insert(schema.pages)
    .values({ ...entity, pageUuid: 'pg-1', slug: 'page', title: 'Страница.' })
    .run();
  db.insert(schema.projectContentSections)
    .values({
      sectionUuid: 'sc-1',
      projectUuid: 'pr-1',
      title: 'Раздел. Часть первая.',
      humanReadableSlug: 'section',
      publicId: 'sc1',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 2,
    })
    .run();
  db.insert(schema.content)
    .values([
      {
        contentUuid: 'ct-1',
        ownerType: 'page',
        ownerId: 'pg-1',
        slot: 'page-body',
        data: text('А. С. Пушкин.', 'Глава 1.'),
        blockCount: 3,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        contentUuid: 'ct-2',
        ownerType: 'event',
        ownerId: 'ev-1',
        slot: 'event-body',
        data: { blocks: 'unreadable' } as never,
        createdAt: 1,
        updatedAt: 2,
      },
    ])
    .run();
  const stale = text('Пушкин. Письмо брату', 'Итоги.');
  db.insert(schema.contentHistory)
    .values({
      id: 'ch-1',
      ownerType: 'page',
      ownerRef: 'pg-1',
      slot: 'page-body',
      kind: 'draft',
      data: stale,
      digest: 'stale',
      wordCount: 6,
      blockCount: 3,
      assetCount: 0,
      size: 1,
      assetUuids: [],
      createdAt: 1,
      updatedAt: 2,
    })
    .run();
  db.insert(schema.assetUsages)
    .values([
      {
        assetUuid: 'a-1',
        containerType: 'project',
        containerId: 'pr-1',
        role: 'showcase-asset',
        meta: {
          role: 'showcase-asset',
          order: 0,
          caption: 'Кот.',
          isPrivate: false,
        },
      },
      {
        assetUuid: 'a-2',
        containerType: 'event',
        containerId: 'ev-1',
        role: 'other-asset',
        meta: {
          role: 'other-asset',
          order: 0,
          title: 'Отчёт.',
          caption: 'Первая часть. Вторая часть',
          isPrivate: false,
        },
      },
    ])
    .run();
  db.insert(schema.periods)
    .values([
      {
        ownerType: 'event',
        ownerId: 'ev-1',
        sortOrder: 0,
        startDate: '2020-01-01',
        endDate: '2020-06-01',
        label: 'Учёба',
      },
      {
        ownerType: 'event',
        ownerId: 'ev-1',
        sortOrder: 1,
        startDate: '2020-03-01',
        endDate: '2020-09-01',
        label: 'Учёба.',
      },
      {
        ownerType: 'project-section',
        ownerId: 'sc-1',
        sortOrder: 0,
        startDate: '2021-01-01',
        endDate: '2021-02-01',
        label: 'Италия.',
      },
    ])
    .run();
  db.insert(schema.statuses)
    .values({
      id: 'st-1',
      ownerType: 'profile',
      ownerId: 'profile',
      text: 'Работаю. Отдыхаю',
      createdAt: 1,
      date: '2020-01-01',
    })
    .run();
  db.insert(schema.externalLinks)
    .values({ url: 'https://example.com/', faviconKey: '', touchedAt: 1 })
    .run();
  db.insert(schema.projectExternalLinks)
    .values({
      projectUuid: 'pr-1',
      url: 'https://example.com/',
      sortOrder: 0,
      note: 'Мой профиль.',
    })
    .run();
  db.insert(schema.profileExternalLinks)
    .values({
      url: 'https://example.com/',
      name: 'Example',
      sortOrder: 0,
      note: 'Всё здесь. И даже больше',
    })
    .run();
}

async function run() {
  const log: string[] = [];
  const progress: [number, number][] = [];
  const result = await punctuateStoredTexts({
    onProgress: (done, total) => void progress.push([done, total]),
    log: (message) => log.push(message),
  });
  return { ...result, log, progress };
}

describe('settling the endings of stored texts', () => {
  it('rewrites every caption and heading as a save would', async () => {
    seed();
    const { changed, log, progress, total } = await run();

    expect(db.select().from(schema.projects).get()).toMatchObject({
      title: 'Проект',
      updatedAt: 2,
    });
    expect(db.select().from(schema.events).get()!.title).toBe('Событие!');
    expect(db.select().from(schema.pages).get()!.title).toBe('Страница');
    expect(db.select().from(schema.projectContentSections).get()!.title).toBe(
      'Раздел. Часть первая',
    );

    const [saved, unreadable] = db
      .select()
      .from(schema.content)
      .orderBy(schema.content.contentUuid)
      .all();
    expect(saved!.data.blocks.map((block) => block.data)).toEqual([
      { text: 'Глава 1', level: 2 },
      { text: 'Слова', caption: 'А. С. Пушкин', alignment: 'left' },
      { text: 'Абзац остаётся.' },
    ]);
    expect(saved!.updatedAt).toBe(2);
    expect(unreadable!.data).toEqual({ blocks: 'unreadable' });
    expect(log.some((line) => line.includes('ct-2'))).toBe(true);

    const history = db.select().from(schema.contentHistory).get()!;
    expect(history.data.blocks.map((block) => block.data)).toEqual([
      { text: 'Итоги', level: 2 },
      { text: 'Слова', caption: 'Пушкин. Письмо брату.', alignment: 'left' },
      { text: 'Абзац остаётся.' },
    ]);
    const described = describeHistoryData(history.data);
    expect(history.digest).toBe(described.digest);
    expect(history.size).toBe(described.size);

    const usages = db
      .select()
      .from(schema.assetUsages)
      .orderBy(schema.assetUsages.assetUuid)
      .all();
    expect(usages.map((usage) => usage.meta)).toEqual([
      { role: 'showcase-asset', order: 0, caption: 'Кот', isPrivate: false },
      {
        role: 'other-asset',
        order: 0,
        title: 'Отчёт',
        caption: 'Первая часть. Вторая часть.',
        isPrivate: false,
      },
    ]);

    const periods = db
      .select()
      .from(schema.periods)
      .orderBy(schema.periods.ownerType, schema.periods.sortOrder)
      .all();
    expect(
      periods.map(({ ownerId, startDate, endDate, label }) => ({
        ownerId,
        startDate,
        endDate,
        label,
      })),
    ).toEqual([
      {
        ownerId: 'ev-1',
        startDate: '2020-01-01',
        endDate: '2020-09-01',
        label: 'Учёба',
      },
      {
        ownerId: 'sc-1',
        startDate: '2021-01-01',
        endDate: '2021-02-01',
        label: 'Италия',
      },
    ]);
    expect(
      log.some((line) => line.includes('ev-1') && line.includes('2')),
    ).toBe(true);

    expect(db.select().from(schema.statuses).get()!.text).toBe(
      'Работаю. Отдыхаю.',
    );
    expect(db.select().from(schema.projectExternalLinks).get()!.note).toBe(
      'Мой профиль',
    );
    expect(db.select().from(schema.profileExternalLinks).get()!.note).toBe(
      'Всё здесь. И даже больше.',
    );

    expect(changed).toEqual({
      texts: 1,
      drafts: 1,
      files: 2,
      titles: 3,
      periods: 2,
      statuses: 1,
      links: 2,
    });
    expect(progress.at(-1)).toEqual([total, total]);
  });

  it('writes nothing the second time', async () => {
    seed();
    await run();
    const { changed } = await run();
    expect(Object.values(changed).every((value) => value === 0)).toBe(true);
  });
});
