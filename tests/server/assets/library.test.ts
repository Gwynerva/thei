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
    db.insert(schema.profileStatuses)
      .values({ id: 'status', assetUuid: 'a', text: 'Status', createdAt: 1 })
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
      entityCount: 4,
      counts: { project: 4, page: 1, tag: 1, profile: 2 },
    });
    expect(
      uses
        .filter((p) => p.source.type === 'project')
        .reduce((n, p) => n + p.count, 0),
    ).toBe(4);
    expect(uses.filter((p) => p.role === 'content')).toMatchObject([
      {
        scope: {
          kind: 'project-section',
          title: 'Details',
          url: '/projects/project-p/sections/details-s/',
        },
        isPrivate: false,
        count: 2,
      },
      {
        scope: {
          kind: 'project-section',
          title: 'Details',
          url: '/projects/project-p/sections/details-s/',
        },
        isPrivate: true,
        count: 1,
      },
    ]);
    expect(uses.find((p) => p.role === 'banner')?.scope).toEqual({
      kind: 'entity',
    });
    expect(
      uses.filter((p) => p.source.type === 'profile').map((p) => p.detail),
    ).toEqual(['avatar', 'status']);
    expect(getAssetUsages('a').asset.media?.previewSrc).toContain(
      '/preview/content',
    );
  });
  it('returns structured project-stage scopes', () => {
    db.insert(schema.projectStages)
      .values({
        stageUuid: 'stage',
        projectUuid: 'p',
        title: 'Launch',
        summary: '',
        humanReadableSlug: 'launch',
        publicId: 'st',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.content)
      .values({
        contentUuid: 'stage-content',
        ownerType: 'project-stage',
        ownerId: 'stage',
        slot: 'project-stage-body',
        data: { blocks: [] },
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.assetUsages)
      .values({
        assetUuid: 'b',
        containerType: 'content',
        containerId: 'stage-content',
        role: 'content',
      })
      .run();

    expect(getAssetUsages('b').placements).toMatchObject([
      {
        scope: {
          kind: 'project-stage',
          title: 'Launch',
          url: '/projects/project-p/stages/launch-st/',
        },
      },
    ]);
  });
  it('searches site-defined text without exposing internal previews', () => {
    expect(
      listLibrarySections({ q: 'КОСМОСА' }).items.map((g) => g.id),
    ).toEqual(['p']);
    // An editor caption belongs to the project that holds the content.
    expect(
      listLibrarySections({ q: 'фОТО луны' }).items.map((g) => g.id),
    ).toEqual(['p']);
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
      page: 3,
      pageSize: 20,
      total: 47,
    });
    expect(listLibraryAssets({ page: 3 }).items).toHaveLength(7);
    expect(listSourceAssets('unused', 'all', { page: 2 }).items).toHaveLength(
      22,
    );
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
