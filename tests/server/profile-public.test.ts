import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp, createRouter, defineEventHandler, toWebHandler } from 'h3';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { freshTestDb } from '../helpers/fresh-db';
import {
  buildPublicProjectReference,
  buildPublicProjectSummary,
} from '../../server/thei/public/entities';

vi.mock('../../server/thei/profile', () => ({
  getPinnedPages: vi.fn(async () => []),
  getProfileHistory: vi.fn(async () => ({ items: [], total: 0 })),
  getProfileIdentity: vi.fn(async () => ({
    profile: {
      displayName: 'Profile',
      slogan: '',
      nickname: '',
      birthDate: '',
      facts: [],
    },
    avatarMedia: { src: '/avatar', kind: 'image' },
  })),
  getProfileLinks: vi.fn(async () => []),
}));
vi.mock('../../server/thei/public/content', () => ({
  buildPublicContentData: vi.fn(async () => undefined),
}));
vi.mock('../../server/thei/public/entities', () => ({
  buildPublicEventSummary: vi.fn(),
  buildPublicProjectReference: vi.fn(async (row) => ({
    title: row.title,
    summary: row.summary,
    href: row.projectUuid,
    iconMedia: { src: `/icon/${row.projectUuid}`, kind: 'image' },
  })),
  buildPublicProjectSummary: vi.fn(async (row) => ({
    href: row.projectUuid,
  })),
  buildPublicTagListItems: vi.fn(async () => []),
  canListPublicEntity: vi.fn(
    (access, isAdmin) => isAdmin || access === 'public',
  ),
}));

let context: Awaited<ReturnType<typeof freshTestDb>>;
let handle: ReturnType<typeof toWebHandler>;

function insertProjects(showcaseCount: number, privateCount = 0) {
  const { db, schema } = context;
  db.transaction((tx) => {
    for (let index = 0; index < showcaseCount + privateCount; index++) {
      const id = `showcase-${String(index).padStart(2, '0')}`;
      tx.insert(schema.projects)
        .values({
          projectUuid: id,
          publicId: id,
          humanReadableSlug: id,
          title: id,
          summary: id,
          access:
            index < showcaseCount
              ? ProjectEventAccessLevel.Public
              : ProjectEventAccessLevel.Private,
          showcase: true,
          createdAt: index,
          updatedAt: index,
        })
        .run();
    }
  });
}

beforeAll(async () => {
  Object.assign(globalThis, { defineEventHandler });
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    isAdmin: async () => false,
  });
  const profile = (await import('../../server/api/profile/index.get')).default;
  handle = toWebHandler(
    createApp().use(createRouter().get('/profile', profile)),
  );
});

afterAll(async () => {
  await context.close();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  context.db.delete(context.schema.projects).run();
  vi.clearAllMocks();
});

describe('public profile showcase projects', () => {
  it('hydrates no more than twelve unique, public showcase projects per request', async () => {
    insertProjects(20, 3);

    const first = await (
      await handle(new Request('http://localhost/profile'))
    ).json();
    const second = await (
      await handle(new Request('http://localhost/profile'))
    ).json();
    const firstIds = first.showcaseProjects.map((item: any) => item.href);
    const secondIds = second.showcaseProjects.map((item: any) => item.href);

    expect(firstIds).toHaveLength(12);
    expect(new Set(firstIds).size).toBe(12);
    expect(firstIds.every((id: string) => !id.startsWith('showcase-2'))).toBe(
      true,
    );
    expect(secondIds).toHaveLength(12);
    expect(secondIds).not.toEqual(firstIds);
    expect(buildPublicProjectReference).toHaveBeenCalledTimes(24);
    // The three most recently updated projects are private: they are listed
    // as secrets, counted, and never hydrated.
    expect(buildPublicProjectSummary).not.toHaveBeenCalled();
    expect(first.projects.count).toBe(23);
    expect(first.projects.items).toHaveLength(3);
    for (const item of first.projects.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['iconMedia', 'key', 'secret', 'summary', 'title'].sort(),
      );
      expect(item.title).toMatch(/^Secret project /);
      expect(JSON.stringify(item)).not.toContain('showcase-');
    }
  });

  it('returns every available showcase project when fewer than twelve exist', async () => {
    insertProjects(5, 2);
    const result = await (
      await handle(new Request('http://localhost/profile'))
    ).json();

    expect(result.showcaseProjects).toHaveLength(5);
    expect(
      new Set(result.showcaseProjects.map((item: any) => item.href)).size,
    ).toBe(5);
    expect(buildPublicProjectReference).toHaveBeenCalledTimes(5);
  });
});
