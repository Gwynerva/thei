import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSearchStore,
  rebuildSearchIndex,
  refreshSearchIndex,
  useSearchStore,
} from '../../../server/thei/search/indexer';
import {
  findsOfResult,
  runSearch,
  type SearchRequest,
} from '../../../server/thei/search/query';
import type { SearchHit, SearchResponse } from '../../../shared/search/api';
import { freshAiTestDb } from '../../helpers/fresh-ai-db';

/**
 * The search over the whole site, built from the pages' own builders for a
 * stranger and for the owner: what each finds, where, and what a stranger
 * never does.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;
const insert = (table: string, row: Record<string, unknown>) =>
  context.insert(table, row);

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const HIDDEN_PROJECT = 'p-22222222-2222-4222-8222-222222222222';
const LINK_PROJECT = 'p-33333333-3333-4333-8333-333333333333';
const SECTION = 's-11111111-1111-4111-8111-111111111111';
const PRIVATE_SECTION = 's-22222222-2222-4222-8222-222222222222';
const EVENT = 'e-11111111-1111-4111-8111-111111111111';
const DIARY = 'd-11111111-1111-4111-8111-111111111111';
const PRIVATE_DIARY = 'd-22222222-2222-4222-8222-222222222222';
const FUTURE_DIARY = 'd-33333333-3333-4333-8333-333333333333';
const TAG = 't-11111111-1111-4111-8111-111111111111';

const paragraph = (id: string, text: string) => ({
  id,
  type: 'paragraph',
  data: { text },
});
let contentSeq = 0;
function text(
  ownerType: string,
  ownerId: string,
  slot: string,
  blocks: unknown[],
) {
  insert('content', {
    contentUuid: `c-${++contentSeq}`,
    ownerType,
    ownerId,
    slot,
    data: { blocks },
    blockCount: blocks.length,
    assetCount: 0,
    assetTotalSize: 0,
    createdAt: 1,
    updatedAt: 1,
  });
}

function project(
  uuid: string,
  title: string,
  access: string,
  patch: Record<string, unknown> = {},
) {
  insert('projects', {
    projectUuid: uuid,
    title,
    summary: '',
    access,
    humanReadableSlug: title.toLowerCase().replaceAll(' ', '-'),
    publicId: uuid.slice(2, 10),
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  });
}

const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

beforeEach(async () => {
  context = await freshAiTestDb();
  insert('profiles', {
    profileId: 'profile',
    displayName: 'Варвара',
    slogan: 'Шью костюмы',
  });
  project(PROJECT, 'Косплей на Шедоухарт', 'public', {
    summary: 'Костюм, парик и рога',
    synonyms: ['Трактир'],
  });
  project(HIDDEN_PROJECT, 'Переезд', 'private');
  project(LINK_PROJECT, 'AR-гид для музея', 'link-only');
  text('project', PROJECT, 'project-description', [
    paragraph(
      'b1',
      'Дошила плащ для <abbr data-content-hint="жрица Шар">косплея</abbr>.',
    ),
    {
      id: 'p-start',
      type: 'privateSectionBoundary',
      data: { sectionId: 'x', edge: 'start' },
    },
    paragraph('b2', 'Бюджет на линзы держу в секрете: мандрагора.'),
    {
      id: 'p-end',
      type: 'privateSectionBoundary',
      data: { sectionId: 'x', edge: 'end' },
    },
    paragraph('b3', 'Учу Vue.js, C# и пишу про 2B из NieR:Automata.'),
  ]);
  insert('project-content-sections', {
    sectionUuid: SECTION,
    projectUuid: PROJECT,
    title: 'Парик и рога',
    summary: '',
    humanReadableSlug: 'parik',
    publicId: 'Parik',
    isPrivate: 0,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  });
  text('project-section', SECTION, 'project-section-body', [
    paragraph('s1', 'Рога для Шедоухарт печатала на принтере, потом шкурила.'),
  ]);
  insert('project-content-sections', {
    sectionUuid: PRIVATE_SECTION,
    projectUuid: PROJECT,
    title: 'Расходы',
    summary: '',
    humanReadableSlug: 'rashody',
    publicId: 'Rashody',
    isPrivate: 1,
    sortOrder: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  text('project-section', PRIVATE_SECTION, 'project-section-body', [
    paragraph('s2', 'Сколько стоил бархат: секретно, слово бергамот.'),
  ]);
  text('project', HIDDEN_PROJECT, 'project-description', [
    paragraph('h1', 'Коробки, бергамот и скотч.'),
  ]);
  text('project', LINK_PROJECT, 'project-description', [
    paragraph('l1', 'Речной флот и кувшинка.'),
  ]);
  insert('tags', {
    tagUuid: TAG,
    title: 'Косплей',
    normalizedTitle: 'косплей',
    slug: 'cosplay',
    publicId: 'Cosplay',
    description: 'Костюмы и образы',
    synonyms: ['cosplay'],
    updatedAt: 1,
  });
  insert('tag-usages', {
    tagUuid: TAG,
    containerType: 'project',
    containerId: PROJECT,
    sortOrder: 0,
  });
  insert('events', {
    eventUuid: EVENT,
    title: 'Starcon',
    summary: 'Фестиваль с маяком',
    access: 'public',
    humanReadableSlug: 'starcon',
    publicId: 'Starcon',
    createdAt: 1,
    updatedAt: 1,
  });
  insert('periods', {
    ownerType: 'event',
    ownerId: EVENT,
    sortOrder: 0,
    startDate: '2025-07-12',
    endDate: '2025-07-12',
    precision: 'exact',
    precisionNote: '',
    label: '',
  });
  insert('diary-entries', {
    diaryUuid: DIARY,
    date: '2025-09-14',
    access: 'public',
    createdAt: 1,
    updatedAt: 1,
  });
  text('diary-entry', DIARY, 'diary-body', [
    paragraph(
      'd1',
      'Завтра примерка с париком, весь день шила. Бублику тоже понравилось.',
    ),
  ]);
  insert('diary-entries', {
    diaryUuid: PRIVATE_DIARY,
    date: '2025-09-15',
    access: 'private',
    createdAt: 1,
    updatedAt: 1,
  });
  text('diary-entry', PRIVATE_DIARY, 'diary-body', [
    paragraph('d2', 'Только для себя: облепиха.'),
  ]);
  insert('diary-entries', {
    diaryUuid: FUTURE_DIARY,
    date: tomorrow,
    access: 'public',
    createdAt: 1,
    updatedAt: 1,
  });
  text('diary-entry', FUTURE_DIARY, 'diary-body', [
    paragraph('d3', 'Ещё не наступило: черёмуха.'),
  ]);
  text('project', PROJECT, 'project-notes', [
    paragraph('n1', 'Себе на память: шиповник.'),
  ]);
  insert('entity-relations', {
    firstType: 'project',
    firstId: PROJECT,
    secondType: 'project',
    secondId: HIDDEN_PROJECT,
    type: 'related',
    note: { type: 'shared', text: 'Тот же склад, секвойя' },
    firstSortOrder: 0,
    secondSortOrder: 0,
  });
  insert('entity-relations', {
    firstType: 'event',
    firstId: EVENT,
    secondType: 'project',
    secondId: PROJECT,
    type: 'related',
    note: { type: 'shared', text: 'Там я показала кедровый посох' },
    firstSortOrder: 0,
    secondSortOrder: 1,
  });
  insert('statuses', {
    id: 'st-1',
    ownerType: 'project',
    ownerId: PROJECT,
    kind: 'regular',
    text: 'Жду ткань цвета фуксии',
    date: '2025-05-01',
    createdAt: 1,
  });
  useSearchStore(':memory:');
  await rebuildSearchIndex();
});

afterEach(async () => {
  closeSearchStore();
  await context.close();
});

const search = (q: string, patch: Partial<SearchRequest> = {}) =>
  runSearch({ q, audience: 'public', ...patch });
const hits = (response: SearchResponse): SearchHit[] =>
  response.groups.flatMap((group) => group.hits);
const titles = (response: SearchResponse) =>
  hits(response).map((hit) => hit.title);

describe('the global search', () => {
  it('finds every form of a word', async () => {
    for (const q of ['косплей', 'косплея', 'КОСПЛЕЕМ', 'косплей шедоухарт'])
      expect(titles(await search(q))).toContain('Косплей на Шедоухарт');
  });

  it('finds a section as a result of its own, naming its project', async () => {
    const response = await search('шкурила');
    expect(response.groups.map((group) => group.kind)).toEqual([
      'project-section',
    ]);
    const section = hits(response)[0]!;
    expect(section).toMatchObject({
      ref: `project-section:${SECTION}`,
      title: 'Парик и рога',
      parent: { title: 'Косплей на Шедоухарт' },
    });
    expect(section.href.startsWith(section.parent!.href)).toBe(true);
    expect(section.editHref).toBeUndefined();
    // The project is found by the titles of its parts, leading to them.
    const project = hits(await search('парик и рога', { kind: 'project' }))[0]!;
    expect(
      project.finds.find((find) => find.where === 'section')?.href,
    ).toContain(section.href);
  });

  it('keeps a private section to the owner, with its lock and its editor', async () => {
    expect((await search('бархат')).total).toBe(0);
    const section = hits(await search('бархат', { audience: 'owner' }))[0]!;
    expect(section).toMatchObject({
      kind: 'project-section',
      title: 'Расходы',
      access: 'private',
      editHref: `/admin/projects/${PROJECT}/edit/?section=Rashody`,
    });
  });

  it('takes in a section saved anew, and its project renamed', async () => {
    context.rawDb
      .prepare(
        'UPDATE "project-content-sections" SET title = ?, updatedAt = ? WHERE sectionUuid = ?',
      )
      .run('Рога из пластика', Date.now() + 5000, SECTION);
    await refreshSearchIndex();
    const renamed = await search('пластика');
    expect(renamed.groups[0]!.hits[0]!.title).toBe('Рога из пластика');
    context.rawDb
      .prepare(
        'UPDATE projects SET title = ?, updatedAt = ? WHERE projectUuid = ?',
      )
      .run('Костюм ведьмы', Date.now() + 6000, PROJECT);
    await refreshSearchIndex();
    expect(hits(await search('пластика'))[0]!.parent?.title).toBe(
      'Костюм ведьмы',
    );
  });

  it('puts a result named by the words before one that only says them', async () => {
    insert('events', {
      eventUuid: 'e-mention',
      title: 'Ярмарка в Твери',
      summary: 'Видела там рога и копыта',
      access: 'public',
      humanReadableSlug: 'yarmarka',
      publicId: 'Yarmarka',
      createdAt: 1,
      updatedAt: 1,
    });
    insert('events', {
      eventUuid: 'e-named',
      title: 'Рога оленя',
      summary: 'Нашла в лесу',
      access: 'public',
      humanReadableSlug: 'roga',
      publicId: 'Roga',
      createdAt: 1,
      updatedAt: 1,
    });
    await rebuildSearchIndex();
    const events = await search('рога', { kind: 'event' });
    expect(titles(events)[0]).toBe('Рога оленя');
    const mention = hits(events).find(
      (hit) => hit.title === 'Ярмарка в Твери',
    )!;
    expect(mention.summarySegments?.some((segment) => segment.mark)).toBe(true);
  });

  it('reads a query of words that only hold a sentence together as a phrase', async () => {
    insert('pages', {
      pageUuid: 'g-where',
      title: 'Где я была',
      summary: '',
      slug: 'gde-ya-byla',
      access: 'public',
      createdAt: 1,
      updatedAt: 1,
    });
    // The same words near, in another order: neither found nor counted.
    insert('diary-entries', {
      diaryUuid: 'd-apart',
      date: '2025-08-01',
      access: 'public',
      createdAt: 1,
      updatedAt: 1,
    });
    text('diary-entry', 'd-apart', 'diary-body', [
      paragraph('a1', 'Была я там, где нет связи.'),
    ]);
    await rebuildSearchIndex();
    const response = await search('где я была');
    expect(titles(response)).toEqual(['Где я была']);
    expect(response.total).toBe(1);
    expect(response.groups[0]!.hits[0]!.titleSegments?.[0]?.mark).toBe(true);
  });

  it('marks the words found and leads to the block', async () => {
    const hit = hits(await search('шкурила'))[0]!;
    const find = hit.finds[0]!;
    expect(find.segments.find((segment) => segment.mark)?.text).toBe('шкурила');
    expect(find.href).toMatch(/#b-s1:~:text=/);
  });

  it('finds a hint, a short name, a dotted one and a sign in a name', async () => {
    expect(
      hits(await search('жрица')).map((hit) => hit.finds[0]?.where),
    ).toContain('hint');
    for (const q of [
      '2B',
      '2b',
      'vue',
      'vue.js',
      'js',
      'C#',
      'nier',
      'automata',
    ])
      expect(titles(await search(q)), q).toContain('Косплей на Шедоухарт');
  });

  it('never shows a stranger what the page does not', async () => {
    for (const q of [
      'мандрагора',
      'бергамот',
      'облепиха',
      'кувшинка',
      'черёмуха',
      'Переезд',
    ])
      expect((await search(q)).total, q).toBe(0);
  });

  it('shows the owner everything, saying who else may see it', async () => {
    const owner = (q: string) => search(q, { audience: 'owner' });
    expect(hits(await owner('облепиха'))[0]?.access).toBe('private');
    expect(hits(await owner('кувшинка'))[0]?.access).toBe('link-only');
    expect(titles(await owner('мандрагора'))).toContain('Косплей на Шедоухарт');
    expect(titles(await owner('бергамот')).sort()).toEqual(
      ['Переезд', 'Расходы'].sort(),
    );
    expect((await owner('черёмуха')).total).toBe(1);
  });

  it('keeps notes, and relations to what a stranger cannot open, from a stranger', async () => {
    for (const q of ['шиповник', 'секвойя'])
      expect((await search(q)).total, q).toBe(0);
    const notes = hits(await search('шиповник', { audience: 'owner' }))[0]!;
    expect(notes.finds[0]).toMatchObject({ where: 'notes' });
    expect(notes.finds[0]!.href).toMatch(/#b-n1:~:text=/);
    expect(
      (await search('секвойя', { audience: 'owner' })).total,
    ).toBeGreaterThan(0);
  });

  it('leads each find to its place, out of whatever hides it', async () => {
    const find = async (q: string) => hits(await search(q))[0]!.finds[0]!;
    const relation = await find('кедровый');
    expect(relation.where).toBe('relation');
    expect(relation.href).toMatch(/#r-(event|project)~%2F(events|projects)%2F/);
    expect((await find('фуксии')).href).toMatch(/#statuses~2025-05-01:~:text=/);
    expect((await find('жрица')).href).toMatch(/#b-b1:~:text=/);
  });

  it('opens every place of a result, each once, for its reader alone', async () => {
    const hit = hits(await search('рога'))[0]!;
    const all = findsOfResult({ q: 'рога', audience: 'public', ref: hit.ref })!;
    expect(all.finds.length).toBe(hit.finds.length + hit.more);
    expect(all.more).toBe(0);
    expect(
      new Set(all.finds.map((find) => `${find.where}:${find.href}`)).size,
    ).toBe(all.finds.length);
    expect(
      findsOfResult({
        q: 'облепиха',
        audience: 'public',
        ref: `diary-entry:${PRIVATE_DIARY}`,
      }),
    ).toBeUndefined();
  });

  it('falls back on some of the words, and says so', async () => {
    const some = await search('шкурила бегемота');
    expect(some.partial).toBe(true);
    expect(titles(some)).toContain('Парик и рога');
    expect((await search('шкурила рога')).partial).toBeUndefined();
    expect((await search('бегемота')).total).toBe(0);
  });

  it('reads a question by the words that hold some meaning', async () => {
    const asked = await search('что шкурила для бегемота');
    expect(asked.partial).toBeUndefined();
    expect(titles(asked)).toContain('Парик и рога');
  });

  it('finds a Latin name by the letters of the site', async () => {
    insert('events', {
      eventUuid: 'e-eva',
      title: 'Броня из EVA',
      summary: 'Собрала в Blender',
      access: 'public',
      humanReadableSlug: 'eva',
      publicId: 'Eva',
      createdAt: 1,
      updatedAt: 1,
    });
    await rebuildSearchIndex();
    for (const q of ['броня из евы', 'ева', 'в блендере']) {
      const response = await search(q);
      expect(titles(response), q).toContain('Броня из EVA');
      expect(response.partial, q).toBeUndefined();
    }
    const hit = hits(await search('броня из евы'))[0]!;
    expect(
      hit.titleSegments?.filter((segment) => segment.mark).map((s) => s.text),
    ).toEqual(['Броня', 'EVA']);
  });

  it('reads a word that names a kind as asking for that kind', async () => {
    expect((await search('проект рога')).groups[0]!.kind).toBe('project');
    expect((await search('раздел рога')).groups[0]!.kind).toBe(
      'project-section',
    );
    // Alone, the word is a word like any other.
    expect((await search('событие')).total).toBe(0);
  });

  it('reads one kind by its days when asked', async () => {
    insert('diary-entries', {
      diaryUuid: 'd-later',
      date: '2025-10-01',
      access: 'public',
      createdAt: 1,
      updatedAt: 1,
    });
    text('diary-entry', 'd-later', 'diary-body', [
      paragraph('d9', 'Шила снова, и париком довольна.'),
    ]);
    await rebuildSearchIndex();
    const days = (sort?: 'new' | 'old') =>
      search('париком', {
        kind: 'diary-entry',
        ...(sort ? { sort } : {}),
      }).then((response) => hits(response).map((hit) => hit.date));
    expect(await days('new')).toEqual(['2025-10-01', '2025-09-14']);
    expect(await days('old')).toEqual(['2025-09-14', '2025-10-01']);
    // Every kind's few too, with no kind chosen.
    const grouped = await search('париком', { sort: 'old' });
    expect(
      grouped.groups
        .find((group) => group.kind === 'diary-entry')!
        .hits.map((hit) => hit.date),
    ).toEqual(['2025-09-14', '2025-10-01']);
  });

  it('reads every kind by its days: of a life, or of when it was made', async () => {
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    // Pages by when they were added, saying so.
    for (const [uuid, title, createdAt] of [
      ['g-old', 'Заметки о шитье', Date.parse('2024-03-01')],
      ['g-new', 'Шитьё и выкройки', Date.parse('2026-01-15')],
    ] as const)
      insert('pages', {
        pageUuid: uuid,
        title,
        summary: '',
        slug: uuid,
        access: 'public',
        createdAt,
        updatedAt: Date.now(),
      });
    // A project with a dated section reads by its days; one with none comes
    // after it, by when it was made.
    insert('periods', {
      ownerType: 'project-section',
      ownerId: SECTION,
      sortOrder: 0,
      startDate: '2025-02-01',
      endDate: '2025-04-01',
      precision: 'exact',
      precisionNote: '',
      label: '',
    });
    project(
      'p-44444444-4444-4444-8444-444444444444',
      'Косплей для штор',
      'public',
      {
        createdAt: Date.parse('2026-06-01'),
      },
    );
    await rebuildSearchIndex();
    const pages = await search('шитьё', { kind: 'page', sort: 'new' });
    expect(titles(pages)).toEqual(['Шитьё и выкройки', 'Заметки о шитье']);
    expect(hits(pages)[0]!.dated).toEqual({
      by: 'added',
      day: day(Date.parse('2026-01-15')),
    });
    expect(
      titles(await search('шитьё', { kind: 'page', sort: 'old' })),
    ).toEqual(['Заметки о шитье', 'Шитьё и выкройки']);
    // Without sorting, no day is said for it.
    expect(
      hits(await search('шитьё', { kind: 'page' }))[0]!.dated,
    ).toBeUndefined();

    for (const sort of ['new', 'old'] as const) {
      const projects = await search('косплей', { kind: 'project', sort });
      expect(titles(projects)).toEqual([
        'Косплей на Шедоухарт',
        'Косплей для штор',
      ]);
      expect(hits(projects)[0]!.dated).toBeUndefined();
      expect(hits(projects)[1]!.dated).toEqual({
        by: 'added',
        day: '2026-06-01',
      });
    }
    // A tag goes by the days of what carries it.
    const tags = await search('косплей', { kind: 'tag', sort: 'new' });
    expect(hits(tags)[0]!.dated).toEqual({
      by: 'last-used',
      day: '2025-04-01',
    });
  });

  it('puts first what is named exactly as typed', async () => {
    const groups = (await search('косплей')).groups;
    expect(groups[0]!.kind).toBe('tag');
    expect(groups[0]!.hits[0]!.title).toBe('Косплей');
    expect(groups.map((group) => group.kind)).toContain('project');
  });

  it('finds by another name without showing it', async () => {
    const hit = hits(await search('трактир'))[0]!;
    expect(hit.title).toBe('Косплей на Шедоухарт');
    expect(hit.finds[0]).toMatchObject({ where: 'name', segments: [] });
  });

  it('does not insist on words that hold a sentence together', async () => {
    expect(titles(await search('фестиваль с маяком'))).toContain('Starcon');
  });

  it('reads a query typed on the other keyboard', async () => {
    const response = await search(',e,kbre');
    expect(response.keyboard).toBe('бублику');
    expect(titles(response)).toContain('2025-09-14');
  });

  it('finds the diary of a day the query names', async () => {
    expect(titles(await search('14 сентября 2025'))).toEqual(['2025-09-14']);
  });

  it('answers the quick search with one find each', async () => {
    const response = await search('шедо', { quick: true, typing: true });
    expect(hits(response).every((hit) => hit.finds.length <= 1)).toBe(true);
    expect(titles(response)).toContain('Косплей на Шедоухарт');
  });

  it('counts kinds and filters by one', async () => {
    const response = await search('косплей');
    expect(response.facets.kinds.project).toBe(1);
    expect(response.facets.kinds.tag).toBe(1);
    const tags = await search('косплей', { kind: 'tag' });
    expect(titles(tags)).toEqual(['Косплей']);
  });

  it('takes in what was saved on the next pass', async () => {
    context.rawDb
      .prepare(
        'UPDATE projects SET title = ?, updatedAt = ? WHERE projectUuid = ?',
      )
      .run('Костюм ведьмы', Date.now() + 5000, PROJECT);
    await refreshSearchIndex();
    expect(titles(await search('ведьмы'))).toContain('Костюм ведьмы');
  });

  it('lists the catalogue without a query', async () => {
    const response = await search('');
    expect(titles(response).sort()).toEqual(
      ['Starcon', 'Косплей на Шедоухарт'].sort(),
    );
  });
});
