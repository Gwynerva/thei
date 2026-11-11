import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { parseInternalUrl } from '../../shared/internal-url';
import { OWNER, STRANGER } from '../../server/thei/access-links/viewer';
import {
  diaryExcerptParent,
  excerptAccess,
  excerptDay,
  excerptListed,
  excerptOpens,
} from '../../server/thei/excerpts/parents';
import {
  buildParentExcerpts,
  buildPublicExcerptsPage,
  PUBLIC_EXCERPTS_PAGE_SIZE,
  PUBLIC_PROJECT_EXCERPTS_SIZE,
  countPublicExcerptsAbout,
  findOpenParentExcerpt,
  resolvePublicExcerptsAbout,
  secretParentExcerpts,
} from '../../server/thei/public/excerpts';
import {
  contentEntityOpens,
  findContentEntity,
  findContentEntityByTarget,
  listContentEntities,
} from '../../server/thei/content-entities';
import { shiftHeadings } from '../../server/thei/markdown/render';
import {
  diaryDocument,
  excerptDocument,
  placeHref,
  projectDocument,
} from '../../server/thei/search/documents';
import { contentAttachmentAccess } from '../../server/thei/assets/context-access';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * What a visitor may read of excerpts, by the one rule every surface keeps:
 * an excerpt is as open as the stricter of its parent and what it is about,
 * unless it is private; it is seen only by whoever may open both; its own
 * private side is the parent's; and a diary entry's excerpts wait for its
 * day.
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
  const parent = (access: ProjectEventAccessLevel) =>
    ({ type: 'diary-entry', id: 'd', access }) as const;
  const subject = (access: ProjectEventAccessLevel) =>
    ({ type: 'project', id: 'p', access }) as const;
  const of = (
    isPrivate: boolean,
    about: ProjectEventAccessLevel | null = Public,
  ) => ({ isPrivate, subject: about ? subject(about) : null });
  const parentGuest = { isAdmin: false, grants: new Set(['diary-entry:d']) };
  const subjectGuest = { isAdmin: false, grants: new Set(['project:p']) };

  it('opens and lists it as its parent, unless it is private', () => {
    expect(excerptOpens(STRANGER, of(false), parent(Public))).toBe(true);
    expect(excerptOpens(STRANGER, of(false), parent(LinkOnly))).toBe(true);
    expect(excerptOpens(STRANGER, of(false), parent(Private))).toBe(false);
    expect(excerptOpens(STRANGER, of(true), parent(Public))).toBe(false);
    expect(excerptOpens(parentGuest, of(true), parent(Private))).toBe(true);
    expect(excerptListed(STRANGER, of(false), parent(Public))).toBe(true);
    expect(excerptListed(STRANGER, of(false), parent(LinkOnly))).toBe(false);
    expect(excerptListed(STRANGER, of(true), parent(Public))).toBe(false);
    expect(excerptListed(parentGuest, of(true), parent(LinkOnly))).toBe(true);
  });

  it('closes it with what it is about, whatever its own switch says', () => {
    // A private subject: hidden from a stranger and from the parent's guest,
    // open to the subject's guest and the owner.
    for (const viewer of [STRANGER, parentGuest])
      expect(excerptOpens(viewer, of(false, Private), parent(Public))).toBe(
        false,
      );
    expect(excerptOpens(subjectGuest, of(false, Private), parent(Public))).toBe(
      true,
    );
    expect(excerptListed(OWNER, of(false, Private), parent(Public))).toBe(true);
    // One open by its link: opens by its address, is listed nowhere.
    expect(excerptOpens(STRANGER, of(false, LinkOnly), parent(Public))).toBe(
      true,
    );
    expect(excerptListed(STRANGER, of(false, LinkOnly), parent(Public))).toBe(
      false,
    );
    // On its subject's own page the subject is the one the visitor opened.
    expect(
      excerptListed(STRANGER, of(false, LinkOnly), parent(Public), {
        onSubjectPage: true,
      }),
    ).toBe(true);
    // About nothing: its parent alone decides.
    expect(excerptListed(STRANGER, of(false, null), parent(Public))).toBe(true);
    // One value, where one is asked for: the strictest of the three.
    expect(excerptAccess(of(false, LinkOnly), parent(Public))).toBe(LinkOnly);
    expect(excerptAccess(of(false, Private), parent(LinkOnly))).toBe(Private);
    expect(excerptAccess(of(true, Public), parent(Public))).toBe(Private);
    expect(excerptAccess(of(false, null), parent(LinkOnly))).toBe(LinkOnly);
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

  it('gives a page of the size it is asked for, the newest first, and counts them all', async () => {
    seed();
    const page = await buildPublicExcerptsPage(
      { type: 'project', id: 'p' },
      1,
      STRANGER,
      2,
    );
    expect(page.total).toBe(3);
    expect(page.pageCount).toBe(2);
    expect(page.items.map((card) => card.title)).toEqual([
      'x-event title',
      'x-new title',
    ]);
    expect(PUBLIC_PROJECT_EXCERPTS_SIZE).toBeLessThan(
      PUBLIC_EXCERPTS_PAGE_SIZE,
    );
  });

  it('dates an excerpt of a project by the day it was written, as the chronology does', async () => {
    project('p');
    project('host');
    diary('d', '2026-05-01');
    event('e');
    const day = (date: string) => Date.parse(`${date}T10:00:00Z`);
    excerpt('x-diary', ['diary-entry', 'd'], [['project', 'p']]);
    excerpt('x-host', ['project', 'host'], [['project', 'p']], {
      createdAt: day('2026-05-03'),
    });
    excerpt('x-event', ['event', 'e'], [['project', 'p']]);
    const items = await resolvePublicExcerptsAbout(
      { type: 'project', id: 'p' },
      STRANGER,
    );
    // The event's on 5 May, the project's on 3 May, the entry's on 1 May:
    // a project has no day of its own, and its excerpt is not left last.
    expect(items.map((item) => item.excerpt.excerptUuid)).toEqual([
      'x-event',
      'x-host',
      'x-diary',
    ]);
    expect(excerptDay(items[1]!.excerpt, items[1]!.parent)).toBe('2026-05-03');
    expect(excerptDay(items[2]!.excerpt, items[2]!.parent)).toBe('2026-05-01');
  });

  it("gives a project's page its latest five, excerpts of projects among them, and counts them all", async () => {
    project('p');
    project('host');
    diary('d', '2026-04-01');
    excerpt('x-diary', ['diary-entry', 'd'], [['project', 'p']]);
    for (const number of [1, 2, 3, 4, 5, 6])
      excerpt(`h${number}`, ['project', 'host'], [['project', 'p']], {
        createdAt: Date.parse(`2026-05-0${number}T10:00:00Z`),
      });
    const page = await buildPublicExcerptsPage(
      { type: 'project', id: 'p' },
      1,
      STRANGER,
      PUBLIC_PROJECT_EXCERPTS_SIZE,
    );
    expect(page.total).toBe(7);
    expect(page.items.map((card) => card.title)).toEqual([
      'h6 title',
      'h5 title',
      'h4 title',
      'h3 title',
      'h2 title',
    ]);
    expect(page.items[0]!.parent).toMatchObject({
      type: 'project',
      title: 'host title',
      summary: '',
    });
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
    expect(seen.map((item) => item.title)).toEqual([
      'x-old title',
      'x-new title',
    ]);
    expect(seen[0]!.content.blocks).toHaveLength(1);
    const owners = await buildParentExcerpts(own, OWNER);
    expect(owners.map((item) => item.title)).toEqual([
      'x-old title',
      'x-new title',
      'x-private title',
    ]);
    // The private one stays in its place for a stranger as its codename,
    // after the two they may read; the owner has nothing hidden.
    const secrets = await secretParentExcerpts(own, STRANGER);
    expect(secrets).toEqual([
      {
        key: expect.any(String),
        title: expect.stringMatching(/^Secret excerpt /),
        summary: expect.stringMatching(/\S/),
        iconMedia: expect.any(Object),
        about: expect.any(Array),
        before: 2,
      },
    ]);
    // What it is about is named as far as a stranger may know, and never
    // with the note the owner wrote on the relation.
    for (const link of secrets[0]!.about)
      expect(link).not.toHaveProperty('note');
    expect(await secretParentExcerpts(own, OWNER)).toEqual([]);
  });
});

describe('what a closed excerpt is about, on its parent’s page', () => {
  it('names an open subject without the note, a closed one by its codename, a closed day not at all', async () => {
    diary('d', '2026-05-01');
    diary('d-closed', '2026-05-02', Private);
    project('p-open');
    project('p-closed', Private);
    excerpt('x-private', ['diary-entry', 'd'], [['project', 'p-open']], {
      isPrivate: true,
      note: 'the owner’s own words',
    });
    excerpt('x-closed', ['diary-entry', 'd'], [['project', 'p-closed']]);
    excerpt('x-day', ['diary-entry', 'd'], [['diary-entry', 'd-closed']]);
    const { diaryExcerptParent } =
      await import('../../server/thei/excerpts/parents');
    const parent = diaryExcerptParent(
      (await context.server.diary.findByUuid('d'))!,
    );
    const secrets = await secretParentExcerpts(parent, STRANGER);
    expect(secrets.map((secret) => secret.title)).toEqual([
      expect.stringMatching(/^Secret excerpt /),
      expect.stringMatching(/^Secret excerpt /),
      expect.stringMatching(/^Secret excerpt /),
    ]);
    const [open, closed, day] = secrets.map((secret) => secret.about);
    expect(open).toEqual([
      expect.objectContaining({ href: '/projects/p-open-p-open/' }),
    ]);
    expect(open![0]).not.toHaveProperty('note');
    expect(closed).toEqual([
      expect.objectContaining({
        secret: true,
        entityType: 'project',
        title: expect.stringMatching(/^Secret project /),
      }),
    ]);
    expect(closed![0]).not.toHaveProperty('href');
    expect(day).toEqual([]);
  });
});

describe('the relation an excerpt stands on', () => {
  it('is listed by neither end, unless the owner related them directly', async () => {
    project('p');
    diary('d', '2026-05-01');
    excerpt('x', ['diary-entry', 'd'], [['project', 'p']]);
    const { resolvePublicRelated } =
      await import('../../server/thei/public/related');
    const ends = async () => [
      (await resolvePublicRelated({ type: 'project', id: 'p' }, STRANGER)).map(
        (item) => item.endpoint.id,
      ),
      (
        await resolvePublicRelated({ type: 'diary-entry', id: 'd' }, STRANGER)
      ).map((item) => item.endpoint.id),
    ];
    expect(await ends()).toEqual([[], []]);
    context.insert('entity-relations', {
      firstType: 'diary-entry',
      firstId: 'd',
      secondType: 'project',
      secondId: 'p',
      type: 'related',
      note: null,
      firstSortOrder: 0,
      secondSortOrder: 0,
    });
    expect(await ends()).toEqual([['d'], ['p']]);
  });
});

describe("the direction of an excerpt's relation", () => {
  it("reads from each page: the subject on the parent's, the excerpt on the subject's", async () => {
    diary('d-source', '2026-05-01');
    diary('d-parent', '2026-05-02');
    excerpt('x', ['diary-entry', 'd-parent'], []);
    // The earlier day affects the excerpt, with a word for each side.
    context.insert('entity-relations', {
      firstType: 'diary-entry',
      firstId: 'd-source',
      secondType: 'excerpt',
      secondId: 'x',
      type: 'first-influences-second',
      note: JSON.stringify({
        type: 'split',
        firstText: 'said on the source',
        secondText: 'said on the excerpt',
      }),
      firstSortOrder: 0,
      secondSortOrder: 0,
    });
    const parent = diaryExcerptParent(
      (await context.server.diary.findByUuid('d-parent'))!,
    );
    // On the parent's page, by the subject: the source affects it.
    const [embedded] = await buildParentExcerpts(parent, STRANGER);
    expect(embedded!.about[0]).toMatchObject({
      relationType: 'influencing',
      note: 'said on the excerpt',
    });
    // On the subject's page, by the parent: the excerpt depends on it.
    const page = await buildPublicExcerptsPage(
      { type: 'diary-entry', id: 'd-source' },
      1,
      STRANGER,
    );
    expect(page.items[0]).toMatchObject({
      relationType: 'dependent',
      note: 'said on the source',
    });
  });
});

describe('an excerpt about something closed', () => {
  function seed() {
    project('p');
    project('p-secret', Private);
    project('p-link', LinkOnly);
    diary('d', '2026-05-01');
    excerpt('x-open', ['diary-entry', 'd'], [['project', 'p']]);
    excerpt('x-secret', ['diary-entry', 'd'], [['project', 'p-secret']]);
    excerpt('x-link', ['diary-entry', 'd'], [['project', 'p-link']]);
    excerpt('x-own', ['diary-entry', 'd'], [['project', 'p']], {
      isPrivate: true,
    });
  }
  async function entry() {
    return diaryExcerptParent((await context.server.diary.findByUuid('d'))!);
  }
  const titles = (items: { title: string }[]) =>
    items.map((item) => item.title);

  it("is not on its public parent's page while what it is about is closed", async () => {
    seed();
    const parent = await entry();
    expect(titles(await buildParentExcerpts(parent, STRANGER))).toEqual([
      'x-open title',
    ]);
    expect(titles(await buildParentExcerpts(parent, OWNER))).toEqual([
      'x-open title',
      'x-secret title',
      'x-link title',
      'x-own title',
    ]);
    // A share link of the subject opens what is about it; one of the
    // parent opens the parent's own private side.
    const subjectGuest = {
      isAdmin: false,
      grants: new Set(['project:p-secret']),
    };
    expect(titles(await buildParentExcerpts(parent, subjectGuest))).toEqual([
      'x-open title',
      'x-secret title',
    ]);
    const parentGuest = { isAdmin: false, grants: new Set(['diary-entry:d']) };
    expect(titles(await buildParentExcerpts(parent, parentGuest))).toEqual([
      'x-open title',
      'x-own title',
    ]);
  });

  it('opens by its own address while what it is about is open by its link', async () => {
    seed();
    const parent = await entry();
    const found = findOpenParentExcerpt(parent, STRANGER, 'x-link')!;
    expect(found.excerpt.excerptUuid).toBe('x-link');
    expect(found.visible.map((item) => item.excerptUuid)).toEqual([
      'x-open',
      'x-link',
    ]);
    expect(findOpenParentExcerpt(parent, STRANGER, 'x-secret')).toBeUndefined();
    expect(findOpenParentExcerpt(parent, STRANGER, 'x-own')).toBeUndefined();
    // On the page of what it is about, it is among the excerpts about it.
    expect(
      (
        await resolvePublicExcerptsAbout(
          { type: 'project', id: 'p-link' },
          STRANGER,
        )
      ).map((item) => item.excerpt.excerptUuid),
    ).toEqual(['x-link']);
  });

  it('is not searched, nor named in its parent, while what it is about is closed', async () => {
    seed();
    expect(await excerptDocument('x-secret', 'public')).toBeUndefined();
    expect(await excerptDocument('x-link', 'public')).toBeUndefined();
    expect((await excerptDocument('x-secret', 'owner'))?.access).toBe(
      'private',
    );
    const headings = (await diaryDocument('d', 'public'))!.units.filter(
      (unit) => unit.where === 'excerpt',
    );
    expect(headings.map((unit) => unit.text)).toEqual(['x-open title']);
    const record = await findContentEntity(
      { entityType: 'diary-entry', entityId: 'd' },
      STRANGER,
    );
    expect(record?.summary).toContain('x-open title');
    expect(record?.summary).not.toContain('x-secret title');
    const secret = (await findContentEntity(
      { entityType: 'excerpt', entityId: 'x-secret' },
      STRANGER,
    ))!;
    // Opened by the subject's link; its private side stays the parent's.
    expect(secret).toMatchObject({
      access: Private,
      grantOwner: { entityType: 'diary-entry', entityId: 'd' },
    });
    expect(
      contentEntityOpens(secret, {
        isAdmin: false,
        grants: new Set(['project:p-secret']),
      }),
    ).toBe(true);
    expect(contentEntityOpens(secret, STRANGER)).toBe(false);
  });

  it('opens again once what it is about is public, unless it is private by hand', async () => {
    seed();
    context.server
      .useDb()
      .rawDb.prepare(
        "UPDATE projects SET access = 'public' WHERE projectUuid IN ('p-secret', 'p-link')",
      )
      .run();
    expect(titles(await buildParentExcerpts(await entry(), STRANGER))).toEqual([
      'x-open title',
      'x-secret title',
      'x-link title',
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
      parent: {
        type: 'diary-entry',
        title: '',
        date: '2026-04-04',
        href: '/diary/2026-04-04/',
      },
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
      parent: {
        type: 'diary-entry',
        title: '',
        date: '2026-05-01',
        href: '/diary/2026-05-01/',
      },
    });
    // What it is about goes on its card, as the reader may see it.
    expect(found.subject).toMatchObject({
      entityType: 'project',
      href: expect.stringContaining('/projects/'),
    });
    expect(found.units.map((unit) => unit.where)).toContain('text');
    // A find in its text leads to its block on its own page.
    const words = found.units.find((unit) => unit.where === 'text')!;
    expect(placeHref(found, words.place ?? {})).toBe(
      '/diary/2026-05-01/excerpts/x-x/#b-b-x',
    );
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

  it('carries what it is about to the owner’s picker, and its other names', async () => {
    project('p', Private);
    context.server
      .useDb()
      .rawDb.prepare("UPDATE projects SET synonyms = ? WHERE projectUuid = 'p'")
      .run(JSON.stringify(['the blog']));
    diary('d', '2026-05-01');
    diary('d-about', '2026-04-04');
    excerpt('x-project', ['diary-entry', 'd'], [['project', 'p']]);
    excerpt('x-day', ['diary-entry', 'd'], [['diary-entry', 'd-about']]);
    excerpt('x-none', ['diary-entry', 'd'], []);
    excerpt('x-gone', ['diary-entry', 'd'], [['project', 'p-gone']]);
    const records = new Map(
      (await listContentEntities(new Set(['excerpt']))).map((record) => [
        record.entityId,
        record,
      ]),
    );
    expect(records.get('x-project')).toMatchObject({
      subject: { type: 'project', title: 'p title', href: '/projects/p-p/' },
      subjectSynonyms: ['the blog'],
    });
    expect(records.get('x-day')!.subject).toEqual({
      type: 'diary-entry',
      title: '',
      date: '2026-04-04',
      href: '/diary/2026-04-04/',
    });
    expect(records.get('x-day')).not.toHaveProperty('subjectSynonyms');
    for (const id of ['x-none', 'x-gone'])
      expect(records.get(id), id).not.toHaveProperty('subject');
    // A record read for a viewer names no subject: only the owner's list does.
    expect(
      await findContentEntity(
        { entityType: 'excerpt', entityId: 'x-project' },
        STRANGER,
      ),
    ).not.toHaveProperty('subject');
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
    const entry = { type: 'diary-entry', id: 'd', access: Public } as const;
    const parentGuest = { isAdmin: false, grants: new Set(['diary-entry:d']) };
    expect(await contentAttachmentAccess(entry, 'a')).toEqual({
      exists: true,
      granted: false,
      public: false,
    });
    expect(await contentAttachmentAccess(entry, 'a', parentGuest)).toEqual({
      exists: true,
      granted: true,
      public: false,
    });
    use('content-x');
    expect(await contentAttachmentAccess(entry, 'a')).toEqual({
      exists: true,
      granted: true,
      public: true,
    });
  });

  it('serves the pictures of an excerpt to whoever may open it, by its subject’s link too', async () => {
    // A public entry with an excerpt about a private project, shared by its
    // link: the friend with that link reads the excerpt, pictures and all;
    // the holder of the entry's link alone does not.
    diary('d', '2026-05-01');
    project('s', Private);
    excerpt('x', ['diary-entry', 'd'], [['project', 's']]);
    excerpt('x-hand', ['diary-entry', 'd'], [['project', 's']], {
      isPrivate: true,
    });
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
    const use = (contentUuid: string, isPrivate = false) =>
      context.insert('asset-usages', {
        assetUuid: 'a',
        containerType: 'content',
        containerId: contentUuid,
        role: 'content',
        meta: JSON.stringify({
          role: 'content',
          refs: [{ blockId: 'b', isPrivate }],
        }),
      });
    const entry = { type: 'diary-entry', id: 'd', access: Public } as const;
    const guest = (...grants: string[]) => ({
      isAdmin: false,
      grants: new Set(grants),
    });
    const subjectGuest = guest('project:s');
    const parentGuest = guest('diary-entry:d');
    const both = guest('project:s', 'diary-entry:d');
    const granted = async (viewer: typeof STRANGER) =>
      (await contentAttachmentAccess(entry, 'a', viewer)).granted;

    use('content-x');
    expect(await granted(subjectGuest)).toBe(true);
    expect(await granted(parentGuest)).toBe(false);
    expect(await granted(STRANGER)).toBe(false);
    expect((await contentAttachmentAccess(entry, 'a', OWNER)).exists).toBe(
      true,
    );
    expect((await contentAttachmentAccess(entry, 'a', both)).public).toBe(
      false,
    );
    // The link that opens the excerpt opens it as its own page does: a
    // private part of its text is its parent's private side.
    context.db.delete(context.schema.assetUsages).run();
    use('content-x', true);
    expect(await granted(subjectGuest)).toBe(false);
    expect(await granted(both)).toBe(true);
    // Private by hand, the excerpt takes both links.
    context.db.delete(context.schema.assetUsages).run();
    use('content-x-hand');
    expect(await granted(subjectGuest)).toBe(false);
    expect(await granted(parentGuest)).toBe(false);
    expect(await granted(both)).toBe(true);

    // A link to it opens by the same rule, its private side the parent's.
    const record = (await findContentEntity(
      { entityType: 'excerpt', entityId: 'x' },
      STRANGER,
    ))!;
    expect(contentEntityOpens(record, subjectGuest)).toBe(true);
    expect(contentEntityOpens(record, parentGuest)).toBe(false);
    expect(contentEntityOpens(record, STRANGER)).toBe(false);
    expect(record.grantOwner).toEqual({
      entityType: 'diary-entry',
      entityId: 'd',
    });
    const byHand = (await findContentEntity(
      { entityType: 'excerpt', entityId: 'x-hand' },
      STRANGER,
    ))!;
    expect(contentEntityOpens(byHand, subjectGuest)).toBe(false);
    expect(contentEntityOpens(byHand, both)).toBe(true);
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
