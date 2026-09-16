import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLifeRewind, getLifeWindow } from '../../server/thei/public/life';
import { buildPublicEventSummary } from '../../server/thei/public/entities';
import { freshTestDb } from '../helpers/fresh-db';
import { ProjectEventAccessLevel } from '../../shared/access-level';

vi.mock('../../server/thei/public/entities', () => ({
  buildPublicEventSummary: vi.fn(async () => ({ media: undefined, tags: [] })),
}));
let context: Awaited<ReturnType<typeof freshTestDb>>;
const now = new Date('2026-09-10T23:59:59Z');

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, { useDb: () => context });
  vi.clearAllMocks();
});
afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

function insertEvents(count: number, access = ProjectEventAccessLevel.Public) {
  const { db, schema } = context;
  for (let i = 0; i < count; i++) {
    const id = String(i).padStart(2, '0');
    db.insert(schema.events)
      .values({
        eventUuid: id,
        publicId: id,
        humanReadableSlug: id,
        title: `Event ${id}`,
        summary: `Description ${id}`,
        access,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.stagePeriods)
      .values({
        stageType: 'event-stage',
        stageUuid: id,
        sortOrder: 0,
        startDate: '2025-09-01',
        endDate: '2025-09-20',
      })
      .run();
  }
}

describe('Life rewind service', () => {
  it('prepares only the selected page and keeps preview order identical', async () => {
    insertEvents(30);
    const preview = await getLifeRewind({ isAdmin: false, now, pageSize: 3 });
    expect(preview).toMatchObject({
      referenceDate: '2026-09-10',
      total: 30,
      pageSize: 3,
      pageCount: 10,
    });
    expect(buildPublicEventSummary).toHaveBeenCalledTimes(3);
    const first = await getLifeRewind({ isAdmin: false, now });
    expect(first.items.slice(0, 3)).toEqual(preview.items);
    vi.clearAllMocks();
    const last = await getLifeRewind({ isAdmin: false, now, page: 999 });
    expect(last).toMatchObject({ page: 2, pageCount: 2, total: 30 });
    expect(last.items).toHaveLength(6);
    expect(buildPublicEventSummary).toHaveBeenCalledTimes(6);
    expect(
      new Set([...first.items, ...last.items].map((item) => item.point.key))
        .size,
    ).toBe(30);
  });

  it('keeps private entries anonymous without hydrating their content', async () => {
    insertEvents(1, ProjectEventAccessLevel.Private);
    const result = await getLifeRewind({ isAdmin: false, now });
    expect(result.items).toEqual([
      {
        match: 'ongoing',
        point: {
          key: expect.any(String),
          visibility: 'secret',
          entityKind: 'event',
          transition: 'occurred',
          date: '2025-09-10',
          period: { startDate: '2025-09-01', endDate: '2025-09-20' },
          title: expect.stringMatching(/^Secret event \S+$/),
          summary: expect.any(String),
          media: expect.objectContaining({
            src: expect.stringMatching(/^\/media\/generated-icons\/secret\//),
          }),
        },
      },
    ]);
    expect(buildPublicEventSummary).not.toHaveBeenCalled();
    const admin = await getLifeRewind({ isAdmin: true, now });
    expect(admin.items[0]!.point).toMatchObject({
      visibility: 'visible',
      title: 'Event 00',
    });
  });

  it('leaves the existing merged timeline unchanged', async () => {
    insertEvents(1);
    const before = await getLifeWindow({ isAdmin: false });
    expect(before.days[0]!.points[0]).toMatchObject({
      date: '2025-09-20',
      transition: 'occurred',
    });
    const result = await getLifeRewind({ isAdmin: false, now });
    expect(result.items[0]!.point.date).toBe('2025-09-10');
    expect(await getLifeWindow({ isAdmin: false })).toEqual(before);
  });

  it('returns an empty first page when there are no matches', async () => {
    expect(await getLifeRewind({ isAdmin: false, now, page: 99 })).toEqual({
      referenceDate: '2026-09-10',
      items: [],
      page: 1,
      pageSize: 24,
      pageCount: 1,
      total: 0,
    });
  });
});
