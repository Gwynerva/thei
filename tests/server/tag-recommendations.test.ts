import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import {
  buildTagRecommendationIndex,
  invalidateTagRecommendationIndex,
  recommendTagsForDraft,
} from '../../server/thei/tag-recommendations';
import { addTagUsage } from '../../server/thei/tags';
import { freshTestDb } from '../helpers/fresh-db';

let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, { useDb: () => context });
  invalidateTagRecommendationIndex();
});

afterEach(async () => {
  invalidateTagRecommendationIndex();
  await context.close();
});

const row = {
  summary: '',
  access: ProjectEventAccessLevel.Public,
  createdAt: 1,
  updatedAt: 1,
};

function project(projectUuid: string, title: string, summary = '') {
  context.db
    .insert(context.schema.projects)
    .values({
      ...row,
      summary,
      projectUuid,
      title,
      publicId: projectUuid.replaceAll('-', ''),
      humanReadableSlug: projectUuid,
    })
    .run();
}

function event(eventUuid: string, title: string, summary = '') {
  context.db
    .insert(context.schema.events)
    .values({
      ...row,
      summary,
      eventUuid,
      title,
      publicId: eventUuid.replaceAll('-', ''),
      humanReadableSlug: eventUuid,
    })
    .run();
}

function body(ownerType: string, ownerId: string, slot: string, text: string) {
  context.db
    .insert(context.schema.content)
    .values({
      contentUuid: `c-${ownerId}`,
      ownerType: ownerType as never,
      ownerId,
      slot: slot as never,
      data: { blocks: [{ type: 'paragraph', data: { text } }] } as never,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
}

function tag(tagUuid: string, title: string, description = '') {
  context.db
    .insert(context.schema.tags)
    .values({
      tagUuid,
      title,
      normalizedTitle: title.toLocaleLowerCase(),
      slug: tagUuid,
      publicId: tagUuid.replaceAll('-', ''),
      description,
    })
    .run();
}

function tagged(
  containerType: 'project' | 'event',
  containerId: string,
  tagUuids: string[],
) {
  tagUuids.forEach((tagUuid, sortOrder) =>
    context.db
      .insert(context.schema.tagUsages)
      .values({ tagUuid, containerType, containerId, sortOrder })
      .run(),
  );
}

describe('tag recommendation index', () => {
  it('reads projects with their stages and sections, and events', () => {
    project('p-1', 'Voyage', 'Summer');
    body('project', 'p-1', 'project-description', 'harbour');
    context.db
      .insert(context.schema.projectStages)
      .values({
        stageUuid: 'pst-1',
        projectUuid: 'p-1',
        publicId: 'stage1',
        humanReadableSlug: 'crossing',
        title: 'Crossing',
        summary: 'Storm',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    body('project-stage', 'pst-1', 'project-stage-body', 'lighthouse');
    event('e-1', 'Concert');
    body('event', 'e-1', 'event-body', 'orchestra');
    tag('t-sea', 'Sea');
    tagged('project', 'p-1', ['t-sea']);

    const index = buildTagRecommendationIndex();
    const voyage = index.byKey.get('project:p-1')!;
    expect([...voyage.terms.keys()]).toEqual(
      expect.arrayContaining([
        'voyag',
        'summer',
        'harbour',
        'cross',
        'storm',
        'lighthous',
      ]),
    );
    expect(voyage.tagUuids).toEqual(['t-sea']);
    expect(index.byKey.get('event:e-1')!.terms.has('orchestra')).toBe(true);
    expect(index.profiles.map((profile) => profile.title)).toEqual(['Sea']);
  });

  it('keeps the relations between projects and events', () => {
    project('p-1', 'Voyage');
    event('e-1', 'Departure');
    context.db
      .insert(context.schema.entityRelations)
      .values({
        firstType: 'event',
        firstId: 'e-1',
        secondType: 'project',
        secondId: 'p-1',
        type: 'related',
        firstSortOrder: 0,
        secondSortOrder: 0,
      } as never)
      .run();
    const index = buildTagRecommendationIndex();
    expect(index.relations.get('project:p-1')).toEqual(['event:e-1']);
    expect(index.relations.get('event:e-1')).toEqual(['project:p-1']);
  });
});

describe('tag recommendations for a draft', () => {
  it('learns from the archive, related entities and the text', async () => {
    tag('t-sea', 'Море');
    tag('t-travel', 'Путешествия');
    tag('t-code', 'Код');
    project('p-1', 'Экспедиция на Белое море', 'Лодки, острова и маяки');
    tagged('project', 'p-1', ['t-sea', 't-travel']);
    event('e-1', 'Переход до Соловков', 'Лодка, острова, маяк на рассвете');
    tagged('event', 'e-1', ['t-sea', 't-travel']);
    event('e-2', 'Ночной хакатон', 'Код, компилятор и пицца');
    tagged('event', 'e-2', ['t-code']);

    const recommended = await recommendTagsForDraft({
      title: 'Вечер у маяка',
      text: 'Смотрели на острова с лодки',
      selectedTagUuids: [],
      related: [{ type: 'project', id: 'p-1' }],
    });

    expect(recommended.map((item) => item.title)).toEqual(
      expect.arrayContaining(['Море', 'Путешествия']),
    );
    expect(recommended.map((item) => item.title)).not.toContain('Код');
    const sea = recommended.find((item) => item.title === 'Море')!;
    expect(sea.reasons.map((reason) => reason.kind)).toEqual(
      expect.arrayContaining(['related', 'similar']),
    );
    expect(sea.score).toBeGreaterThan(0.6);
  });

  it('keeps an entity out of its own evidence', async () => {
    tag('t-sea', 'Sea');
    event('e-1', 'Harbour evening', 'boats lighthouse');
    tagged('event', 'e-1', ['t-sea']);

    const recommended = await recommendTagsForDraft({
      owner: { type: 'event', id: 'e-1' },
      title: 'Harbour evening',
      text: 'boats lighthouse',
      selectedTagUuids: [],
      related: [{ type: 'event', id: 'e-1' }],
    });
    expect(recommended).toEqual([]);
  });

  it('reads an entity again after its text changes', () => {
    event('e-1', 'Harbour');
    expect(
      buildTagRecommendationIndex()
        .byKey.get('event:e-1')!
        .terms.has('harbour'),
    ).toBe(true);
    context.db.update(context.schema.events).set({ title: 'Mountain' }).run();
    const terms = buildTagRecommendationIndex().byKey.get('event:e-1')!.terms;
    expect(terms.has('harbour')).toBe(false);
    expect(terms.has('mountain')).toBe(true);
  });
});

describe('adding a tag from its page', () => {
  it('appends the tag once and refuses an entity that does not exist', () => {
    tag('t-1', 'One');
    tag('t-2', 'Two');
    event('e-1', 'Evening');
    tagged('event', 'e-1', ['t-1']);

    expect(addTagUsage('t-2', 'event', 'e-1')).toBe(true);
    expect(addTagUsage('t-2', 'event', 'e-1')).toBe(true);
    expect(addTagUsage('t-2', 'project', 'p-missing')).toBe(false);

    expect(
      context.db
        .select()
        .from(context.schema.tagUsages)
        .all()
        .map(({ tagUuid, sortOrder }) => [tagUuid, sortOrder]),
    ).toEqual([
      ['t-1', 0],
      ['t-2', 1],
    ]);
    expect(
      context.db.select().from(context.schema.events).get()?.updatedAt,
    ).toBeGreaterThan(1);
  });
});
