import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import {
  countPublicSearchFilters,
  parsePublicSearchFilters,
  publicSearchQuery,
} from '../../shared/public-search';
import {
  catalogueEntries,
  filterCatalogue,
} from '../../server/thei/search/catalogue';
import {
  closeSearchStore,
  rebuildSearchIndex,
  useSearchStore,
} from '../../server/thei/search/indexer';
import { runSearch } from '../../server/thei/search/query';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

describe('public search filters in the URL', () => {
  it('parses and serializes without defaults', () => {
    const parsed = parsePublicSearchFilters({
      q: 'сад',
      type: 'project',
      showcase: '1',
      tags: 'web,web,game',
      exclude: 'game,old',
      year: '2024',
      page: '3',
    });
    expect(parsed).toEqual({
      q: 'сад',
      type: 'project',
      showcase: true,
      cv: false,
      tags: ['web', 'game'],
      exclude: ['old'],
      year: 2024,
      page: 3,
    });
    expect(publicSearchQuery(parsed, parsed.page)).toEqual({
      q: 'сад',
      type: 'project',
      showcase: '1',
      tags: 'web,game',
      exclude: 'old',
      year: '2024',
      page: '3',
    });
    const { page: _page, ...filters } = parsePublicSearchFilters({});
    expect(publicSearchQuery(filters)).toEqual({});
    expect(countPublicSearchFilters(parsed)).toBe(6);
  });

  it('takes every kind the search finds, and nothing else', () => {
    expect(parsePublicSearchFilters({ type: 'diary-entry' }).type).toBe(
      'diary-entry',
    );
    expect(parsePublicSearchFilters({ type: 'file' }).type).toBe('file');
    expect(parsePublicSearchFilters({ type: 'nonsense' }).type).toBeUndefined();
    expect(parsePublicSearchFilters({ year: '24' }).year).toBeUndefined();
  });

  it('drops project-only filters for any other kind', () => {
    expect(
      parsePublicSearchFilters({ type: 'event', showcase: '1', cv: '1' }),
    ).toMatchObject({ type: 'event', showcase: false, cv: false });
    expect(
      parsePublicSearchFilters({ type: 'page', showcase: '1' }),
    ).toMatchObject({ showcase: false });
  });
});

describe('the catalogue', () => {
  let context: Awaited<ReturnType<typeof freshTestDb>>;
  const row = { summary: '', createdAt: 1, updatedAt: 1 };

  beforeEach(async () => {
    context = await freshTestDb();
    Object.assign(context.server, serverRepositories);
    const project = (uuid: string, patch: Record<string, unknown>) =>
      context.insert('projects', {
        ...row,
        projectUuid: uuid,
        publicId: uuid,
        humanReadableSlug: uuid,
        title: uuid,
        access: ProjectEventAccessLevel.Public,
        ...patch,
      });
    const event = (
      uuid: string,
      endDate: string,
      patch: Record<string, unknown> = {},
    ) => {
      context.insert('events', {
        ...row,
        eventUuid: uuid,
        publicId: uuid,
        humanReadableSlug: uuid,
        title: uuid,
        access: ProjectEventAccessLevel.Public,
        ...patch,
      });
      context.insert('periods', {
        ownerType: 'event',
        ownerId: uuid,
        sortOrder: 0,
        startDate: endDate,
        endDate,
        precision: 'exact',
        precisionNote: '',
        label: '',
      });
    };
    project('best', { showcase: 1, cv: 1 });
    project('mid-project', { createdAt: Date.parse('2024-01-01') });
    project('private', {
      access: ProjectEventAccessLevel.Private,
      createdAt: Date.parse('2027-01-01'),
    });
    project('hidden-link', { access: ProjectEventAccessLevel.LinkOnly });
    event('old-event', '2020-05-01');
    event('new-event', '2026-05-01');
    for (const [uuid, slug] of [
      ['t-web', 'web'],
      ['t-game', 'game'],
    ])
      context.insert('tags', {
        tagUuid: uuid!,
        title: slug!,
        normalizedTitle: slug!,
        slug: slug!,
        publicId: slug!,
        updatedAt: 1,
      });
    context.insert('tag-usages', {
      tagUuid: 't-web',
      containerType: 'project',
      containerId: 'mid-project',
      sortOrder: 0,
    });
    context.insert('tag-usages', {
      tagUuid: 't-game',
      containerType: 'project',
      containerId: 'mid-project',
      sortOrder: 1,
    });
    context.insert('tag-usages', {
      tagUuid: 't-web',
      containerType: 'event',
      containerId: 'new-event',
      sortOrder: 0,
    });
  });

  afterEach(async () => {
    closeSearchStore();
    await context.close();
  });

  const list = (query: Record<string, unknown>, isAdmin = false) => {
    const { page: _page, ...filters } = parsePublicSearchFilters(query);
    return filterCatalogue(catalogueEntries(isAdmin), filters).entries.map(
      (entry) => entry.uuid,
    );
  };

  it('puts showcase projects first, then everything newest first', () => {
    expect(list({})).toEqual(['best', 'new-event', 'mid-project', 'old-event']);
    expect(list({}, true)[1]).toBe('private');
  });

  it('filters by type, showcase and CV', () => {
    expect(list({ type: 'event' })).toEqual(['new-event', 'old-event']);
    expect(list({ showcase: '1' })).toEqual(['best']);
    expect(list({ cv: '1', type: 'project' })).toEqual(['best']);
  });

  it('requires included tags and rejects excluded ones', () => {
    expect(list({ tags: 'web' })).toEqual(['new-event', 'mid-project']);
    expect(list({ tags: 'web,game' })).toEqual(['mid-project']);
    expect(list({ exclude: 'game' })).toEqual([
      'best',
      'new-event',
      'old-event',
    ]);
    expect(list({ tags: 'unknown' })).toEqual([
      'best',
      'new-event',
      'mid-project',
      'old-event',
    ]);
  });

  it('finds projects and events by the readable part of their URL', async () => {
    context.rawDb
      .prepare(
        "UPDATE projects SET humanReadableSlug = 'green-garden', title = 'Сад' WHERE projectUuid = 'mid-project'",
      )
      .run();
    context.rawDb
      .prepare(
        "UPDATE events SET humanReadableSlug = 'stone-garden', title = 'Камни' WHERE eventUuid = 'old-event'",
      )
      .run();
    Object.assign(context.server, {
      console: {
        log() {},
        warn() {},
        error() {},
        tag: () => ({ log() {}, warn() {}, error() {} }),
      },
    });
    useSearchStore(':memory:');
    await rebuildSearchIndex();
    const titles = async (q: string) =>
      (await runSearch({ q, audience: 'public' })).groups
        .flatMap((group) => group.hits.map((hit) => hit.title))
        .sort();
    expect(await titles('garden')).toEqual(['Камни', 'Сад']);
    expect(await titles('green garden')).toEqual(['Сад']);
    expect(await titles('stone-garden')).toEqual(['Камни']);
  });
});
