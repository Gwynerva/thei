import { describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import {
  buildSitemapEntries,
  escapeXml,
  sitemapEntryXml,
  type SitemapInput,
} from '../../server/thei/public/sitemap';

const EPOCH = Date.UTC(2027, 3, 6);

function project(
  publicId: string,
  access: ProjectEventAccessLevel,
): SitemapInput['projects'][number] {
  return {
    projectUuid: `project-${publicId}`,
    access,
    humanReadableSlug: `slug-${publicId}`,
    publicId,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
}

function event(
  publicId: string,
  access: ProjectEventAccessLevel,
): SitemapInput['events'][number] {
  return {
    eventUuid: `event-${publicId}`,
    access,
    humanReadableSlug: `slug-${publicId}`,
    publicId,
    updatedAt: EPOCH,
  };
}

function input(overrides: Partial<SitemapInput> = {}): SitemapInput {
  return {
    projects: [],
    sections: [],
    excerpts: [],
    events: [],
    pages: [],
    diaryEntries: [],
    tags: [],
    tagUsages: [],
    ...overrides,
  };
}

const paths = (value: SitemapInput) =>
  buildSitemapEntries(value).map((entry) => entry.path);

describe('sitemap privacy', () => {
  it('lists public projects and withholds link-only and private ones', () => {
    const listed = paths(
      input({
        projects: [
          project('pub', ProjectEventAccessLevel.Public),
          project('link', ProjectEventAccessLevel.LinkOnly),
          project('priv', ProjectEventAccessLevel.Private),
        ],
      }),
    );
    expect(listed).toContain('/projects/slug-pub-pub/');
    expect(listed).not.toContain('/projects/slug-link-link/');
    expect(listed).not.toContain('/projects/slug-priv-priv/');
  });

  it('withholds link-only and private events and pages', () => {
    const listed = paths(
      input({
        events: [
          event('pub', ProjectEventAccessLevel.Public),
          event('link', ProjectEventAccessLevel.LinkOnly),
        ],
        pages: [
          {
            slug: 'open',
            access: ProjectEventAccessLevel.Public,
            updatedAt: EPOCH,
          },
          {
            slug: 'hidden',
            access: ProjectEventAccessLevel.Private,
            updatedAt: EPOCH,
          },
        ],
      }),
    );
    expect(listed).toContain('/events/slug-pub-pub/');
    expect(listed).not.toContain('/events/slug-link-link/');
    expect(listed).toContain('/pages/open/');
    expect(listed).not.toContain('/pages/hidden/');
  });

  it('withholds a private section inside a public project', () => {
    const parent = project('pub', ProjectEventAccessLevel.Public);
    const listed = paths(
      input({
        projects: [parent],
        sections: [
          {
            projectUuid: parent.projectUuid,
            humanReadableSlug: 'open-section',
            publicId: 's1',
            isPrivate: false,
            updatedAt: EPOCH,
          },
          {
            projectUuid: parent.projectUuid,
            humanReadableSlug: 'secret-section',
            publicId: 's2',
            isPrivate: true,
            updatedAt: EPOCH,
          },
        ],
      }),
    );
    expect(listed).toContain(
      '/projects/slug-pub-pub/sections/open-section-s1/',
    );
    expect(listed).not.toContain(
      '/projects/slug-pub-pub/sections/secret-section-s2/',
    );
  });

  it('withholds every child of a project that is not listable', () => {
    const parent = project('link', ProjectEventAccessLevel.LinkOnly);
    const listed = paths(
      input({
        projects: [parent],
        sections: [
          {
            projectUuid: parent.projectUuid,
            humanReadableSlug: 'open-section',
            publicId: 'g1',
            isPrivate: false,
            updatedAt: EPOCH,
          },
        ],
      }),
    );
    expect(listed).not.toContain(
      '/projects/slug-link-link/sections/open-section-g1/',
    );
  });

  it('lists a tag only while a listable entity carries it', () => {
    const open = project('pub', ProjectEventAccessLevel.Public);
    const hidden = project('priv', ProjectEventAccessLevel.Private);
    const listed = paths(
      input({
        projects: [open, hidden],
        tags: [
          { tagUuid: 'seen', slug: 'seen', publicId: 't1' },
          { tagUuid: 'unseen', slug: 'unseen', publicId: 't2' },
        ],
        tagUsages: [
          {
            tagUuid: 'seen',
            containerType: 'project',
            containerId: open.projectUuid,
          },
          {
            tagUuid: 'unseen',
            containerType: 'project',
            containerId: hidden.projectUuid,
          },
        ],
      }),
    );
    expect(listed).toContain('/tags/seen-t1/');
    expect(listed).not.toContain('/tags/unseen-t2/');
  });

  it('publishes the Life feed as one address, not a year per entity', () => {
    const hidden = event('priv', ProjectEventAccessLevel.Private);
    const open = event('pub', ProjectEventAccessLevel.Public);
    const listed = paths(
      input({
        events: [open, hidden],
      }),
    );
    // A day now travels in the query string, and a year is no longer an
    // address of its own — so no year can leak through the sitemap either.
    // The only filtered address here is the diary, which is a preset: a
    // reading of the feed the site treats as a page in its own right.
    expect(listed).toContain('/life/');
    expect(listed.filter((path) => path.startsWith('/life/'))).toEqual([
      '/life/',
      '/life/?f=diary-entry',
    ]);
  });

  it('always lists the public entry points', () => {
    expect(paths(input())).toEqual([
      '/',
      '/life/',
      '/rewind/',
      '/pages/',
      '/tags/',
      // The named search configurations, by their canonical address.
      '/search/',
      '/search/?type=project',
      '/search/?type=event',
      '/search/?type=project&showcase=1',
      '/search/?type=project&cv=1',
      // The diary: a filter on the chronology with a name of its own.
      '/life/?f=diary-entry',
    ]);
  });

  it('lists both tabs of a public project and no filter of its chronology', () => {
    const listed = paths(
      input({ projects: [project('Open', ProjectEventAccessLevel.Public)] }),
    );
    expect(listed).toEqual(
      expect.arrayContaining([
        '/projects/slug-Open-Open/',
        '/projects/slug-Open-Open/timeline/',
      ]),
    );
    // The sections are a block of the overview; a filter of the chronology
    // is only a way of reading it.
    expect(listed).not.toContain(
      '/projects/slug-Open-Open/timeline/?f=project-section',
    );
    expect(listed).not.toContain('/projects/slug-Open-Open/timeline/?f=event');
  });

  it('lists public diary entries and withholds the private ones', () => {
    const listed = paths(
      input({
        diaryEntries: [
          {
            diaryUuid: 'd-open',
            date: '2026-04-28',
            access: ProjectEventAccessLevel.Public,
            updatedAt: EPOCH,
          },
          {
            diaryUuid: 'd-closed',
            date: '2026-04-29',
            access: ProjectEventAccessLevel.Private,
            updatedAt: EPOCH,
          },
        ],
      }),
    );
    expect(listed).toContain('/diary/2026-04-28/');
    expect(listed).not.toContain('/diary/2026-04-29/');
  });

  it('lists an excerpt under a listable parent about something listable, never a private one', () => {
    const excerpt = (
      parentType: 'project' | 'event' | 'diary-entry',
      parentId: string,
      publicId: string,
      isPrivate = false,
      subjectAccess?: ProjectEventAccessLevel,
    ) => ({
      parentType,
      parentId,
      humanReadableSlug: `slug-${publicId}`,
      publicId,
      isPrivate,
      ...(subjectAccess ? { subjectAccess } : {}),
      updatedAt: EPOCH,
    });
    const listed = paths(
      input({
        projects: [
          project('Open', ProjectEventAccessLevel.Public),
          project('Link', ProjectEventAccessLevel.LinkOnly),
        ],
        events: [event('Ev', ProjectEventAccessLevel.Public)],
        diaryEntries: [
          {
            diaryUuid: 'd1',
            date: '2026-04-28',
            access: ProjectEventAccessLevel.Public,
            updatedAt: EPOCH,
          },
          {
            diaryUuid: 'd2',
            date: '2026-04-29',
            access: ProjectEventAccessLevel.Private,
            updatedAt: EPOCH,
          },
        ],
        excerpts: [
          excerpt('project', 'project-Open', 'X1'),
          excerpt('project', 'project-Open', 'X2', true),
          excerpt('project', 'project-Link', 'X3'),
          excerpt('event', 'event-Ev', 'X4'),
          excerpt('diary-entry', 'd1', 'X5'),
          excerpt('diary-entry', 'd2', 'X6'),
          // Closed by what it is about, though its parent is public.
          excerpt(
            'diary-entry',
            'd1',
            'X7',
            false,
            ProjectEventAccessLevel.Private,
          ),
          excerpt(
            'diary-entry',
            'd1',
            'X8',
            false,
            ProjectEventAccessLevel.LinkOnly,
          ),
          excerpt(
            'diary-entry',
            'd1',
            'X9',
            false,
            ProjectEventAccessLevel.Public,
          ),
        ],
      }),
    );
    expect(listed).toContain('/projects/slug-Open-Open/excerpts/slug-X1-X1/');
    expect(listed).not.toContain(
      '/projects/slug-Open-Open/excerpts/slug-X2-X2/',
    );
    expect(listed).not.toContain(
      '/projects/slug-Link-Link/excerpts/slug-X3-X3/',
    );
    expect(listed).toContain('/events/slug-Ev-Ev/excerpts/slug-X4-X4/');
    expect(listed).toContain('/diary/2026-04-28/excerpts/slug-X5-X5/');
    expect(listed).not.toContain('/diary/2026-04-29/excerpts/slug-X6-X6/');
    expect(listed).not.toContain('/diary/2026-04-28/excerpts/slug-X7-X7/');
    expect(listed).not.toContain('/diary/2026-04-28/excerpts/slug-X8-X8/');
    expect(listed).toContain('/diary/2026-04-28/excerpts/slug-X9-X9/');
  });
});

describe('sitemap serialization', () => {
  it('escapes every XML metacharacter in a location', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('emits lastmod only when the record has one', () => {
    expect(
      sitemapEntryXml(
        { path: '/pages/x/', lastmod: '2027-04-06' },
        'https://e.com',
      ),
    ).toBe(
      '<url><loc>https://e.com/pages/x/</loc><lastmod>2027-04-06</lastmod></url>',
    );
    expect(sitemapEntryXml({ path: '/' }, 'https://e.com')).toBe(
      '<url><loc>https://e.com/</loc></url>',
    );
  });
});
