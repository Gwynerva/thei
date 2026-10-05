import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countLifePoints,
  getLatestLifePoints,
  getLifeActivity,
  getLifeWindow,
  invalidateLifeIndex,
} from '../../server/thei/public/life';
import { STRANGER } from '../../server/thei/access-links/viewer';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { lifeArrivalCutoff, type LifePoint } from '../../shared/life';
import { freshTestDb } from '../helpers/fresh-db';

vi.mock('../../server/thei/public/entities', () => ({
  buildPublicEventSummary: vi.fn(async () => ({
    media: undefined,
    tags: [],
    relatedEntities: [],
  })),
  buildPublicEntityReference: vi.fn(async () => undefined),
  buildPublicProjectSummary: vi.fn(async () => ({ tags: [] })),
  buildPublicPageIcon: vi.fn(async () => undefined),
}));
vi.mock('../../server/thei/public/content', () => ({
  buildPublicEntityPreviewMedia: vi.fn(async () => undefined),
}));

let context: Awaited<ReturnType<typeof freshTestDb>>;

/** Noon in UTC: somewhere on Earth it is already the next day. */
const NOON = new Date('2026-06-10T12:00:00Z');
/** Nine in the morning: nowhere is it the next day yet. */
const MORNING = new Date('2026-06-10T09:00:00Z');

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    content: { findByOwner: async () => undefined },
  });
  event('past', '2026-01-01', '2026-01-05');
  event('running', '2026-03-01', '2026-12-31');
  event('planned', '2026-11-01', '2026-11-03');
  diary('tomorrow', '2026-06-11');
  diary('later', '2026-06-12');
});
afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

function event(uuid: string, startDate: string, endDate: string) {
  const { db, schema } = context;
  db.insert(schema.events)
    .values({
      eventUuid: uuid,
      publicId: uuid,
      humanReadableSlug: uuid,
      title: uuid,
      summary: '',
      access: ProjectEventAccessLevel.Public,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.periods)
    .values({
      ownerType: 'event',
      ownerId: uuid,
      sortOrder: 0,
      startDate,
      endDate,
    })
    .run();
}

function diary(uuid: string, date: string) {
  context.db
    .insert(context.schema.diaryEntries)
    .values({
      diaryUuid: uuid,
      date,
      access: ProjectEventAccessLevel.Public,
      reminder: '',
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
}

const describePoint = (point: LifePoint) =>
  `${point.date} ${point.entityKind} ${point.title || '·'} ${point.transition}${point.ongoing ? ' ongoing' : ''}`;

describe('what a chronology shows of days to come', () => {
  it('takes the day it already is somewhere on Earth', () => {
    expect(lifeArrivalCutoff(NOON)).toBe('2026-06-11');
    expect(lifeArrivalCutoff(MORNING)).toBe('2026-06-10');
  });

  it('shows a running period by its start alone, and nothing dated later', async () => {
    const window = await getLifeWindow({ viewer: STRANGER, now: NOON });
    expect(window.newestDate).toBe('2026-06-11');
    expect(window.days.flatMap((day) => day.points.map(describePoint))).toEqual(
      [
        '2026-06-11 diary-entry · created',
        '2026-03-01 event running started ongoing',
        '2026-01-05 event past occurred',
      ],
    );
  });

  it('keeps the latest list, the counts and the activity grid to what has come', async () => {
    const latest = await getLatestLifePoints(20, {
      viewer: STRANGER,
      now: NOON,
    });
    expect(latest.map((point) => point.date)).toEqual([
      '2026-06-11',
      '2026-03-01',
      '2026-01-05',
    ]);
    expect(countLifePoints({ now: NOON })).toBe(3);
    const activity = await getLifeActivity({ viewer: STRANGER, now: NOON });
    expect(activity.year).toBe(2026);
    // The past event is one card on its last day, counted on its first too.
    expect(Object.keys(activity.days).sort()).toEqual([
      '2026-01-01',
      '2026-01-05',
      '2026-03-01',
      '2026-06-11',
    ]);
  });

  it('lets a day in only once it has come somewhere', async () => {
    const window = await getLifeWindow({ viewer: STRANGER, now: MORNING });
    expect(window.newestDate).toBe('2026-03-01');
    expect(countLifePoints({ now: MORNING })).toBe(2);
  });

  it('keeps a section dated only ahead waiting, not on the day it was written', async () => {
    const { db, schema } = context;
    db.insert(schema.projects)
      .values({
        projectUuid: 'project',
        publicId: 'project',
        humanReadableSlug: 'project',
        title: 'project',
        summary: '',
        access: ProjectEventAccessLevel.Public,
        createdAt: Date.parse('2026-02-01T00:00:00Z'),
        updatedAt: 1,
      })
      .run();
    db.insert(schema.projectContentSections)
      .values({
        sectionUuid: 'ahead',
        projectUuid: 'project',
        title: 'ahead',
        humanReadableSlug: 'ahead',
        publicId: 'ahead',
        sortOrder: 0,
        createdAt: Date.parse('2026-04-01T00:00:00Z'),
        updatedAt: 1,
      })
      .run();
    db.insert(schema.periods)
      .values({
        ownerType: 'project-section',
        ownerId: 'ahead',
        sortOrder: 0,
        startDate: '2026-11-01',
        endDate: '2026-11-03',
      })
      .run();

    const scope = { kind: 'project' as const, projectUuid: 'project' };
    const window = await getLifeWindow({ viewer: STRANGER, now: NOON, scope });
    expect(
      window.days.flatMap((day) => day.points.map((point) => point.entityKind)),
    ).not.toContain('project-section');
    expect(countLifePoints({ now: NOON, scope })).toBe(1);
    const activity = await getLifeActivity({ viewer: STRANGER, now: NOON });
    expect(activity.days).not.toHaveProperty('2026-04-01');
  });
});

describe('what a card of a period knows', () => {
  it('gives a running start its whole period, and a secret none of it', async () => {
    const { db, schema } = context;
    db.insert(schema.events)
      .values({
        eventUuid: 'hidden',
        publicId: 'hidden',
        humanReadableSlug: 'hidden',
        title: 'hidden',
        summary: '',
        access: ProjectEventAccessLevel.Private,
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(schema.periods)
      .values({
        ownerType: 'event',
        ownerId: 'hidden',
        sortOrder: 0,
        startDate: '2026-05-01',
        endDate: '2026-12-01',
      })
      .run();

    const points = (
      await getLifeWindow({ viewer: STRANGER, now: NOON })
    ).days.flatMap((day) => day.points);
    expect(points.find((point) => point.title === 'running')).toMatchObject({
      transition: 'started',
      ongoing: true,
      period: { startDate: '2026-03-01', endDate: '2026-12-31' },
    });
    const secret = points.find((point) => point.visibility === 'secret')!;
    expect(secret).toMatchObject({ date: '2026-05-01', transition: 'started' });
    expect(secret).not.toHaveProperty('period');
    expect(secret).not.toHaveProperty('ongoing');
  });
});

describe('the points kept between requests', () => {
  it('keeps them until the content changes, and builds them anew for a new day', () => {
    expect(countLifePoints({ now: MORNING })).toBe(2);
    // Written behind the API's back: the kept points do not know of it.
    diary('earlier', '2026-02-02');
    expect(countLifePoints({ now: MORNING })).toBe(2);
    // A day that comes is read afresh, and the new entry with it.
    expect(countLifePoints({ now: NOON })).toBe(4);
    diary('another', '2026-02-03');
    expect(countLifePoints({ now: NOON })).toBe(4);
    invalidateLifeIndex();
    expect(countLifePoints({ now: NOON })).toBe(5);
  });
});
