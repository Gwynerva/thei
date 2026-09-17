import { describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import {
  countPublicSearchFilters,
  normalizePublicSearchText,
  parsePublicSearchFilters,
  publicSearchQuery,
} from '../../shared/public-search';
import {
  comparePublicSearchDocuments,
  searchPublicDocuments,
  type PublicSearchDocument,
} from '../../server/thei/public/search-index';

function doc(
  uuid: string,
  patch: Partial<PublicSearchDocument> = {},
): PublicSearchDocument {
  return {
    type: 'project',
    uuid,
    access: ProjectEventAccessLevel.Public,
    showcase: false,
    cv: false,
    sortDate: '2026-01-01',
    createdAt: 0,
    tagUuids: [],
    text: uuid,
    ...patch,
  };
}

const filters = parsePublicSearchFilters({});
const tagUuidsBySlug = new Map([
  ['web', 't-web'],
  ['game', 't-game'],
]);

function search(
  documents: PublicSearchDocument[],
  query: Record<string, unknown>,
  isAdmin = false,
) {
  const { page: _page, ...parsed } = parsePublicSearchFilters(query);
  return searchPublicDocuments(
    {
      documents: [...documents].sort(comparePublicSearchDocuments),
      tagUuidsBySlug,
    },
    parsed,
    isAdmin,
  ).documents.map((document) => document.uuid);
}

describe('public search filters in the URL', () => {
  it('parses and serializes without defaults', () => {
    const parsed = parsePublicSearchFilters({
      q: 'сад',
      type: 'project',
      showcase: '1',
      tags: 'web,web,game',
      exclude: 'game,old',
      page: '3',
    });
    expect(parsed).toEqual({
      q: 'сад',
      type: 'project',
      showcase: true,
      cv: false,
      tags: ['web', 'game'],
      exclude: ['old'],
      page: 3,
    });
    expect(publicSearchQuery(parsed, parsed.page)).toEqual({
      q: 'сад',
      type: 'project',
      showcase: '1',
      tags: 'web,game',
      exclude: 'old',
      page: '3',
    });
    expect(publicSearchQuery(filters)).toEqual({});
    expect(countPublicSearchFilters(parsed)).toBe(5);
  });

  it('drops project-only filters for events', () => {
    expect(
      parsePublicSearchFilters({ type: 'event', showcase: '1', cv: '1' }),
    ).toMatchObject({ type: 'event', showcase: false, cv: false });
  });
});

describe('public search documents', () => {
  const documents = [
    doc('old-event', { type: 'event', sortDate: '2020-05-01' }),
    doc('new-event', { type: 'event', sortDate: '2026-05-01' }),
    doc('best', { showcase: true, sortDate: '2019-01-01', cv: true }),
    doc('mid-project', { sortDate: '2024-01-01', tagUuids: ['t-web'] }),
    doc('private', {
      access: ProjectEventAccessLevel.Private,
      sortDate: '2027-01-01',
    }),
    doc('hidden-link', { access: ProjectEventAccessLevel.LinkOnly }),
  ];

  it('puts showcase projects first, then everything newest first', () => {
    expect(search(documents, {})).toEqual([
      'best',
      'new-event',
      'mid-project',
      'old-event',
    ]);
    expect(search(documents, {}, true)[1]).toBe('private');
  });

  it('matches every query word, ignoring case and ё', () => {
    const texts = [
      doc('a', { text: normalizePublicSearchText('Зелёный сад web') }),
      doc('b', { text: normalizePublicSearchText('Сад камней') }),
    ];
    expect(search(texts, { q: 'САД зеленый' })).toEqual(['a']);
    expect(search(texts, { q: '  сад ' })).toEqual(['a', 'b']);
  });

  it('filters by type, showcase and CV', () => {
    expect(search(documents, { type: 'event' })).toEqual([
      'new-event',
      'old-event',
    ]);
    expect(search(documents, { showcase: '1' })).toEqual(['best']);
    expect(search(documents, { cv: '1', type: 'project' })).toEqual(['best']);
  });

  it('requires included tags and rejects excluded ones', () => {
    const tagged = [
      doc('both', { tagUuids: ['t-web', 't-game'] }),
      doc('web', { tagUuids: ['t-web'], sortDate: '2025-01-01' }),
      doc('none', { sortDate: '2024-01-01' }),
    ];
    expect(search(tagged, { tags: 'web' })).toEqual(['both', 'web']);
    expect(search(tagged, { tags: 'web,game' })).toEqual(['both']);
    expect(search(tagged, { exclude: 'game' })).toEqual(['web', 'none']);
    expect(search(tagged, { tags: 'unknown' })).toEqual([
      'both',
      'web',
      'none',
    ]);
  });
});
