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
} from '../../server/thei/public/entities';

vi.mock('../../server/thei/public/entities', () => ({
  buildPublicProjectSummary: vi.fn(async (row) => ({ href: row.projectUuid })),
  buildPublicEventSummary: vi.fn(async (row) => ({ href: row.eventUuid })),
  buildPublicTagListItems: vi.fn(async (rows) =>
    rows.map(({ tag, ...counts }: any) => ({ ...tag, ...counts })),
  ),
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
  const projects = (await import('../../server/api/projects/index.get'))
    .default;
  const tags = (await import('../../server/api/tags/[tag].get')).default;
  const router = createRouter()
    .get('/projects', projects)
    .get('/tags/:tag', tags);
  handle = toWebHandler(createApp().use(router));
});
afterAll(async () => {
  await context.close();
  vi.unstubAllGlobals();
});
beforeEach(() => vi.clearAllMocks());
describe('SQL pagination', () => {
  it('counts visible projects and prepares only the selected stable page', async () => {
    const result = await (
      await handle(new Request('http://localhost/projects?page=2'))
    ).json();
    expect(result).toMatchObject({
      total: 900,
      page: 2,
      pageCount: 38,
      pageSize: 24,
    });
    expect(result.items.map((row: any) => row.href)).toEqual(
      Array.from({ length: 24 }, (_, i) => String(i + 24).padStart(4, '0')),
    );
    expect(buildPublicProjectSummary).toHaveBeenCalledTimes(24);
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
});
