import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from 'drizzle-kit/api';
import { schema } from '../../../server/thei/db/schema';
import { AssetType } from '../../../shared/asset';
import { createOriginalAssetSettings } from '../../../shared/asset-upload-settings';
import {
  getAssetUsages,
  getLibraryAvailability,
  listLibraryFeed,
  listLibraryAssets,
  type LibraryFeedQuery,
} from '../../../server/thei/assets/library';
import { readAssetRetention } from '../../../server/thei/assets/retention';
import { readLibrarySearch } from '../../../shared/asset-library-search';
import {
  ASSET_ORPHAN_GRACE_MS,
  assetSelectionError,
  summarizeAssetUsages,
} from '../../../shared/asset-library';

/** The places of the library's run, each once, in the order it reaches them. */
function placesOf(query: LibraryFeedQuery = {}) {
  return [
    ...new Set(
      listLibraryFeed(query).entries.map(
        (entry) => `${entry.place.type}:${entry.place.id}`,
      ),
    ),
  ];
}
/** The files the run shows in one place. */
function filesIn(type: string, id: string, query: LibraryFeedQuery = {}) {
  return listLibraryFeed(query)
    .entries.filter(
      (entry) => entry.place.type === type && entry.place.id === id,
    )
    .map((entry) => entry.asset.assetUuid);
}

describe('asset library', () => {
  let sql: string[];
  let raw: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  beforeAll(async () => {
    sql = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson(schema),
    );
  });
  beforeEach(() => {
    raw = new Database(':memory:');
    for (const statement of sql) raw.exec(statement);
    db = drizzle(raw, { schema });
    (globalThis as any).THEI_SERVER = {
      useDb: () => ({ rawDb: raw, db, schema }),
    };
    db.insert(schema.projects)
      .values({
        projectUuid: 'p',
        publicId: 'p',
        humanReadableSlug: 'project',
        title: 'Проект Луна',
        summary: 'Описание космоса',
        access: 'public' as any,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.pages)
      .values({
        pageUuid: 'page',
        slug: 'page',
        title: 'Page',
        summary: '',
        access: 'public' as any,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.profiles)
      .values({ profileId: 'me', displayName: 'Owner' })
      .run();
    db.insert(schema.tags)
      .values({
        tagUuid: 'tag',
        title: 'Tag',
        normalizedTitle: 'tag',
        slug: 'tag',
        publicId: 'tag',
      })
      .run();
    db.insert(schema.projectContentSections)
      .values({
        sectionUuid: 'section',
        projectUuid: 'p',
        title: 'Details',
        humanReadableSlug: 'details',
        publicId: 's',
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.content)
      .values({
        contentUuid: 'c',
        ownerType: 'project-section',
        ownerId: 'section',
        slot: 'project-section-body',
        data: {
          blocks: [
            {
              id: '1',
              type: 'contentMedia',
              data: { asset: { assetUuid: 'a' }, caption: 'Фото <b>Луны</b>' },
            },
          ],
        },
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    for (const [id, internal] of [
      ['a', false],
      ['b', false],
      ['preview', true],
    ] as const) {
      db.insert(schema.assets)
        .values({
          assetUuid: id,
          slug: id,
          extension: 'webp',
          familyUuid: id,
          contentHash: id.repeat(64),
          settingsKey: id,
          settings: internal ? null : createOriginalAssetSettings(),
          type: AssetType.Image,
          size: 100,
          touchedAt: 10,
          meta: {},
        })
        .run();
    }
    db.insert(schema.profileAvatars)
      .values({ id: 'avatar', assetUuid: 'a', createdAt: 1 })
      .run();
    db.insert(schema.statuses)
      .values({
        id: 'status',
        ownerType: 'profile',
        // The owner is the real profile row, not a fixed literal: the library
        // now joins the status to its owner instead of cross-joining.
        ownerId: 'me',
        assetUuid: 'a',
        text: 'Status',
        createdAt: 1,
      })
      .run();
    db.insert(schema.assetUsages)
      .values([
        {
          assetUuid: 'a',
          containerType: 'project',
          containerId: 'p',
          role: 'banner',
        },
        {
          assetUuid: 'a',
          containerType: 'page',
          containerId: 'page',
          role: 'icon',
        },
        {
          assetUuid: 'a',
          containerType: 'tag',
          containerId: 'tag',
          role: 'icon',
        },
        {
          assetUuid: 'a',
          containerType: 'profile-avatar',
          containerId: 'avatar',
          role: 'icon',
        },
        {
          assetUuid: 'a',
          containerType: 'profile-status',
          containerId: 'status',
          role: 'icon',
        },
        {
          assetUuid: 'a',
          containerType: 'content',
          containerId: 'c',
          role: 'content',
          meta: {
            role: 'content',
            isPrivate: true,
            refs: [
              { blockId: '1', blockType: 'contentMedia', isPrivate: false },
              { blockId: '2', blockType: 'contentMedia', isPrivate: false },
              { blockId: '3', blockType: 'contentGallery', isPrivate: true },
            ],
          },
        },
        {
          assetUuid: 'preview',
          containerType: 'asset',
          containerId: 'a',
          role: 'preview',
        },
      ])
      .run();
  });
  afterEach(() => {
    raw.close();
    delete (globalThis as any).THEI_SERVER;
  });
  it('counts placements while retaining unique entities, roles and private occurrences', () => {
    const uses = getAssetUsages('a').placements;
    expect(summarizeAssetUsages(uses)).toEqual({
      entityCount: 5,
      counts: {
        project: 1,
        'project-section': 3,
        page: 1,
        tag: 1,
        profile: 2,
      },
    });
    // A section holds its own files: the project group keeps only the banner.
    expect(
      uses
        .filter((p) => p.source.type === 'project')
        .reduce((n, p) => n + p.count, 0),
    ).toBe(1);
    const section = {
      type: 'project-section',
      id: 'section',
      title: 'Details',
      url: '/projects/project-p/sections/details-s/',
      editUrl: '/admin/projects/p/edit/?section=s',
      parent: { title: 'Проект Луна', url: '/projects/project-p/' },
    };
    expect(uses.filter((p) => p.role === 'content')).toMatchObject([
      { source: section, isPrivate: false, count: 2 },
      { source: section, isPrivate: true, count: 1 },
    ]);
    expect(uses.find((p) => p.role === 'banner')?.source).not.toHaveProperty(
      'parent',
    );
    expect(
      uses.filter((p) => p.source.type === 'profile').map((p) => p.detail),
    ).toEqual(['avatar', 'status']);
    expect(getAssetUsages('a').asset.media?.previewSrc).toContain(
      '/preview/content',
    );
  });
  function addLaunch(isPrivate = false) {
    db.insert(schema.projectContentSections)
      .values({
        sectionUuid: 'launch',
        projectUuid: 'p',
        title: 'Launch',
        summary: 'Rocket day',
        humanReadableSlug: 'launch',
        publicId: 'ls',
        isPrivate,
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.content)
      .values({
        contentUuid: 'launch-content',
        ownerType: 'project-section',
        ownerId: 'launch',
        slot: 'project-section-body',
        data: { blocks: [] },
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.assetUsages)
      .values({
        assetUuid: 'b',
        containerType: 'content',
        containerId: 'launch-content',
        role: 'content',
      })
      .run();
  }
  it('lists a section as a source of its own, named with its project', () => {
    addLaunch();

    expect(getAssetUsages('b').placements).toMatchObject([
      {
        source: {
          type: 'project-section',
          id: 'launch',
          title: 'Launch',
          summary: 'Rocket day',
          url: '/projects/project-p/sections/launch-ls/',
          editUrl: '/admin/projects/p/edit/?section=ls',
          parent: { title: 'Проект Луна', url: '/projects/project-p/' },
        },
        isPrivate: false,
      },
    ]);
    // The section took the only file nothing used, so no "unused" group is left.
    expect(placesOf().sort()).toEqual([
      'page:page',
      'profile:me',
      'project-section:launch',
      'project-section:section',
      'project:p',
      'tag:tag',
    ]);
    expect(
      listLibraryFeed().entries.find((e) => e.place.id === 'launch')?.place
        .parent,
    ).toEqual({ title: 'Проект Луна', url: '/projects/project-p/' });
    // Found by its own words, not the project's; and the project does not
    // repeat what its parts hold.
    expect(placesOf({ q: 'rocket' })).toEqual(['project-section:launch']);
    // A place named by the search comes first, marked so, before the run:
    // here the section, though its project's own file was touched later.
    const named = listLibraryFeed({ q: 'Launch' }).entries;
    expect(named[0]?.place).toMatchObject({ id: 'launch', named: true });
    expect(
      listLibraryFeed({ q: 'Луна' }).entries.map((e) => [
        e.place.id,
        e.place.named,
      ]),
    ).toEqual([
      ['p', true],
      ['section', true],
    ]);
    expect(filesIn('project-section', 'launch')).toEqual(['b']);
    expect(filesIn('project', 'p')).toEqual(['a']);
  });
  it('keeps a section private when it or its project is', () => {
    addLaunch(true);
    expect(getAssetUsages('b').placements[0]?.isPrivate).toBe(true);

    db.update(schema.projectContentSections).set({ isPrivate: false }).run();
    expect(getAssetUsages('b').placements[0]?.isPrivate).toBe(false);

    db.update(schema.projects)
      .set({ access: 'private' as any })
      .run();
    expect(getAssetUsages('b').placements[0]?.isPrivate).toBe(true);
  });
  it('finds a file of a group by its own words and by the group’s title', () => {
    addLaunch();
    db.update(schema.content)
      .set({
        data: {
          blocks: [
            {
              type: 'contentFileGroup',
              data: {
                title: 'Бумаги полёта',
                items: [
                  {
                    id: 'f1',
                    asset: { assetUuid: 'b' },
                    title: 'Билет',
                    caption: 'Купленный <b>заранее</b>',
                  },
                ],
              },
            },
          ],
        } as never,
      })
      .where(eq(schema.content.contentUuid, 'launch-content'))
      .run();
    for (const q of ['билет', 'купленный заранее', 'бумаги'])
      expect(
        listLibraryAssets({ q }).items.map((i) => i.asset.assetUuid),
      ).toEqual(['b']);
  });

  it('searches site-defined text without exposing internal previews', () => {
    expect(placesOf({ q: 'КОСМОСА' })).toEqual(['project:p']);
    // An editor caption belongs to the section that holds the content.
    expect(placesOf({ q: 'Луны' })).toContain('project-section:section');
    // «фото» is any picture or the word itself: the moon project's banner
    // and the section's captioned photo both answer.
    expect(placesOf({ q: 'фОТО луны' })).toEqual([
      'project:p',
      'project-section:section',
    ]);
    expect(
      listLibraryAssets({ q: 'фОТО луны' }).items.map((i) => i.asset.assetUuid),
    ).toEqual(['a']);
    expect(
      listLibraryAssets({ q: 'status' }).items.map((i) => i.asset.assetUuid),
    ).toEqual(['a']);
    // Nothing about the uploaded file itself is searchable.
    expect(listLibraryAssets({ q: 'webp' }).items).toEqual([]);
    expect(listLibraryAssets().items.map((i) => i.asset.assetUuid)).toEqual([
      'a',
      'b',
    ]);
    expect(
      listLibraryAssets().items.map((i) => [i.asset.assetUuid, i.deleteAfter]),
    ).toEqual([
      ['a', undefined],
      ['b', 10 + ASSET_ORPHAN_GRACE_MS],
    ]);
    expect(
      listLibraryAssets({ usage: 'unused' }).items.map(
        (i) => i.asset.assetUuid,
      ),
    ).toEqual(['b']);
    expect(filesIn('unused', 'all')).toEqual(['b']);
  });
  describe('diary entries, kinds of entity and their order', () => {
    beforeEach(() => {
      db.insert(schema.diaryEntries)
        .values({
          diaryUuid: 'day',
          date: '2024-05-12',
          access: 'public' as any,
          createdAt: 1,
          updatedAt: 5,
        })
        .run();
      db.insert(schema.events)
        .values({
          eventUuid: 'event',
          title: 'Concert',
          summary: '',
          access: 'public' as any,
          humanReadableSlug: 'concert',
          publicId: 'e',
          createdAt: 1,
          updatedAt: 9,
        })
        .run();
      db.insert(schema.content)
        .values({
          contentUuid: 'diary-body',
          ownerType: 'diary-entry',
          ownerId: 'day',
          slot: 'diary-body',
          data: { blocks: [] },
          createdAt: 1,
          updatedAt: 1,
        })
        .run();
      db.insert(schema.assetUsages)
        .values([
          {
            assetUuid: 'b',
            containerType: 'content',
            containerId: 'diary-body',
            role: 'content',
          },
          {
            assetUuid: 'b',
            containerType: 'event',
            containerId: 'event',
            role: 'banner',
          },
        ])
        .run();
    });

    it('finds the files of a diary entry by its day, written in any way', () => {
      for (const q of ['12 мая 2024', 'may 2024', '12.05.2024', '2024-05'])
        expect(placesOf({ q }), q).toEqual(['diary-entry:day']);
      expect(
        listLibraryAssets({ q: '12.05.2024' }).items.map(
          (item) => item.asset.assetUuid,
        ),
      ).toEqual(['b']);
      expect(placesOf({ q: '13 мая 2024' })).toEqual([]);
    });

    it('never finds a diary entry by the characters of its stored date', () => {
      for (const q of ['0', '-', '24-05', '-1', '4-0'])
        expect(placesOf({ q, source: 'diary-entry' }), q).toEqual([]);
    });

    it('runs through places by their days, the newest first, those without a day last', () => {
      const template = db
        .select()
        .from(schema.assets)
        .all()
        .find((asset) => asset.assetUuid === 'b')!;
      // Diary entries changed in an order of their own, not their days'.
      for (const [id, date, updatedAt] of [
        ['old', '2019-03-02', 99],
        ['mid', '2022-11-30', 1],
        ['new', '2025-01-15', 50],
      ] as const) {
        db.insert(schema.diaryEntries)
          .values({
            diaryUuid: id,
            date,
            access: 'public' as any,
            createdAt: 1,
            updatedAt,
          })
          .run();
        db.insert(schema.assets)
          .values({ ...template, assetUuid: id, slug: id, familyUuid: id })
          .run();
        db.insert(schema.assetUsages)
          .values({
            assetUuid: id,
            containerType: 'diary-entry',
            containerId: id,
            role: 'banner',
          })
          .run();
      }
      // The concert ran over two stretches: it stands at its first day.
      db.insert(schema.periods)
        .values([
          {
            ownerType: 'event',
            ownerId: 'event',
            sortOrder: 0,
            startDate: '2023-07-01',
            endDate: '2023-07-02',
          },
          {
            ownerType: 'event',
            ownerId: 'event',
            sortOrder: 1,
            startDate: '2024-09-01',
            endDate: '2024-09-01',
          },
        ])
        .run();
      // A section's day is its own; an undated one takes its project's.
      db.insert(schema.periods)
        .values({
          ownerType: 'project-section',
          ownerId: 'section',
          sortOrder: 0,
          startDate: '2021-04-10',
          endDate: '2021-05-10',
        })
        .run();
      const dated = [
        'diary-entry:new',
        'diary-entry:day',
        'event:event',
        'diary-entry:mid',
        'project-section:section',
        'project:p',
        'diary-entry:old',
      ];
      const undated = ['page:page', 'profile:me', 'tag:tag'];
      const newest = placesOf();
      expect(newest.slice(0, dated.length)).toEqual(
        // The project stands at its first dated section, the same day.
        [
          ...dated.slice(0, 4),
          'project:p',
          'project-section:section',
          dated[6],
        ],
      );
      expect(newest.slice(dated.length).sort()).toEqual(undated);
      const oldest = placesOf({ order: 'old' });
      expect(oldest.slice(0, dated.length)).toEqual([
        'diary-entry:old',
        'project:p',
        'project-section:section',
        'diary-entry:mid',
        'event:event',
        'diary-entry:day',
        'diary-entry:new',
      ]);
      expect(oldest.slice(dated.length).sort()).toEqual(undated);
      // Diary entries alone come in the calendar's order, either way.
      expect(placesOf({ source: 'diary-entry' })).toEqual([
        'diary-entry:new',
        'diary-entry:day',
        'diary-entry:mid',
        'diary-entry:old',
      ]);
      expect(
        listLibraryFeed({ source: 'diary-entry' }).entries.map(
          (entry) => entry.place.date,
        ),
      ).toEqual(['2025-01-15', '2024-05-12', '2022-11-30', '2019-03-02']);
      // A jump to a year starts the run at its first place.
      const jump = listLibraryFeed({ year: '2022' });
      expect(jump.offset).toBe(3);
      expect(jump.entries[0]?.place.id).toBe('mid');
      expect(listLibraryFeed({ year: '2022', order: 'old' }).offset).toBe(3);
      const head = listLibraryFeed({ head: true });
      expect(head.years?.map((year) => year.year)).toEqual([
        '2025',
        '2024',
        '2023',
        '2022',
        '2021',
        '2019',
        '',
      ]);
    });

    it('stands a file nothing holds at the day it was uploaded', () => {
      const template = db
        .select()
        .from(schema.assets)
        .all()
        .find((asset) => asset.assetUuid === 'b')!;
      db.insert(schema.assets)
        .values({
          ...template,
          assetUuid: 'loose',
          slug: 'loose',
          familyUuid: 'loose',
          createdAt: Date.parse('2026-11-08T12:00:00Z'),
        })
        .run();
      expect(placesOf()[0]).toBe('unused:all');
      expect(
        listLibraryFeed().entries.find((e) => e.asset.assetUuid === 'loose')
          ?.place.date,
      ).toBe('2026-11-08');
      // «вчера» is the day of the upload.
      vi.useFakeTimers({
        toFake: ['Date'],
        now: Date.parse('2026-11-09T10:00:00Z'),
      });
      try {
        expect(
          listLibraryFeed({ q: 'вчера' }).entries.map((e) => e.asset.assetUuid),
        ).toEqual(['loose']);
      } finally {
        vi.useRealTimers();
      }
      expect(placesOf({ source: 'event' })).toEqual(['event:event']);
    });

    it('dates an upload by the reader’s own day, in its heading and in a search', () => {
      const template = db
        .select()
        .from(schema.assets)
        .all()
        .find((asset) => asset.assetUuid === 'b')!;
      // 00:30 on 9 November at UTC+3, still 8 November in UTC.
      db.insert(schema.assets)
        .values({
          ...template,
          assetUuid: 'late',
          slug: 'late',
          familyUuid: 'late',
          createdAt: Date.parse('2026-11-08T21:30:00Z'),
        })
        .run();
      const dayOf = (query: LibraryFeedQuery) =>
        listLibraryFeed(query).entries.find((e) => e.asset.assetUuid === 'late')
          ?.place.date;
      const found = (query: LibraryFeedQuery) =>
        listLibraryFeed(query).entries.map((e) => e.asset.assetUuid);
      vi.useFakeTimers({
        toFake: ['Date'],
        now: Date.parse('2026-11-09T10:00:00Z'),
      });
      try {
        expect(dayOf({ utcOffset: 180 })).toBe('2026-11-09');
        expect(found({ q: 'сегодня', utcOffset: 180 })).toEqual(['late']);
        expect(found({ q: 'вчера', utcOffset: 180 })).toEqual([]);
        expect(found({ q: '9 ноября 2026', utcOffset: 180 })).toEqual(['late']);
        // At UTC it was the day before; west of it, too.
        expect(dayOf({})).toBe('2026-11-08');
        expect(found({ q: 'вчера' })).toEqual(['late']);
        expect(dayOf({ utcOffset: -300 })).toBe('2026-11-08');
        // A month turns by the reader's calendar as well.
        db.update(schema.assets)
          .set({ createdAt: Date.parse('2026-10-31T22:00:00Z') })
          .where(eq(schema.assets.assetUuid, 'late'))
          .run();
        expect(dayOf({ utcOffset: 180 })).toBe('2026-11-01');
        expect(dayOf({})).toBe('2026-10-31');
        // So does today: just after midnight at UTC+3, an upload of that
        // afternoon was yesterday.
        db.update(schema.assets)
          .set({ createdAt: Date.parse('2026-10-31T12:00:00Z') })
          .where(eq(schema.assets.assetUuid, 'late'))
          .run();
        vi.setSystemTime(Date.parse('2026-10-31T21:10:00Z'));
        expect(found({ q: 'вчера', utcOffset: 180 })).toEqual(['late']);
        expect(found({ q: 'сегодня', utcOffset: 180 })).toEqual([]);
        expect(found({ q: 'сегодня' })).toEqual(['late']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('never hides a file whose own words are the ones read as a filter', () => {
      // A picture whose caption speaks of yesterday, of a video and of a diary.
      db.update(schema.content)
        .set({
          data: {
            blocks: [
              {
                id: '1',
                type: 'contentMedia',
                data: {
                  asset: { assetUuid: 'a' },
                  caption: 'Вчера смотрели видео, pdf и дневник, март 2020',
                },
              },
            ],
          } as never,
        })
        .where(eq(schema.content.contentUuid, 'c'))
        .run();
      for (const q of [
        'вчера',
        'видео',
        'pdf',
        'дневник',
        'март 2020',
        'видео вчера',
        'дневник pdf март 2020',
      ])
        expect(filesIn('project-section', 'section', { q }), q).toEqual(['a']);
      // The words a filter reads stay words for the rest: no caption says
      // «аудио», and no file is a recording.
      expect(filesIn('project-section', 'section', { q: 'аудио' })).toEqual([]);
      // Words that only resemble a filter are plain words.
      for (const q of ['в виде', 'фотограф', 'разделить', 'скан'])
        expect(readLibrarySearch(q).parts, q).toEqual([]);
    });

    it('puts what is being edited, and what it is related to, above the run', () => {
      db.insert(schema.entityRelations)
        .values({
          relationUuid: 'r',
          firstType: 'event',
          firstId: 'event',
          secondType: 'project',
          secondId: 'p',
          type: 'related',
          firstSortOrder: 0,
          secondSortOrder: 0,
        } as never)
        .run();
      const head = listLibraryFeed({
        head: true,
        here: { type: 'event', id: 'event' },
      });
      expect(head.here?.map((e) => e.asset.assetUuid)).toEqual(['b', 'a']);
      expect(head.here?.[0]?.place).toMatchObject({ type: 'event' });
      // Lately used files, the last first.
      db.update(schema.assets)
        .set({ touchedAt: 30 })
        .where(eq(schema.assets.assetUuid, 'a'))
        .run();
      expect(
        listLibraryFeed({ head: true }).recent?.map((i) => i.asset.assetUuid),
      ).toEqual(['a', 'b']);
      // Neither stands above a search.
      const searched = listLibraryFeed({
        head: true,
        q: 'concert',
        here: { type: 'event', id: 'event' },
      });
      expect(searched.here).toBeUndefined();
      expect(searched.recent).toBeUndefined();
    });

    it('narrows the run to one kind of entity, counting every kind', () => {
      const result = listLibraryFeed({ source: 'diary-entry', head: true });
      expect(result.entries.map((entry) => entry.place.id)).toEqual(['day']);
      expect(result.total).toBe(1);
      expect(result.facets).toEqual({
        sources: {
          project: 1,
          'project-section': 1,
          event: 1,
          page: 1,
          'diary-entry': 1,
          tag: 1,
          profile: 1,
        },
        // Files of the diary entry, by kind, and every file anywhere.
        types: { image: 1 },
        anywhere: 2,
      });
      expect(
        listLibraryFeed({ q: 'concert', source: 'event', head: true }).facets,
      ).toEqual({
        sources: { event: 1 },
        types: { image: 1 },
        anywhere: 1,
      });
      expect(listLibraryFeed({ source: 'page', q: 'concert' }).entries).toEqual(
        [],
      );
      // A kind of file that is not there counts as nothing, not as absent.
      expect(
        listLibraryFeed({ type: 'video', head: true }).facets!.sources,
      ).toEqual({});
    });

    it('narrows the flat list to a kind of entity, or to where nothing holds a file', () => {
      expect(
        listLibraryAssets({ source: 'diary-entry' }).items.map(
          (item) => item.asset.assetUuid,
        ),
      ).toEqual(['b']);
      expect(
        listLibraryAssets({ source: 'profile' as never }).items,
      ).toHaveLength(1);
      const all = listLibraryAssets();
      expect(all.total).toBe(2);
      expect(all).not.toHaveProperty('facets');
      expect(listLibraryAssets({ usage: 'unused' }).items).toEqual([]);
    });
  });
  it('tells which files cleanup will take, the same for the editor as for the library', () => {
    db.insert(schema.assets)
      .values({
        assetUuid: 'held',
        slug: 'held',
        extension: 'webp',
        familyUuid: 'held',
        contentHash: 'h'.repeat(64),
        settingsKey: 'original',
        settings: createOriginalAssetSettings(),
        type: AssetType.Image,
        size: 100,
        touchedAt: 20,
        meta: {},
      })
      .run();
    db.insert(schema.contentHistory)
      .values({
        id: 'version',
        ownerType: 'project-section',
        ownerRef: 'section',
        slot: 'project-section-body',
        kind: 'revision',
        data: { blocks: [] },
        digest: 'd',
        wordCount: 0,
        blockCount: 0,
        assetCount: 1,
        size: 0,
        assetUuids: ['held'],
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    // A banner an applied AI update replaced: only the undo still needs it.
    db.insert(schema.assets)
      .values({
        assetUuid: 'by-ai',
        slug: 'by-ai',
        extension: 'webp',
        familyUuid: 'by-ai',
        contentHash: 'i'.repeat(64),
        settingsKey: 'original',
        settings: createOriginalAssetSettings(),
        type: AssetType.Image,
        size: 100,
        touchedAt: 20,
        meta: {},
      })
      .run();
    raw
      .prepare(
        "INSERT INTO `ai-actions` (actionUuid, sessionUuid, kind, payload, certainty, state, fingerprint, assetUuids, createdAt) VALUES ('aia-1', 's', 'update', '{}', 'sure', 'applied', 'f', '[\"by-ai\"]', 1)",
      )
      .run();

    const rows = db.select().from(schema.assets).all();
    const retention = readAssetRetention(rows);

    expect(retention.get('a')).toBeUndefined();
    expect(retention.get('b')).toEqual({
      deleteAfter: 10 + ASSET_ORPHAN_GRACE_MS,
    });
    expect(retention.get('held')).toEqual({ inHistory: true });
    expect(retention.get('by-ai')).toEqual({ heldByAi: true });
    for (const item of listLibraryAssets().items) {
      expect({
        deleteAfter: item.deleteAfter,
        inHistory: item.inHistory,
        heldByAi: item.heldByAi,
      }).toEqual({
        deleteAfter: retention.get(item.asset.assetUuid)?.deleteAfter,
        inHistory: retention.get(item.asset.assetUuid)?.inHistory,
        heldByAi: retention.get(item.asset.assetUuid)?.heldByAi,
      });
    }
    // The file's window says what keeps it, as the library does.
    expect(getAssetUsages('held')).toMatchObject({ inHistory: true });
    expect(getAssetUsages('by-ai')).toMatchObject({ heldByAi: true });
    expect(getAssetUsages('by-ai').inHistory).toBeUndefined();
  });
  it('puts a variant before the file it was made from, however they were stored and touched', () => {
    // An upload stores the variant a moment before its original, and `a`
    // was picked since: the variant still stands first, the family together.
    db.update(schema.assets)
      .set({ createdAt: 2_000, touchedAt: 50 })
      .where(eq(schema.assets.assetUuid, 'a'))
      .run();
    db.insert(schema.assets)
      .values({
        assetUuid: 'a-small',
        slug: 'a-small',
        extension: 'webp',
        familyUuid: 'a',
        contentHash: 'c'.repeat(64),
        settingsKey: 'small',
        settings: {
          type: 'image-transform',
          format: 'avif',
          quality: 75,
          dimensions: { width: 320, height: 200 },
        } as never,
        type: AssetType.Image,
        size: 50,
        touchedAt: 20,
        createdAt: 1_000,
        meta: {},
      })
      .run();
    db.insert(schema.assetUsages)
      .values({
        assetUuid: 'a-small',
        containerType: 'page',
        containerId: 'page',
        role: 'icon',
      })
      .run();
    expect(filesIn('page', 'page')).toEqual(['a-small', 'a']);
  });

  it('paginates deterministically and does not touch assets while browsing', () => {
    const template = db
      .select()
      .from(schema.assets)
      .all()
      .find((a) => a.assetUuid === 'b')!;
    for (let n = 0; n < 45; n++)
      db.insert(schema.assets)
        .values({
          ...template,
          assetUuid: 'extra-' + n.toString().padStart(2, '0'),
          slug: 'extra-' + n,
          familyUuid: 'extra-' + n,
        })
        .run();
    expect(listLibraryAssets({ page: 999 })).toMatchObject({
      page: 2,
      pageSize: 40,
      total: 47,
    });
    expect(listLibraryAssets({ page: 2 }).items).toHaveLength(7);
    const unused = listLibraryFeed({ usage: 'unused' });
    expect(unused).toMatchObject({ offset: 0, total: 46 });
    expect(unused.entries).toHaveLength(46);
    expect(
      listLibraryFeed({ usage: 'unused', offset: 40 }).entries.map(
        (entry) => entry.asset.assetUuid,
      ),
    ).toEqual(unused.entries.slice(40).map((entry) => entry.asset.assetUuid));
    expect(
      db
        .select()
        .from(schema.assets)
        .all()
        .every((a) => a.touchedAt === 10),
    ).toBe(true);
  });
  it('uses the same size and type constraints for existing assets, including archived originals', () => {
    const file = {
      type: AssetType.Other,
      extension: 'zip',
      size: 10,
      meta: { archivedOriginal: { extension: 'pdf', size: 1000 } },
    };
    expect(assetSelectionError(file, { maxSize: 100 })).toBe('size');
    expect(assetSelectionError(file, { sizeLimitPolicy: 'media' })).toBe(
      'type',
    );
    expect(
      assetSelectionError(file, { maxSize: 1000, acceptedExtensions: ['zip'] }),
    ).toBeUndefined();
    expect(
      assetSelectionError(
        { ...file, type: AssetType.Image, extension: 'webp' },
        { acceptedExtensions: ['png'] },
      ),
    ).toBe('type');
  });
  it('filters incompatible types before counts but keeps oversized variants available', () => {
    const template = db
      .select()
      .from(schema.assets)
      .all()
      .find((asset) => asset.assetUuid === 'b')!;
    db.insert(schema.assets)
      .values({
        ...template,
        assetUuid: 'document',
        slug: 'document',
        familyUuid: 'document',
        extension: 'pdf',
        type: AssetType.Other,
        size: 2_000,
        meta: {},
      })
      .run();

    expect(
      listLibraryAssets({
        acceptedExtensions: ['webp'],
        maxSize: 1,
      }).items.map((item) => item.asset.assetUuid),
    ).toEqual(['a', 'b']);
    // What the selection cannot take is not listed at all.
    expect(
      listLibraryFeed({ acceptedExtensions: ['pdf'] }).entries.map(
        (entry) => `${entry.place.type}:${entry.asset.assetUuid}`,
      ),
    ).toEqual(['unused:document']);
    expect(getLibraryAvailability({ acceptedExtensions: ['pdf'] })).toEqual({
      total: 1,
      types: { other: 1 },
    });
    expect(getLibraryAvailability()).toEqual({
      total: 3,
      types: { image: 2, other: 1 },
    });
  });
});
