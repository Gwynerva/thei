import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeSearchStore,
  rebuildSearchIndex,
  refreshSearchIndex,
  useSearchStore,
} from '../../../server/thei/search/indexer';
import { runSearch, type SearchRequest } from '../../../server/thei/search/query';
import type { SearchHit, SearchResponse } from '../../../shared/search/api';
import { freshAiTestDb } from '../../helpers/fresh-ai-db';

/**
 * The search over the whole site, built from the pages' own builders for a
 * stranger and for the owner: what each finds, where, and what a stranger
 * never does.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;
const insert = (table: string, row: Record<string, unknown>) => context.insert(table, row);

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

const paragraph = (id: string, text: string) => ({ id, type: 'paragraph', data: { text } });
let contentSeq = 0;
function text(ownerType: string, ownerId: string, slot: string, blocks: unknown[]) {
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

function project(uuid: string, title: string, access: string, patch: Record<string, unknown> = {}) {
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

const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

beforeEach(async () => {
  context = await freshAiTestDb();
  insert('profiles', { profileId: 'profile', displayName: 'Варвара', slogan: 'Шью костюмы' });
  project(PROJECT, 'Косплей на Шедоухарт', 'public', {
    summary: 'Костюм, парик и рога',
    synonyms: ['Трактир'],
  });
  project(HIDDEN_PROJECT, 'Переезд', 'private');
  project(LINK_PROJECT, 'AR-гид для музея', 'link-only');
  text('project', PROJECT, 'project-description', [
    paragraph('b1', 'Дошила плащ для <abbr data-content-hint="жрица Шар">косплея</abbr>.'),
    { id: 'p-start', type: 'privateSectionBoundary', data: { sectionId: 'x', edge: 'start' } },
    paragraph('b2', 'Бюджет на линзы держу в секрете: мандрагора.'),
    { id: 'p-end', type: 'privateSectionBoundary', data: { sectionId: 'x', edge: 'end' } },
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
  text('project', HIDDEN_PROJECT, 'project-description', [paragraph('h1', 'Коробки, бергамот и скотч.')]);
  text('project', LINK_PROJECT, 'project-description', [paragraph('l1', 'Речной флот и кувшинка.')]);
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
  insert('tag-usages', { tagUuid: TAG, containerType: 'project', containerId: PROJECT, sortOrder: 0 });
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
  insert('periods', { ownerType: 'event', ownerId: EVENT, sortOrder: 0, startDate: '2025-07-12', endDate: '2025-07-12', precision: 'exact', precisionNote: '', label: '' });
  insert('diary-entries', { diaryUuid: DIARY, date: '2025-09-14', access: 'public', createdAt: 1, updatedAt: 1 });
  text('diary-entry', DIARY, 'diary-body', [paragraph('d1', 'Завтра примерка с париком, весь день шила. Бублику тоже понравилось.')]);
  insert('diary-entries', { diaryUuid: PRIVATE_DIARY, date: '2025-09-15', access: 'private', createdAt: 1, updatedAt: 1 });
  text('diary-entry', PRIVATE_DIARY, 'diary-body', [paragraph('d2', 'Только для себя: облепиха.')]);
  insert('diary-entries', { diaryUuid: FUTURE_DIARY, date: tomorrow, access: 'public', createdAt: 1, updatedAt: 1 });
  text('diary-entry', FUTURE_DIARY, 'diary-body', [paragraph('d3', 'Ещё не наступило: черёмуха.')]);
  text('project', PROJECT, 'project-notes', [paragraph('n1', 'Себе на память: шиповник.')]);
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
const hits = (response: SearchResponse): SearchHit[] => response.groups.flatMap((group) => group.hits);
const titles = (response: SearchResponse) => hits(response).map((hit) => hit.title);

describe('the global search', () => {
  it('finds every form of a word, and the name with words in its sections', async () => {
    for (const q of ['косплей', 'косплея', 'КОСПЛЕЕМ', 'косплей шедоухарт'])
      expect(titles(await search(q))).toContain('Косплей на Шедоухарт');
    const found = hits(await search('шедоухарт рога')).find((hit) => hit.title === 'Косплей на Шедоухарт')!;
    expect(found.finds.map((find) => find.where)).toContain('text');
    expect(found.finds.find((find) => find.label === 'Парик и рога')?.href).toContain('#b-s1');
  });

  it('marks the words found and leads to the block', async () => {
    const hit = hits(await search('шкурила'))[0]!;
    const find = hit.finds[0]!;
    expect(find.segments.find((segment) => segment.mark)?.text).toBe('шкурила');
    expect(find.href).toMatch(/#b-s1:~:text=/);
  });

  it('finds a hint, a short name, a dotted one and a sign in a name', async () => {
    expect(hits(await search('жрица')).map((hit) => hit.finds[0]?.where)).toContain('hint');
    for (const q of ['2B', '2b', 'vue', 'vue.js', 'js', 'C#', 'nier', 'automata'])
      expect(titles(await search(q)), q).toContain('Косплей на Шедоухарт');
  });

  it('never shows a stranger what the page does not', async () => {
    for (const q of ['мандрагора', 'бергамот', 'облепиха', 'кувшинка', 'черёмуха', 'Переезд'])
      expect((await search(q)).total, q).toBe(0);
  });

  it('shows the owner everything, saying who else may see it', async () => {
    const owner = (q: string) => search(q, { audience: 'owner' });
    expect(hits(await owner('облепиха'))[0]?.access).toBe('private');
    expect(hits(await owner('кувшинка'))[0]?.access).toBe('link-only');
    expect(titles(await owner('мандрагора'))).toContain('Косплей на Шедоухарт');
    expect(titles(await owner('бергамот')).sort()).toEqual(['Косплей на Шедоухарт', 'Переезд'].sort());
    expect((await owner('черёмуха')).total).toBe(1);
  });

  it('keeps notes, and relations to what a stranger cannot open, from a stranger', async () => {
    for (const q of ['шиповник', 'секвойя']) expect((await search(q)).total, q).toBe(0);
    const notes = hits(await search('шиповник', { audience: 'owner' }))[0]!;
    expect(notes.finds[0]).toMatchObject({ where: 'notes' });
    expect(notes.finds[0]!.href).toMatch(/#b-n1:~:text=/);
    expect((await search('секвойя', { audience: 'owner' })).total).toBeGreaterThan(0);
  });

  it('leads each find to its place, out of whatever hides it', async () => {
    const find = async (q: string) => hits(await search(q))[0]!.finds[0]!;
    const relation = await find('кедровый');
    expect(relation.where).toBe('relation');
    expect(relation.href).toMatch(/#r-(event|project)~%2F(events|projects)%2F/);
    expect((await find('фуксии')).href).toMatch(/#statuses~2025-05-01:~:text=/);
    expect((await find('жрица')).href).toMatch(/#b-b1:~:text=/);
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
      .prepare('UPDATE projects SET title = ?, updatedAt = ? WHERE projectUuid = ?')
      .run('Костюм ведьмы', Date.now() + 5000, PROJECT);
    await refreshSearchIndex();
    expect(titles(await search('ведьмы'))).toContain('Костюм ведьмы');
  });

  it('lists the catalogue without a query', async () => {
    const response = await search('');
    expect(titles(response).sort()).toEqual(['Starcon', 'Косплей на Шедоухарт'].sort());
  });
});
