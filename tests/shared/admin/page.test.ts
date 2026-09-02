import { describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../../shared/access-level';
import {
  normalizePageSlug,
  pageSlugIsTaken,
  pageSlugIsValid,
  validatePageData,
} from '../../../shared/admin/page';
import type { PageEditData } from '../../../shared/page';

function pageData(overrides: Partial<PageEditData> = {}): PageEditData {
  return {
    title: 'About',
    summary: 'A page about the site',
    slug: 'about',
    access: ProjectEventAccessLevel.Public,
    content: {
      data: {
        blocks: [{ type: 'paragraph', data: { text: 'Page body' } }],
      },
    },
    ...overrides,
  };
}

describe('page validation', () => {
  it('rejects a missing payload', () => {
    expect(validatePageData(undefined)).toBe('Invalid page data');
  });

  it('requires title, summary, slug, access, and non-empty content', () => {
    expect(validatePageData(pageData({ title: ' ' }))).toBe(
      'Title cannot be empty',
    );
    expect(validatePageData(pageData({ summary: ' ' }))).toBe(
      'Summary cannot be empty',
    );
    expect(validatePageData(pageData({ slug: ' ' }))).toBe(
      'Slug cannot be empty',
    );
    expect(validatePageData(pageData({ access: '' }))).toBe(
      'Invalid access level',
    );
    expect(
      validatePageData(pageData({ content: { data: { blocks: [] } } })),
    ).toBe('Page content is required');
  });

  it('accepts and normalizes a complete page', () => {
    expect(
      validatePageData(pageData({ slug: '  about-page  ' })),
    ).toMatchObject({
      title: 'About',
      summary: 'A page about the site',
      slug: 'about-page',
      access: ProjectEventAccessLevel.Public,
    });
  });

  it('allows only canonical URL-safe slugs', () => {
    expect(pageSlugIsValid('about-page-2')).toBe(true);
    expect(pageSlugIsValid('About')).toBe(true);
    expect(pageSlugIsValid('about--page')).toBe(false);
    expect(pageSlugIsValid('страница')).toBe(false);
    expect(normalizePageSlug('  ABOUT  ')).toBe('about');
  });

  it('checks the preloaded slug set while excluding the edited page slug', () => {
    const registered = ['about', 'contacts'];
    expect(pageSlugIsTaken('about', registered)).toBe(true);
    expect(pageSlugIsTaken('ABOUT', registered, 'about')).toBe(false);
    expect(pageSlugIsTaken('contacts', registered, 'about')).toBe(true);
    expect(pageSlugIsTaken('new-page', registered, 'about')).toBe(false);
  });
});
