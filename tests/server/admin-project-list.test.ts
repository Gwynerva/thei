import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createApp,
  createError,
  createRouter,
  defineEventHandler,
  getQuery,
  toWebHandler,
} from 'h3';
import { freshTestDb } from '../helpers/fresh-db';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { AssetType } from '../../shared/asset';

let context: Awaited<ReturnType<typeof freshTestDb>>;
let handle: ReturnType<typeof toWebHandler>;

beforeAll(async () => {
  Object.assign(globalThis, { defineEventHandler, createError, getQuery });
  context = await freshTestDb();
  const { db, schema } = context;
  Object.assign(context.server, {
    useDb: () => context,
    projects: { count: async () => 1 },
  });
  db.insert(schema.projects)
    .values({
      projectUuid: 'project',
      publicId: 'project',
      humanReadableSlug: 'project',
      title: 'Project',
      summary: '',
      access: ProjectEventAccessLevel.Public,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.projectContentSections)
    .values({
      sectionUuid: 'section',
      projectUuid: 'project',
      title: 'Section',
      humanReadableSlug: 'section',
      publicId: 'section',
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.content)
    .values({
      contentUuid: 'section-body',
      ownerType: 'project-section',
      ownerId: 'section',
      slot: 'project-section-body',
      data: { blocks: [] },
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  const asset = (assetUuid: string, size: number) =>
    db
      .insert(schema.assets)
      .values({
        assetUuid,
        slug: assetUuid,
        extension: 'png',
        familyUuid: assetUuid,
        contentHash: assetUuid,
        settingsKey: 'original',
        type: AssetType.Image,
        size,
        touchedAt: 1,
      })
      .run();
  asset('own', 1);
  asset('banner', 10);
  asset('body', 100);
  asset('shared', 1000);
  db.insert(schema.assetUsages)
    .values([
      {
        assetUuid: 'own',
        containerType: 'project',
        containerId: 'project',
        role: 'other-asset',
      },
      {
        assetUuid: 'shared',
        containerType: 'project',
        containerId: 'project',
        role: 'showcase-asset',
      },
      {
        assetUuid: 'banner',
        containerType: 'project-section',
        containerId: 'section',
        role: 'banner',
      },
      {
        assetUuid: 'body',
        containerType: 'content',
        containerId: 'section-body',
        role: 'content',
      },
      // One file in two places of a project counts once.
      {
        assetUuid: 'shared',
        containerType: 'content',
        containerId: 'section-body',
        role: 'content',
      },
    ])
    .run();
  const list = (await import('../../server/api/admin/projects/index.get'))
    .default;
  handle = toWebHandler(createApp().use(createRouter().get('/projects', list)));
});
afterAll(async () => {
  await context.close();
  vi.unstubAllGlobals();
});

describe('the admin list of projects', () => {
  it("counts the files of a project's sections in its size", async () => {
    const result = await (
      await handle(new Request('http://localhost/projects'))
    ).json();
    expect(result.items).toEqual([
      expect.objectContaining({ projectUuid: 'project', totalSize: 1111 }),
    ]);
  });
});
