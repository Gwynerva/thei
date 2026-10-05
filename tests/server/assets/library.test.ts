import { beforeAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
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
  listLibrarySections,
  listSourceAssets,
  listLibraryAssets,
} from '../../../server/thei/assets/library';
import { readAssetRetention } from '../../../server/thei/assets/retention';
import {
  ASSET_ORPHAN_GRACE_MS,
  assetSelectionError,
  summarizeAssetUsages,
} from '../../../shared/asset-library';

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
    const groups = listLibrarySections().items;
    expect(groups.map((g) => `${g.type}:${g.id}:${g.count}`).sort()).toEqual([
      'page:page:1',
      'profile:me:1',
      'project-section:launch:1',
      'project-section:section:1',
      'project:p:1',
      'tag:tag:1',
    ]);
    expect(groups.find((g) => g.id === 'launch')?.parent).toEqual({
      title: 'Проект Луна',
      url: '/projects/project-p/',
    });
    // Found by its own words, not the project's; and the project group does
    // not repeat what its parts hold.
    expect(listLibrarySections({ q: 'rocket' }).items.map((g) => g.id)).toEqual(
      ['launch'],
    );
    expect(
      listSourceAssets('project-section', 'launch').items.map(
        (i) => i.asset.assetUuid,
      ),
    ).toEqual(['b']);
    expect(
      listSourceAssets('project', 'p').items.map((i) => i.asset.assetUuid),
    ).toEqual(['a']);
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
  it('searches site-defined text without exposing internal previews', () => {
    expect(
      listLibrarySections({ q: 'КОСМОСА' }).items.map((g) => g.id),
    ).toEqual(['p']);
    // An editor caption belongs to the section that holds the content.
    expect(
      listLibrarySections({ q: 'фОТО луны' }).items.map((g) => g.id),
    ).toEqual(['section']);
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
    expect(
      listSourceAssets('unused', 'all').items.map((i) => i.asset.assetUuid),
    ).toEqual(['b']);
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
        expect(
          listLibrarySections({ q }).items.map((group) => group.id),
          q,
        ).toEqual(['day']);
      expect(
        listLibraryAssets({ q: '12.05.2024' }).items.map(
          (item) => item.asset.assetUuid,
        ),
      ).toEqual(['b']);
      expect(listLibrarySections({ q: '13 мая 2024' }).items).toEqual([]);
    });

    it('never finds a diary entry by the characters of its stored date', () => {
      for (const q of ['0', '-', '24-05', '-1', '4-0'])
        expect(
          listLibrarySections({ q, source: 'diary-entry' }).items,
          q,
        ).toEqual([]);
    });

    it('lists the entities changed last first, the profile and tags after them', () => {
      expect(
        listLibrarySections().items.map((group) => `${group.type}:${group.id}`),
      ).toEqual([
        'event:event',
        'diary-entry:day',
        'page:page',
        'project:p',
        'project-section:section',
        'profile:me',
        'tag:tag',
      ]);
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
        })
        .run();
      // Files nothing holds stay on top, and are no entity to narrow to.
      expect(listLibrarySections().items[0]?.type).toBe('unused');
      expect(
        listLibrarySections({ source: 'event' }).items.map((group) => group.id),
      ).toEqual(['event']);
    });

    it('narrows the groups to one kind of entity, counting every kind', () => {
      const result = listLibrarySections({ source: 'diary-entry' });
      expect(result.items.map((group) => group.id)).toEqual(['day']);
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
        // Files of the diary entry, by kind, and every group anywhere.
        types: { image: 1 },
        anywhere: 7,
      });
      expect(
        listLibrarySections({ q: 'concert', source: 'event' }).facets,
      ).toEqual({ sources: { event: 1 }, types: { image: 1 }, anywhere: 1 });
      expect(
        listLibrarySections({ source: 'page', q: 'concert' }).items,
      ).toEqual([]);
      // A kind of file that is not there counts as nothing, not as absent.
      expect(listLibrarySections({ type: 'video' }).facets.sources).toEqual({});
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
      expect(all.facets.anywhere).toBe(2);
      expect(all.facets.sources).toMatchObject({
        'diary-entry': 1,
        event: 1,
        project: 1,
        page: 1,
      });
      expect(listLibraryAssets({ usage: 'unused' }).items).toEqual([]);
      expect(
        listLibraryAssets({ usage: 'unused' }).facets.sources.unused,
      ).toBeUndefined();
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

    const rows = db.select().from(schema.assets).all();
    const retention = readAssetRetention(rows);

    expect(retention.get('a')).toBeUndefined();
    expect(retention.get('b')).toEqual({
      deleteAfter: 10 + ASSET_ORPHAN_GRACE_MS,
    });
    expect(retention.get('held')).toEqual({ inHistory: true });
    for (const item of listLibraryAssets().items) {
      expect({
        deleteAfter: item.deleteAfter,
        inHistory: item.inHistory,
      }).toEqual({
        deleteAfter: retention.get(item.asset.assetUuid)?.deleteAfter,
        inHistory: retention.get(item.asset.assetUuid)?.inHistory,
      });
    }
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
    expect(listSourceAssets('unused', 'all', { page: 2 })).toMatchObject({
      page: 1,
      pageSize: 48,
    });
    expect(listSourceAssets('unused', 'all').items).toHaveLength(46);
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
    expect(
      listLibrarySections({ acceptedExtensions: ['pdf'] }).items,
    ).toMatchObject([{ type: 'unused', count: 1 }]);
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
