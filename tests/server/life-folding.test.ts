import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countLifePoints,
  getLifeActivity,
  getLifeDay,
  getLifeWindow,
} from '../../server/thei/public/life';
import { STRANGER } from '../../server/thei/access-links/viewer';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import type { LifePoint } from '../../shared/life';
import { freshTestDb } from '../helpers/fresh-db';

vi.mock('../../server/thei/public/entities', () => ({
  buildPublicEventSummary: vi.fn(async () => ({
    media: undefined,
    tags: [],
    relatedEntities: [],
  })),
  buildPublicEntityReference: vi.fn(async () => undefined),
  buildPublicPageIcon: vi.fn(async () => undefined),
}));
vi.mock('../../server/thei/public/content', () => ({
  buildPublicEntityPreviewMedia: vi.fn(async () => undefined),
}));

let context: Awaited<ReturnType<typeof freshTestDb>>;
const now = new Date('2026-09-01T00:00:00Z');

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    content: { findByOwner: async () => undefined },
  });
  // A diary entry falls inside the trip, so its start and end stay apart.
  event('trip', '2026-02-01', '2026-02-05');
  diary('during', '2026-02-03');
  // Nothing falls inside the weekend: it is one card on its last day.
  event('weekend', '2026-04-10', '2026-04-12');
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

const cards = (points: LifePoint[]) =>
  points.map((point) => `${point.date} ${point.title} ${point.transition}`);

describe('folding a period into one card', () => {
  it('folds on the whole chronology, so a filter never changes the cards', async () => {
    const all = await getLifeWindow({ viewer: STRANGER, now });
    const events = await getLifeWindow({
      viewer: STRANGER,
      now,
      filter: ['event'],
    });
    const eventCards = (window: typeof all) =>
      cards(window.days.flatMap((day) => day.points)).filter(
        (card) => !card.includes('diary'),
      );
    expect(eventCards(events)).toEqual([
      '2026-04-12 weekend occurred',
      '2026-02-05 trip ended',
      '2026-02-01 trip started',
    ]);
    expect(eventCards(events)).toEqual(
      eventCards(all).filter((card) => !card.startsWith('2026-02-03')),
    );
    expect(countLifePoints({ now, filter: ['event'] })).toBe(3);
  });

  it('keeps a folded card on the day its period began', async () => {
    const activity = await getLifeActivity({ viewer: STRANGER, now });
    expect(activity.days['2026-04-10']).toEqual({ event: 1 });
    expect(activity.days['2026-04-12']).toEqual({ event: 1 });
    expect(activity.totals.event).toBe(2);

    const day = await getLifeDay('2026-04-10', { viewer: STRANGER, now });
    expect(cards(day.points)).toEqual(['2026-04-12 weekend occurred']);

    const window = await getLifeWindow({
      viewer: STRANGER,
      now,
      date: '2026-04-10',
    });
    expect(window.anchorDate).toBe('2026-04-12');
  });
});

describe('a pause in the feed', () => {
  it('is no pause while a period it shows runs across it', async () => {
    const window = await getLifeWindow({ viewer: STRANGER, now });
    expect(
      Object.fromEntries(
        window.days.map((day) => [day.date, Boolean(day.bridged)]),
      ),
    ).toEqual({
      '2026-04-12': false,
      '2026-02-05': false,
      '2026-02-03': true,
      '2026-02-01': true,
    });
    // A period the filter hides bridges nothing.
    const diary = await getLifeWindow({
      viewer: STRANGER,
      now,
      filter: ['diary-entry'],
    });
    expect(diary.days.some((day) => day.bridged)).toBe(false);
  });
});
