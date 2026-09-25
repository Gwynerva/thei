import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { isPublicSecret } from '../../shared/api/public';
import {
  buildPublicRelatedPage,
  countPublicRelated,
  PUBLIC_RELATED_PAGE_SIZE,
  resolvePublicRelated,
} from '../../server/thei/public/related';
import { freshTestDb } from '../helpers/fresh-db';

let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  const { db, schema } = context;
  Object.assign(context.server, {
    useDb: () => context,
    projects: {
      findByUuid: async (projectUuid: string) =>
        db
          .select()
          .from(schema.projects)
          .where(eq(schema.projects.projectUuid, projectUuid))
          .get(),
    },
    events: {
      findByUuid: async (eventUuid: string) =>
        db
          .select()
          .from(schema.events)
          .where(eq(schema.events.eventUuid, eventUuid))
          .get(),
    },
    diary: {
      findByUuid: async (diaryUuid: string) =>
        db
          .select()
          .from(schema.diaryEntries)
          .where(eq(schema.diaryEntries.diaryUuid, diaryUuid))
          .get(),
    },
    assets: { usages: { findByContainer: async () => [] } },
    content: { findByOwner: async () => undefined },
  });
});

afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

function insertProject(projectUuid: string, access: ProjectEventAccessLevel) {
  context.db
    .insert(context.schema.projects)
    .values({
      projectUuid,
      publicId: `${projectUuid}-id`,
      humanReadableSlug: `${projectUuid}-slug`,
      title: `${projectUuid} title`,
      summary: `${projectUuid} summary`,
      access,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
}

function insertEvent(eventUuid: string) {
  context.db
    .insert(context.schema.events)
    .values({
      eventUuid,
      publicId: eventUuid,
      humanReadableSlug: eventUuid,
      title: `${eventUuid} title`,
      summary: '',
      access: ProjectEventAccessLevel.Public,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
}

function insertDiary(
  diaryUuid: string,
  date: string,
  access = ProjectEventAccessLevel.Public,
) {
  context.db
    .insert(context.schema.diaryEntries)
    .values({
      diaryUuid,
      date,
      access,
      reminder: '',
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
}

type Row = typeof context.schema.entityRelations.$inferInsert;

function insertRelations(rows: Row[]) {
  context.db.insert(context.schema.entityRelations).values(rows).run();
}

const event = { type: 'event' as const, id: 'e1' };

/**
 * An event related to everything: two projects, one of them private, and
 * three diary entries, one of them private. Rows are written in canonical
 * order: `diary-entry:*` < `event:e1` < `project:*`.
 */
function seed() {
  insertProject('p-open', ProjectEventAccessLevel.Public);
  insertProject('p-hidden', ProjectEventAccessLevel.Private);
  insertEvent('e1');
  insertDiary('d-new', '2026-05-02');
  insertDiary('d-hidden', '2026-05-01', ProjectEventAccessLevel.Private);
  insertDiary('d-old', '2026-04-01');
  insertRelations([
    row('event', 'e1', 'project', 'p-open', 'related', 0, 0),
    // The event affects the hidden project.
    row('event', 'e1', 'project', 'p-hidden', 'first-influences-second', 1, 0),
    row('diary-entry', 'd-new', 'event', 'e1', 'related', 0, 2),
    row('diary-entry', 'd-hidden', 'event', 'e1', 'related', 0, 3),
    // The event depends on the old entry.
    row('diary-entry', 'd-old', 'event', 'e1', 'first-influences-second', 0, 4),
  ]);
}

function row(
  firstType: Row['firstType'],
  firstId: string,
  secondType: Row['secondType'],
  secondId: string,
  type: Row['type'],
  firstSortOrder: number,
  secondSortOrder: number,
): Row {
  return {
    firstType,
    firstId,
    secondType,
    secondId,
    type,
    firstSortOrder,
    secondSortOrder,
  };
}

describe('public related entities', () => {
  it('lists the directed kinds first and drops what a visitor may not see', async () => {
    seed();
    const items = await resolvePublicRelated(event, false);
    expect(
      items.map((item) => [item.endpoint.id, item.relationType, item.secret]),
    ).toEqual([
      ['d-old', 'influencing', false],
      ['p-hidden', 'dependent', true],
      ['p-open', 'related', false],
      ['d-new', 'related', false],
    ]);
    // A hidden project is counted, since it is shown as a codename; a hidden
    // diary entry is not, since it is not shown at all.
    expect(countPublicRelated(items)).toEqual({ project: 2, 'diary-entry': 2 });

    const owner = await resolvePublicRelated(event, true);
    expect(countPublicRelated(owner)).toEqual({ project: 2, 'diary-entry': 3 });
    expect(owner.some((item) => item.secret)).toBe(false);
  });

  it('builds one kind at a time, with codenames and days', async () => {
    seed();
    const projects = await buildPublicRelatedPage(event, 'project', 1, false);
    expect(projects).toMatchObject({ page: 1, pageCount: 1, total: 2 });
    expect(projects.items.map(isPublicSecret)).toEqual([true, false]);
    expect(projects.items[0]).toMatchObject({
      relationType: 'dependent',
      entityType: 'project',
    });
    expect(projects.items[0]).not.toHaveProperty('href');
    expect(JSON.stringify(projects.items[0])).not.toMatch(/p-hidden/);
    expect(projects.items[1]).toMatchObject({
      title: 'p-open title',
      href: '/projects/p-open-slug-p-open-id/',
      relationType: 'related',
    });

    const entries = await buildPublicRelatedPage(
      event,
      'diary-entry',
      1,
      false,
    );
    expect(entries.items).toMatchObject([
      {
        title: '2026-04-01',
        date: '2026-04-01',
        href: '/diary/2026-04-01/',
        relationType: 'influencing',
      },
      { title: '2026-05-02', date: '2026-05-02', relationType: 'related' },
    ]);
  });

  it('pages a long list of diary entries newest first', async () => {
    insertEvent('e1');
    const count = PUBLIC_RELATED_PAGE_SIZE + 1;
    const rows: Row[] = [];
    for (let index = 0; index < count; index++) {
      const day = String(index + 1).padStart(2, '0');
      insertDiary(`d-${day}`, `2026-03-${day}`);
      rows.push(
        row('diary-entry', `d-${day}`, 'event', 'e1', 'related', 0, index),
      );
    }
    insertRelations(rows);

    const first = await buildPublicRelatedPage(event, 'diary-entry', 1, false);
    expect(first).toMatchObject({
      page: 1,
      pageCount: 2,
      total: count,
      pageSize: PUBLIC_RELATED_PAGE_SIZE,
    });
    expect(first.items).toHaveLength(PUBLIC_RELATED_PAGE_SIZE);
    expect(first.items[0]).toMatchObject({ title: '2026-03-25' });
    expect(first.items.at(-1)).toMatchObject({ title: '2026-03-02' });

    const second = await buildPublicRelatedPage(event, 'diary-entry', 2, false);
    expect(second.items.map((item) => item.title)).toEqual(['2026-03-01']);
    expect(
      await buildPublicRelatedPage(event, 'project', 1, false),
    ).toMatchObject({ items: [], total: 0 });
  });
});
