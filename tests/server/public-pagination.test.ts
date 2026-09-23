import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createError,
  getQuery,
  getRouterParam,
  defineEventHandler,
  createApp,
  createRouter,
  toWebHandler,
} from 'h3';
import { freshTestDb } from '../helpers/fresh-db';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import {
  buildPublicProjectSummary,
  buildPublicEventSummary,
  buildPublicTagListItems,
} from '../../server/thei/public/entities';

vi.mock('../../server/thei/public/entities', () => ({
  canListPublicEntity: (access: string, isAdmin: boolean) =>
    isAdmin || access === 'public',
  buildPublicProjectSummary: vi.fn(async (row) => ({ href: row.projectUuid })),
  buildPublicEventSummary: vi.fn(async (row) => ({ href: row.eventUuid })),
  buildPublicTagListItems: vi.fn(async (rows) =>
    rows.map(({ tag, ...counts }: any) => ({ ...tag, ...counts })),
  ),
  buildPublicTags: vi.fn(async (tags) => tags),
}));
let context: Awaited<ReturnType<typeof freshTestDb>>;
let handle: ReturnType<typeof toWebHandler>;
beforeAll(async () => {
  Object.assign(globalThis, {
    defineEventHandler,
    createError,
    getQuery,
    getRouterParam,
  });
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    isAdmin: async () => false,
  });
  const { db, schema } = context;
  db.insert(schema.tags)
    .values({
      tagUuid: 'tag',
      title: 'Tag',
      normalizedTitle: 'tag',
      slug: 'tag',
      publicId: 'tagid',
      description: '',
    })
    .run();
  db.transaction((tx) => {
    for (let index = 0; index < 1000; index++) {
      const id = String(index).padStart(4, '0');
      tx.insert(schema.projects)
        .values({
          projectUuid: id,
          publicId: id,
          humanReadableSlug: id,
          title: id,
          summary: '',
          access:
            index >= 900
              ? ProjectEventAccessLevel.Private
              : ProjectEventAccessLevel.Public,
          createdAt: 1,
          updatedAt: 1,
        })
        .run();
      tx.insert(schema.tagUsages)
        .values({
          tagUuid: 'tag',
          containerId: id,
          containerType: 'project',
          sortOrder: index,
        })
        .run();
    }
  });
  const search = (await import('../../server/api/search.get')).default;
  const tags = (await import('../../server/api/tags/[tag].get')).default;
  const tagList = (await import('../../server/api/tags/index.get')).default;
  const router = createRouter()
    .get('/search', search)
    .get('/tags', tagList)
    .get('/tags/:tag', tags);
  handle = toWebHandler(createApp().use(router));
});
afterAll(async () => {
  await context.close();
  vi.unstubAllGlobals();
});
beforeEach(() => vi.clearAllMocks());
describe('SQL pagination', () => {
  it('counts visible search results and prepares only the selected stable page', async () => {
    const result = await (
      await handle(new Request('http://localhost/search?type=project&page=2'))
    ).json();
    expect(result).toMatchObject({
      total: 900,
      page: 2,
      pageCount: 45,
      pageSize: 20,
    });
    expect(result.items.map((row: any) => row.href)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 20).padStart(4, '0')),
    );
    expect(result.tags).toEqual([
      expect.objectContaining({
        count: 900,
        tag: expect.objectContaining({ slug: 'tag' }),
      }),
    ]);
    expect(buildPublicProjectSummary).toHaveBeenCalledTimes(20);
  });
  it('normalizes bounds before hydration and selects a nonempty tag tab', async () => {
    const result = await (
      await handle(
        new Request('http://localhost/tags/tag-tagid?tab=events&page=999'),
      )
    ).json();
    expect(result).toMatchObject({
      activeTab: 'projects',
      projectCount: 900,
      eventCount: 0,
      items: { page: 38, total: 900 },
    });
    expect(result.items.items).toHaveLength(12);
    expect(buildPublicProjectSummary).toHaveBeenCalledTimes(12);
    expect(buildPublicEventSummary).not.toHaveBeenCalled();
  });
  it('keeps unknown tags as 404', async () => {
    expect(
      (await handle(new Request('http://localhost/tags/unknown'))).status,
    ).toBe(404);
    expect(buildPublicProjectSummary).not.toHaveBeenCalled();
  });

  it.each(['-5', 'nonsense', '1.5'])(
    'normalizes invalid search page %s',
    async (page) => {
      const response = await (
        await handle(new Request(`http://localhost/search?page=${page}`))
      ).json();
      expect(response.page).toBe(1);
    },
  );

  it('paginates only used visible tags and hydrates just the selected page', async () => {
    const { db, schema } = context;
    for (let index = 0; index < 50; index++) {
      const id = `list-${String(index).padStart(2, '0')}`;
      db.insert(schema.tags)
        .values({
          tagUuid: id,
          publicId: id,
          title: 'Same title',
          normalizedTitle: id,
          slug: id,
          description: '',
        })
        .run();
      db.insert(schema.tagUsages)
        .values({
          tagUuid: id,
          containerType: 'project',
          containerId: index < 49 ? '0000' : '0999',
          sortOrder: index,
        })
        .run();
    }
    const response = await (
      await handle(new Request('http://localhost/tags?page=2'))
    ).json();
    expect(response).toMatchObject({
      page: 2,
      pageCount: 2,
      pageSize: 30,
      total: 50,
    });
    // `Tag`, used by the shared fixture, sorts after every `Same title`.
    expect(response.items.map((item: any) => item.publicId)).toEqual([
      ...Array.from(
        { length: 19 },
        (_, i) => `list-${String(i + 30).padStart(2, '0')}`,
      ),
      'tagid',
    ]);
    expect(buildPublicTagListItems).toHaveBeenCalledTimes(1);
    expect(vi.mocked(buildPublicTagListItems).mock.calls[0]![0]).toHaveLength(
      20,
    );
  });

  it('paginates both project and event tabs independently', async () => {
    const { db, schema } = context;
    for (let index = 0; index < 30; index++) {
      const id = `event-${String(index).padStart(2, '0')}`;
      db.insert(schema.events)
        .values({
          eventUuid: id,
          publicId: id,
          humanReadableSlug: id,
          title: id,
          summary: '',
          access: ProjectEventAccessLevel.Public,
          createdAt: 1,
          updatedAt: 1,
        })
        .run();
      db.insert(schema.tagUsages)
        .values({
          tagUuid: 'tag',
          containerType: 'event',
          containerId: id,
          sortOrder: index,
        })
        .run();
    }
    const response = await (
      await handle(
        new Request('http://localhost/tags/tag-tagid?tab=events&page=2'),
      )
    ).json();
    expect(response).toMatchObject({
      activeTab: 'events',
      eventCount: 30,
      items: { total: 30, page: 2, pageCount: 2 },
    });
    expect(response.items.items).toHaveLength(6);
    expect(buildPublicEventSummary).toHaveBeenCalledTimes(6);
    expect(buildPublicProjectSummary).not.toHaveBeenCalled();
  });
});
