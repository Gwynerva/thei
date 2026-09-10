import { describe, expect, it } from 'vitest';
import { buildPublicCanonical } from '../../../app/composables/public-canonical';

describe('buildPublicCanonical', () => {
  it('omits default pagination and tab values', () => {
    expect(buildPublicCanonical('/projects/', { page: 1 })).toBe('/projects/');
    expect(
      buildPublicCanonical('/tags/example/', {
        page: 1,
        tab: 'projects',
      }),
    ).toBe('/tags/example/');
  });

  it.each([2, 4, 9])(
    'keeps pagination page %s and the events tab in stable query order',
    (page) => {
      expect(
        buildPublicCanonical('/tags/example/', { page, tab: 'events' }),
      ).toBe(`/tags/example/?tab=events&page=${page}`);
    },
  );

  it('ignores invalid and non-positive pages', () => {
    expect(buildPublicCanonical('/projects/', { page: 0 })).toBe('/projects/');
    expect(buildPublicCanonical('/projects/', { page: 1.5 })).toBe(
      '/projects/',
    );
  });
});
