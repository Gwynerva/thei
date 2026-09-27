import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLatestLifePoints,
  getLifeActivity,
  getLifeWindow,
} from '../../server/thei/public/life';
import {
  scopedViewer,
  STRANGER,
  type PublicViewer,
} from '../../server/thei/access-links/viewer';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import type { LifePoint, LifeScope } from '../../shared/life';
import { freshTestDb } from '../helpers/fresh-db';

vi.mock('../../server/thei/public/entities', () => ({
  buildPublicEventSummary: vi.fn(async () => ({
    media: undefined,
    tags: [],
    relatedEntities: [],
  })),
  buildPublicProjectSummary: vi.fn(async () => ({
    media: undefined,
    tags: [],
  })),
  buildPublicEntityReference: vi.fn(async (project: { title: string }) => ({
    entityType: 'project',
    title: project.title,
    summary: '',
    href: '/projects/p/',
  })),
  buildPublicPageIcon: vi.fn(async () => undefined),
}));
vi.mock('../../server/thei/public/content', () => ({
  buildPublicEntityPreviewMedia: vi.fn(async () => undefined),
}));

let context: Awaited<ReturnType<typeof freshTestDb>>;

const scope: LifeScope = { kind: 'project', projectUuid: 'P' };

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    content: { findByOwner: async () => undefined },
  });
  seed();
});
afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

/**
 * A private project with a private stage and a status, and around it a
 * private event and a private diary entry related to it.
 */
function seed() {
  const { db, schema } = context;
  const Private = ProjectEventAccessLevel.Private;
  db.insert(schema.projects)
    .values({
      projectUuid: 'P',
      publicId: 'P',
      humanReadableSlug: 'p',
      title: 'The project',
      summary: '',
      access: Private,
      createdAt: Date.parse('2026-01-01T00:00:00Z'),
      updatedAt: 1,
    })
    .run();
  db.insert(schema.projectStages)
    .values({
      stageUuid: 'S',
      projectUuid: 'P',
      title: 'The stage',
      summary: '',
      humanReadableSlug: 's',
      publicId: 'S',
      isPrivate: true,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.events)
    .values({
      eventUuid: 'E',
      publicId: 'E',
      humanReadableSlug: 'e',
      title: 'The event',
      summary: '',
      access: Private,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.stagePeriods)
    .values([
      {
        stageType: 'project-stage',
        stageUuid: 'S',
        sortOrder: 0,
        startDate: '2026-02-01',
        endDate: '2026-02-10',
      },
      {
        stageType: 'event-stage',
        stageUuid: 'E',
        sortOrder: 0,
        startDate: '2026-03-01',
        endDate: '2026-03-01',
      },
    ])
    .run();
  db.insert(schema.diaryEntries)
    .values({
      diaryUuid: 'D',
      date: '2026-04-01',
      access: Private,
      reminder: '',
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.statuses)
    .values({
      id: 'status',
      ownerType: 'project',
      ownerId: 'P',
      kind: 'regular',
      text: 'Working on it',
      assetUuid: null,
      // Written later, but dated by its owner: the day is what the grid counts.
      createdAt: Date.parse('2026-06-15T00:00:00Z'),
      date: '2026-05-01',
    })
    .run();
  db.insert(schema.entityRelations)
    .values([
      {
        firstType: 'diary-entry',
        firstId: 'D',
        secondType: 'project',
        secondId: 'P',
        type: 'related',
        firstSortOrder: 0,
        secondSortOrder: 0,
      },
      {
        firstType: 'event',
        firstId: 'E',
        secondType: 'project',
        secondId: 'P',
        type: 'related',
        firstSortOrder: 0,
        secondSortOrder: 1,
      },
    ])
    .run();
}

function visibility(points: LifePoint[]) {
  return Object.fromEntries(
    points.map((point) => [point.entityKind, point.visibility]),
  );
}

describe("a project's chronology through its share link", () => {
  // The visitor holds links to the project and to the event alike; the
  // project's chronology still only opens the project's own points.
  const holder: PublicViewer = {
    isAdmin: false,
    grants: new Set(['project:P', 'event:E']),
  };

  it('opens its own points and nothing gathered around it', async () => {
    const points = await getLatestLifePoints(20, {
      scope,
      viewer: scopedViewer(holder, 'project', 'P'),
    });
    expect(visibility(points)).toEqual({
      'profile-status': 'visible',
      'diary-entry': 'secret',
      event: 'secret',
      'project-stage': 'visible',
      project: 'visible',
    });
    const status = points.find(
      (point) => point.entityKind === 'profile-status',
    );
    expect(status).toMatchObject({ summary: 'Working on it' });
  });

  it('counts its own points as visible on the activity grid', async () => {
    const activity = await getLifeActivity({
      scope,
      viewer: scopedViewer(holder, 'project', 'P'),
      year: 2026,
    });
    expect(activity.days).toEqual({
      '2026-05-01': { 'profile-status': 1 },
      '2026-04-01': { secret: 1 },
      '2026-03-01': { secret: 1 },
      '2026-02-10': { 'project-stage': 1 },
      '2026-01-01': { project: 1 },
    });
  });

  it("shows a stranger a hidden project's status as a secret", async () => {
    // A status point of a project the reader may not open used to throw:
    // there was no secret kind for it.
    const window = await getLifeWindow({ scope, viewer: STRANGER });
    const points = window.days.flatMap((day) => day.points);
    const status = points.find(
      (point) => point.entityKind === 'profile-status',
    );
    expect(status).toMatchObject({ visibility: 'secret' });
    expect(JSON.stringify(status)).not.toContain('Working on it');
  });
});
