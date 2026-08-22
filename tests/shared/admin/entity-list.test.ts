import { describe, expect, it } from 'vitest';
import {
  canonicalizeAdminEntityListRouteQuery,
  paginateAdminEntities,
  resolveAdminPagination,
} from '../../../shared/admin/entity-list';

const items = [
  entity('p1', 'Первый проект', 'Краткая суть', 'pervyi', 'PUBLIC1', 10, 40),
  entity(
    'p2',
    'Second',
    'Summary',
    'second',
    'PUBLIC2',
    20,
    30,
    'Текст описания',
  ),
  entity('p3', 'Third', 'Résumé', 'third', 'PUBLIC3', 30, 50),
];

describe('admin entity list', () => {
  it.each([
    ['первый', 'p1'],
    ['КРАТКАЯ', 'p1'],
    ['pervyi', 'p1'],
    ['public1', 'p1'],
    ['ОПИСАНИЯ', 'p2'],
    ['Re\u0301sume\u0301', 'p3'],
  ])('searches every requested field for %s', (query, expected) => {
    expect(paginateAdminEntities(items, { q: query }).items[0]?.entityId).toBe(
      expected,
    );
  });

  it('sorts newest by update, then creation and stable id', () => {
    const tied = [
      entity('b', 'B', '', 'b', 'B', 1, 5),
      entity('a', 'A', '', 'a', 'A', 1, 5),
    ];
    expect(
      paginateAdminEntities([...items, ...tied], { order: 'newest' }).items.map(
        (item) => item.entityId,
      ),
    ).toEqual(['p3', 'p1', 'p2', 'a', 'b']);
  });

  it('sorts oldest only by creation and stable id', () => {
    expect(
      paginateAdminEntities(items, { order: 'oldest' }).items.map(
        (item) => item.entityId,
      ),
    ).toEqual(['p1', 'p2', 'p3']);
  });

  it('clamps page and page size and reports an empty page consistently', () => {
    const page = paginateAdminEntities(items, { page: 99, pageSize: 2 });
    expect(page).toMatchObject({
      total: 3,
      page: 2,
      pageSize: 2,
      pageCount: 2,
    });
    expect(page.items.map((item) => item.entityId)).toEqual(['p2']);

    expect(paginateAdminEntities(items, { q: 'missing', page: 8 })).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      pageCount: 1,
    });
  });

  it('canonicalizes list route parameters', () => {
    expect(
      canonicalizeAdminEntityListRouteQuery({
        q: '  архив  ',
        order: 'unknown',
        page: 'invalid',
      }),
    ).toEqual({ q: 'архив', order: undefined, page: undefined });
    expect(
      canonicalizeAdminEntityListRouteQuery(
        { q: '', order: 'oldest', page: '99' },
        2,
      ),
    ).toEqual({ q: undefined, order: 'oldest', page: 2 });
    expect(canonicalizeAdminEntityListRouteQuery({ page: ['2'] })).toEqual({
      q: undefined,
      order: undefined,
      page: undefined,
    });
  });

  it('normalizes pagination metadata independently from item loading', () => {
    expect(resolveAdminPagination(41, { page: 99, pageSize: 20 })).toEqual({
      total: 41,
      page: 3,
      pageSize: 20,
      pageCount: 3,
    });
    expect(
      resolveAdminPagination(Number.POSITIVE_INFINITY, {
        page: Number.NaN,
        pageSize: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ total: 0, page: 1, pageSize: 20, pageCount: 1 });
  });
});

function entity(
  entityId: string,
  title: string,
  summary: string,
  humanReadableSlug: string,
  publicId: string,
  createdAt: number,
  updatedAt: number,
  contentText = '',
) {
  return {
    entityId,
    title,
    summary,
    humanReadableSlug,
    publicId,
    createdAt,
    updatedAt,
    contentText,
  };
}
