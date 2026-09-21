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
    stages: [],
    events: [],
    pages: [],
    tags: [],
    tagUsages: [],
    periods: [],
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

  it('withholds a private stage or section inside a public project', () => {
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
        stages: [
          {
            projectUuid: parent.projectUuid,
            humanReadableSlug: 'secret-stage',
            publicId: 'g1',
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
    expect(listed).not.toContain(
      '/projects/slug-pub-pub/stages/secret-stage-g1/',
    );
  });

  it('withholds every child of a project that is not listable', () => {
    const parent = project('link', ProjectEventAccessLevel.LinkOnly);
    const listed = paths(
      input({
        projects: [parent],
        stages: [
          {
            projectUuid: parent.projectUuid,
            humanReadableSlug: 'open-stage',
            publicId: 'g1',
            isPrivate: false,
            updatedAt: EPOCH,
          },
        ],
      }),
    );
    expect(listed).not.toContain(
      '/projects/slug-link-link/stages/open-stage-g1/',
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

  it('derives Life years from listable entities only', () => {
    const hidden = event('priv', ProjectEventAccessLevel.Private);
    const open = event('pub', ProjectEventAccessLevel.Public);
    const listed = paths(
      input({
        events: [open, hidden],
        periods: [
          {
            stageType: 'event-stage',
            stageUuid: open.eventUuid,
            startDate: '2024-01-01',
            endDate: '2025-06-01',
          },
          {
            stageType: 'event-stage',
            stageUuid: hidden.eventUuid,
            startDate: '2019-01-01',
            endDate: '2019-02-01',
          },
        ],
      }),
    );
    expect(listed).toContain('/life/2024/');
    expect(listed).toContain('/life/2025/');
    // A year whose only records are private must not be published: the year
    // existing is itself the fact being withheld.
    expect(listed).not.toContain('/life/2019/');
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
    ]);
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
