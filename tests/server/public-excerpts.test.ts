import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { parseInternalUrl } from '../../shared/internal-url';
import { OWNER, STRANGER } from '../../server/thei/access-links/viewer';
import {
  excerptListed,
  excerptOpens,
} from '../../server/thei/excerpts/parents';
import {
  buildParentExcerpts,
  buildPublicExcerptsPage,
  countPublicExcerptsAbout,
  resolvePublicExcerptsAbout,
} from '../../server/thei/public/excerpts';
import {
  findContentEntity,
  findContentEntityByTarget,
} from '../../server/thei/content-entities';
import { shiftHeadings } from '../../server/thei/markdown/render';
import {
  diaryDocument,
  excerptDocument,
  projectDocument,
} from '../../server/thei/search/documents';
import { contentAttachmentAccess } from '../../server/thei/assets/context-access';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * What a visitor may read of excerpts, by the one rule every surface keeps:
 * an excerpt is as open as its parent unless it is private, its private
 * side is the parent's, and a diary entry's excerpts wait for its day.
 */
const { Public, LinkOnly, Private } = ProjectEventAccessLevel;
let context: Awaited<ReturnType<typeof freshTestDb>>;

const TODAY = Date.parse('2026-05-10T12:00:00Z');

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, serverRepositories);
  vi.spyOn(Date, 'now').mockReturnValue(TODAY);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

const row = { summary: '', createdAt: 1, updatedAt: 1 };

function project(uuid: string, access = Public) {
  context.insert('projects', {
    ...row,
    projectUuid: uuid,
    publicId: uuid,
    humanReadableSlug: uuid,
    title: `${uuid} title`,
    access,
  });
}

function event(uuid: string, access = Public) {
  // Made on a day of its own, which dates its excerpts: it has no periods.
  context.insert('events', {
    ...row,
    createdAt: Date.parse('2026-05-05T00:00:00Z'),
    eventUuid: uuid,
    publicId: uuid,
    humanReadableSlug: uuid,
    title: `${uuid} title`,
    access,
  });
}

function diary(uuid: string, date: string, access = Public) {
  context.insert('diary-entries', {
    diaryUuid: uuid,
    date,
    access,
    reminder: '',
    createdAt: 1,
    updatedAt: 1,
  });
}

type ParentType = 'project' | 'event' | 'diary-entry';

let order = 0;

/** An excerpt of a parent, about some targets, with a one-line text. */
function excerpt(
  uuid: string,
  parent: [ParentType, string],
  about: [ParentType, string][],
  options: { isPrivate?: boolean; createdAt?: number; note?: string } = {},
) {
  context.insert('excerpts', {
    excerptUuid: uuid,
    parentType: parent[0],
    parentId: parent[1],
    title: `${uuid} title`,
    summary: `${uuid} summary`,
    humanReadableSlug: uuid,
    publicId: uuid,
    isPrivate: options.isPrivate ? 1 : 0,
    sortOrder: order++,
    createdAt: options.createdAt ?? 1,
    updatedAt: options.createdAt ?? 1,
  });
  context.insert('content', {
    contentUuid: `content-${uuid}`,
    ownerType: 'excerpt',
    ownerId: uuid,
    slot: 'excerpt-body',
    data: JSON.stringify({
      blocks: [
        { id: `b-${uuid}`, type: 'paragraph', data: { text: `${uuid} words` } },
      ],
    }),
    createdAt: 1,
    updatedAt: 1,
  });
  for (const [type, id] of about) {
    // Rows are stored in canonical order; an excerpt sorts after a diary
    // entry and an event, before a project.
    const first = type === 'project' ? ['excerpt', uuid] : [type, id];
    const second = type === 'project' ? [type, id] : ['excerpt', uuid];
    context.insert('entity-relations', {
      firstType: first[0],
      firstId: first[1],
      secondType: second[0],
      secondId: second[1],
      type: 'related',
      note: options.note
        ? JSON.stringify({ type: 'shared', text: options.note })
        : null,
      firstSortOrder: 0,
      secondSortOrder: 0,
    });
  }
}

describe('who may see an excerpt', () => {
  it('opens and lists it as its parent, unless it is private', () => {
    const open = { isPrivate: false };
    const closed = { isPrivate: true };
    expect(excerptOpens(open, { access: Public }, false)).toBe(true);
    expect(excerptOpens(open, { access: LinkOnly }, false)).toBe(true);
    expect(excerptOpens(open, { access: Private }, false)).toBe(false);
    expect(excerptOpens(closed, { access: Public }, false)).toBe(false);
    expect(excerptOpens(closed, { access: Private }, true)).toBe(true);
    expect(excerptListed(open, { access: Public }, false)).toBe(true);
    expect(excerptListed(open, { access: LinkOnly }, false)).toBe(false);
    expect(excerptListed(closed, { access: Public }, false)).toBe(false);
    expect(excerptListed(closed, { access: LinkOnly }, true)).toBe(true);
  });
});

describe('the excerpts about an entity', () => {
  function seed() {
    project('p');
    diary('d-open', '2026-05-01');
    diary('d-secret', '2026-05-02', Private);
    diary('d-link', '2026-05-03', LinkOnly);
    diary('d-soon', '2026-05-20');
    event('e');
    excerpt('x-old', ['diary-entry', 'd-open'], [['project', 'p']], {
      createdAt: 10,
      note: 'why',
    });
    excerpt('x-new', ['diary-entry', 'd-open'], [['project', 'p']], {
      createdAt: 20,
    });
    excerpt('x-private', ['diary-entry', 'd-open'], [['project', 'p']], {
      isPrivate: true,
    });
    excerpt('x-secret', ['diary-entry', 'd-secret'], [['project', 'p']]);
    excerpt('x-link', ['diary-entry', 'd-link'], [['project', 'p']]);
    excerpt('x-soon', ['diary-entry', 'd-soon'], [['project', 'p']]);
    excerpt('x-event', ['event', 'e'], [['project', 'p']]);
    excerpt('x-other', ['event', 'e'], [['diary-entry', 'd-open']]);
  }

  it('lists for a stranger only what they may list, newest first', async () => {
    seed();
    const items = await resolvePublicExcerptsAbout(
      { type: 'project', id: 'p' },
      STRANGER,
    );
    // The event's excerpt first, dated by the event's making; the entry's
    // two by its day, the newer written first. The private one, those of a
    // private or link-only entry and of a day still to come wait.
    expect(items.map((item) => item.excerpt.excerptUuid)).toEqual([
      'x-event',
      'x-new',
      'x-old',
    ]);
    expect(items[2]!.side).toEqual({ relationType: 'related', note: 'why' });
    expect(
      await countPublicExcerptsAbout({ type: 'project', id: 'p' }, STRANGER),
    ).toEqual({ total: 3 });
  });

  it('shows the owner everything, and a share link the entry it opens', async () => {
    seed();
    const all = await resolvePublicExcerptsAbout(
      { type: 'project', id: 'p' },
      OWNER,
    );
    expect(all.map((item) => item.excerpt.excerptUuid)).toEqual([
      'x-soon',
      'x-event',
      'x-link',
      'x-secret',
      'x-new',
      'x-old',
      'x-private',
    ]);
    const guest = {
      isAdmin: false,
      grants: new Set(['diary-entry:d-secret']),
    };
    expect(
      (
        await resolvePublicExcerptsAbout({ type: 'project', id: 'p' }, guest)
      ).map((item) => item.excerpt.excerptUuid),
    ).toEqual(['x-event', 'x-secret', 'x-new', 'x-old']);
  });

  it('builds the cards a page at a time, each naming its parent and what it is about', async () => {
    seed();
    const page = await buildPublicExcerptsPage(
      { type: 'project', id: 'p' },
      1,
      STRANGER,
    );
    expect(page.total).toBe(3);
    const card = page.items[1]!;
    expect(card).toMatchObject({
      title: 'x-new title',
      href: '/diary/2026-05-01/excerpts/x-new-x-new/',
      date: '2026-05-01',
      parent: {
        type: 'diary-entry',
        date: '2026-05-01',
        href: '/diary/2026-05-01/',
      },
      relationType: 'related',
    });
    expect(card.about.map((link) => ('href' in link ? link.href : ''))).toEqual(
      ['/projects/p-p/'],
    );
    expect(card.media.src).toContain('/media/generated-icons/excerpt/');
  });

  it("embeds a parent's own excerpts whole, the private one for the owner alone", async () => {
    seed();
    const parent = {
      ...(await context.server.diary.findByUuid('d-open'))!,
    };
    const { diaryExcerptParent } =
      await import('../../server/thei/excerpts/parents');
    const own = diaryExcerptParent(parent);
    const seen = await buildParentExcerpts(own, STRANGER);
    expect(seen.map((item) => [item.title, item.position])).toEqual([
      ['x-old title', { number: 1, count: 2 }],
      ['x-new title', { number: 2, count: 2 }],
    ]);
    expect(seen[0]!.content.blocks).toHaveLength(1);
    const owners = await buildParentExcerpts(own, OWNER);
    expect(owners.map((item) => item.title)).toEqual([
      'x-old title',
      'x-new title',
      'x-private title',
    ]);
  });
});

describe('an excerpt as the rest of the site finds it', () => {
  it('is a content entity with its parent, by uuid and by address', async () => {
    diary('d', '2026-04-04');
    excerpt('x', ['diary-entry', 'd'], [], { isPrivate: true });
    const found = await findContentEntity(
      { entityType: 'excerpt', entityId: 'x' },
      STRANGER,
    );
    expect(found).toMatchObject({
      entityType: 'excerpt',
      title: 'x title',
      href: '/diary/2026-04-04/excerpts/x-x/',
      access: Private,
      parent: { title: '2026-04-04', href: '/diary/2026-04-04/' },
      grantOwner: { entityType: 'diary-entry', entityId: 'd' },
    });
    const target = parseInternalUrl(
      'https://example.com/diary/2026-04-04/excerpts/x-x/',
      { origins: ['https://example.com'], base: '/' },
    );
    expect(target).toEqual({
      entityType: 'excerpt',
      parent: { type: 'diary-entry', date: '2026-04-04' },
      publicId: 'x',
    });
    expect((await findContentEntityByTarget(target!, STRANGER))?.entityId).toBe(
      'x',
    );
  });

  it('is searched as a result of its own and as a heading of its parent', async () => {
    project('p');
    diary('d', '2026-05-01');
    excerpt('x', ['diary-entry', 'd'], [['project', 'p']]);
    excerpt('x-private', ['diary-entry', 'd'], [['project', 'p']], {
      isPrivate: true,
    });
    const found = (await excerptDocument('x', 'public'))!;
    expect(found).toMatchObject({
      kind: 'excerpt',
      ref: 'excerpt:x',
      publicRef: 'excerpt:x',
      href: '/diary/2026-05-01/excerpts/x-x/',
      date: '2026-05-01',
      parent: { title: '2026-05-01', href: '/diary/2026-05-01/' },
    });
    expect(found.units.map((unit) => unit.where)).toContain('text');
    expect(await excerptDocument('x-private', 'public')).toBeUndefined();
    expect((await excerptDocument('x-private', 'owner'))?.editHref).toBe(
      '/admin/diary/d/edit/?excerpt=x-private',
    );
    const entry = (await diaryDocument('d', 'public'))!;
    const headings = entry.units.filter((unit) => unit.where === 'excerpt');
    expect(headings.map((unit) => unit.text)).toEqual(['x title']);
    expect(headings[0]!.place?.excerpt?.href).toBe(
      '/diary/2026-05-01/excerpts/x-x/',
    );
    // What is about a project is not a part of it: the project's document
    // keeps to its own words.
    const owner = (await projectDocument('p', 'public'))!;
    expect(owner.units.some((unit) => unit.where === 'excerpt')).toBe(false);
  });

  it('serves the pictures of an excerpt from its parent, a private one to the private side', async () => {
    diary('d', '2026-05-01');
    excerpt('x', ['diary-entry', 'd'], []);
    excerpt('x-private', ['diary-entry', 'd'], [], { isPrivate: true });
    context.insert('assets', {
      assetUuid: 'a',
      slug: 'a',
      extension: 'webp',
      familyUuid: 'a',
      contentHash: 'a-hash',
      settingsKey: 'image',
      settings: null,
      type: 'image',
      size: 1,
      touchedAt: 1,
      meta: null,
    });
    const use = (contentUuid: string) =>
      context.insert('asset-usages', {
        assetUuid: 'a',
        containerType: 'content',
        containerId: contentUuid,
        role: 'content',
        meta: JSON.stringify({
          role: 'content',
          refs: [{ blockId: 'b', isPrivate: false }],
        }),
      });
    use('content-x-private');
    expect(await contentAttachmentAccess('diary-entry', 'd', 'a')).toEqual({
      exists: true,
      shared: true,
      public: false,
    });
    use('content-x');
    expect(await contentAttachmentAccess('diary-entry', 'd', 'a')).toEqual({
      exists: true,
      shared: true,
      public: true,
    });
  });
});

describe('shiftHeadings', () => {
  it('moves every heading one level down and leaves code alone', () => {
    expect(
      shiftHeadings(
        '# One\n\ntext\n\n## Two\n\n```\n# not a heading\n```\n\n##### Five',
      ),
    ).toBe(
      '## One\n\ntext\n\n### Two\n\n```\n# not a heading\n```\n\n###### Five',
    );
  });
});
