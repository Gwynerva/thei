import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { lifeFilterKinds, parseLifeFilter } from '../../shared/life';
import { OWNER, STRANGER } from '../../server/thei/access-links/viewer';
import {
  getLatestLifePoints,
  getLifeActivity,
  getLifeWindow,
} from '../../server/thei/public/life';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * Excerpts on the chronologies. On the chronology of what an excerpt is
 * about it is a point of its own, dated by its parent's day, and its parent
 * is not there beside it; on the Life it is no point at all — the Life holds
 * one point per entry, which names its excerpts.
 */
const { Public, Private } = ProjectEventAccessLevel;
let context: Awaited<ReturnType<typeof freshTestDb>>;
const NOW = Date.parse('2026-06-01T12:00:00Z');

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, serverRepositories, {
    config: { siteAccessLevel: 'public' },
  });
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  seed();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

const row = { summary: '', createdAt: 1, updatedAt: 1 };

function relate(first: [string, string], second: [string, string], order = 0) {
  context.insert('entity-relations', {
    firstType: first[0],
    firstId: first[1],
    secondType: second[0],
    secondId: second[1],
    type: 'related',
    note: null,
    firstSortOrder: order,
    secondSortOrder: order,
  });
}

function excerpt(
  uuid: string,
  parent: [string, string],
  isPrivate = false,
  sortOrder = 0,
) {
  context.insert('excerpts', {
    excerptUuid: uuid,
    parentType: parent[0],
    parentId: parent[1],
    title: `${uuid} title`,
    summary: `${uuid} summary`,
    humanReadableSlug: uuid,
    publicId: uuid,
    isPrivate: isPrivate ? 1 : 0,
    sortOrder,
    createdAt: Date.parse('2026-05-20T00:00:00Z'),
    updatedAt: Date.parse('2026-05-20T00:00:00Z'),
  });
}

/**
 * A project; an entry of 2026-04-01 related to it directly and with an
 * excerpt about it; an event of 2026-03-01 whose only tie to the project is
 * an excerpt, and a private excerpt of the same event about it; another
 * entry with an excerpt about something else.
 */
function seed() {
  context.insert('projects', {
    ...row,
    projectUuid: 'P',
    publicId: 'P',
    humanReadableSlug: 'p',
    title: 'The project',
    access: Public,
    createdAt: Date.parse('2026-01-01T00:00:00Z'),
  });
  context.insert('projects', {
    ...row,
    projectUuid: 'Q',
    publicId: 'Q',
    humanReadableSlug: 'q',
    title: 'Another project',
    access: Public,
    createdAt: Date.parse('2026-01-02T00:00:00Z'),
  });
  context.insert('events', {
    ...row,
    eventUuid: 'E',
    publicId: 'E',
    humanReadableSlug: 'e',
    title: 'The event',
    access: Public,
  });
  context.insert('periods', {
    ownerType: 'event',
    ownerId: 'E',
    sortOrder: 0,
    startDate: '2026-03-01',
    endDate: '2026-03-02',
    precision: 'exact',
    precisionNote: '',
    label: '',
  });
  for (const [uuid, date] of [
    ['D', '2026-04-01'],
    ['D2', '2026-04-05'],
  ] as const)
    context.insert('diary-entries', {
      diaryUuid: uuid,
      date,
      access: Public,
      reminder: '',
      createdAt: 1,
      updatedAt: 1,
    });
  context.insert('content', {
    contentUuid: 'C-D',
    ownerType: 'diary-entry',
    ownerId: 'D',
    slot: 'diary-body',
    data: {
      blocks: [
        { id: 'h1', type: 'header', data: { text: 'Morning', level: 2 } },
        { id: 'p1', type: 'paragraph', data: { text: 'Out in the open.' } },
      ],
    },
    createdAt: 1,
    updatedAt: 1,
  });
  relate(['diary-entry', 'D'], ['project', 'P']);
  excerpt('XD', ['diary-entry', 'D']);
  excerpt('XD2', ['diary-entry', 'D'], true, 1);
  relate(['excerpt', 'XD'], ['project', 'P']);
  excerpt('XE', ['event', 'E']);
  relate(['excerpt', 'XE'], ['project', 'P']);
  excerpt('XE2', ['event', 'E'], true, 1);
  relate(['excerpt', 'XE2'], ['project', 'P']);
  excerpt('XQ', ['diary-entry', 'D2']);
  relate(['excerpt', 'XQ'], ['project', 'Q']);
}

const scope = { kind: 'project', projectUuid: 'P' } as const;

describe("excerpts on a project's chronology", () => {
  it('stand as points of their own, dated by their parents, in place of the parent', async () => {
    const points = await getLatestLifePoints(20, { scope, viewer: OWNER });
    const described = points.map((point) => [
      point.entityKind,
      point.date,
      point.visibility === 'visible' ? point.title : point.visibility,
    ]);
    // The entry's own point is gone: its excerpt about the project stands
    // for it. The event never was here — its tie is its excerpt — and its
    // two excerpts are dated by its last day.
    expect(described).toEqual([
      ['excerpt', '2026-04-01', 'XD title'],
      ['excerpt', '2026-03-02', 'XE2 title'],
      ['excerpt', '2026-03-02', 'XE title'],
      ['project', '2026-01-01', 'The project'],
    ]);
    const first = points[0]!;
    expect(first.visibility).toBe('visible');
    if (first.visibility !== 'visible') return;
    expect(first.href).toBe('/diary/2026-04-01/excerpts/XD-XD/');
    // Its parent, named as a card names what its subject belongs to; the
    // project it is about is the scope's own and not named again.
    expect(first.project).toMatchObject({
      entityType: 'diary-entry',
      date: '2026-04-01',
      href: '/diary/2026-04-01/',
    });
    expect(first.relatedEntities ?? []).toEqual([]);
  });

  it('date an event’s excerpt by the last day of it that has come', async () => {
    // One event still running, one still to come, each with an excerpt
    // about the project and nothing else tying it there.
    for (const [uuid, startDate, endDate] of [
      ['RUN', '2026-05-25', '2026-07-01'],
      ['SOON', '2026-08-01', '2026-08-02'],
    ] as const) {
      context.insert('events', {
        ...row,
        eventUuid: uuid,
        publicId: uuid,
        humanReadableSlug: uuid.toLowerCase(),
        title: `${uuid} event`,
        access: Public,
      });
      context.insert('periods', {
        ownerType: 'event',
        ownerId: uuid,
        sortOrder: 0,
        startDate,
        endDate,
        precision: 'exact',
        precisionNote: '',
        label: '',
      });
      excerpt(`X${uuid}`, ['event', uuid]);
      relate([`excerpt`, `X${uuid}`], ['project', 'P']);
    }
    const points = await getLatestLifePoints(20, { scope, viewer: OWNER });
    // A running one by its start, as its own point would stand; one to come
    // waits, for the owner too.
    expect(
      points
        .filter((point) => point.entityKind === 'excerpt')
        .map((point) => [
          point.date,
          point.visibility === 'visible' ? point.title : '',
        ]),
    ).toEqual([
      ['2026-05-25', 'XRUN title'],
      ['2026-04-01', 'XD title'],
      ['2026-03-02', 'XE2 title'],
      ['2026-03-02', 'XE title'],
    ]);
    // Its card says the same day.
    const { eventExcerptParent } =
      await import('../../server/thei/excerpts/parents');
    const running = (await context.server.events.findByUuid('RUN'))!;
    expect(eventExcerptParent(running).date).toBe('2026-05-25');
    expect(
      eventExcerptParent(running, Date.parse('2026-07-05T12:00:00Z')).date,
    ).toBe('2026-07-01');
    const soon = (await context.server.events.findByUuid('SOON'))!;
    expect(eventExcerptParent(soon)).toMatchObject({
      date: '2026-08-01',
      arrives: Date.parse('2026-08-01T00:00:00Z') - 14 * 60 * 60 * 1000,
    });
  });

  it('shows a stranger a private excerpt as a secret, and counts excerpts in the year', async () => {
    const points = await getLatestLifePoints(20, { scope, viewer: STRANGER });
    expect(points.map((point) => [point.entityKind, point.visibility])).toEqual(
      [
        ['excerpt', 'visible'],
        ['excerpt', 'secret'],
        ['excerpt', 'visible'],
        ['project', 'visible'],
      ],
    );
    const activity = await getLifeActivity({
      scope,
      viewer: STRANGER,
      year: 2026,
    });
    expect(activity.totals).toEqual({ project: 1, excerpt: 2 });
    expect(activity.days['2026-03-02']).toEqual({ excerpt: 1, secret: 1 });
    // The excerpt filter is one of the project's, and listed as a kind held.
    const window = await getLifeWindow({ scope, viewer: OWNER });
    // The kinds a filter may pick: a project's own point is no filter.
    expect(window.kinds).toEqual(['excerpt']);
    expect(lifeFilterKinds(scope)).toContain('excerpt');
    expect(parseLifeFilter('excerpt', scope)).toEqual(['excerpt']);
  });
});

describe('excerpts on the Life', () => {
  it('are no points of their own; the entry names them', async () => {
    const points = await getLatestLifePoints(20, { viewer: OWNER });
    expect(points.some((point) => point.entityKind === 'excerpt')).toBe(false);
    expect(lifeFilterKinds({ kind: 'life' })).not.toContain('excerpt');
    expect(parseLifeFilter('excerpt')).toBeUndefined();
    const entry = points.find(
      (point) =>
        point.entityKind === 'diary-entry' && point.date === '2026-04-01',
    );
    expect(entry?.visibility).toBe('visible');
    if (entry?.visibility !== 'visible') return;
    // Each with what it is about, for its token; one about nothing has none.
    expect(entry.excerpts).toEqual([
      {
        title: 'XD title',
        summary: 'XD summary',
        href: '/diary/2026-04-01/excerpts/XD-XD/',
        about: expect.objectContaining({
          entityType: 'project',
          title: 'The project',
          href: '/projects/p-P/',
        }),
      },
      {
        title: 'XD2 title',
        summary: 'XD2 summary',
        href: '/diary/2026-04-01/excerpts/XD2-XD2/',
      },
    ]);
    // The entry's lead names its headings, then quotes it; its excerpts are
    // listed under it on the card, and the lead does not name them again.
    expect(entry.summary).toBe('Morning — Out in the open.');
    const seen = (await getLatestLifePoints(20, { viewer: STRANGER })).find(
      (point) =>
        point.entityKind === 'diary-entry' && point.date === '2026-04-01',
    );
    expect(seen?.visibility).toBe('visible');
    if (seen?.visibility !== 'visible') return;
    expect(seen.summary).toBe('Morning — Out in the open.');
    // An event's point names its excerpts the visitor may see, and the
    // private one by its codename in its place, leading nowhere.
    const event = (await getLatestLifePoints(20, { viewer: STRANGER })).find(
      (point) => point.entityKind === 'event',
    );
    expect(event?.visibility).toBe('visible');
    if (event?.visibility !== 'visible') return;
    expect(event.excerpts).toEqual([
      expect.objectContaining({ title: 'XE title', href: expect.any(String) }),
      {
        secret: true,
        key: expect.any(String),
        title: expect.stringMatching(/^Secret excerpt /),
        iconMedia: expect.any(Object),
      },
    ]);
  });
});
