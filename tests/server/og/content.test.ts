import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ProjectEventAccessLevel,
  SiteAccessLevel,
} from '../../../shared/access-level';
import { loadLanguage } from '../../../shared/language';
import { findAssetBySlug } from '../../../server/thei/assets/repository/find-by-slug';
import { findAssetByUuid } from '../../../server/thei/assets/repository/find-by-uuid';
import { findAssetsByContainer } from '../../../server/thei/assets/repository/usages/find-by-container';
import { findAssetUsage } from '../../../server/thei/assets/repository/usages/find-one';
import { findShowcaseAssets } from '../../../server/thei/assets/repository/usages/find-showcase';
import {
  buildContentFieldValue,
  findContentByOwner,
} from '../../../server/thei/content/repository';
import { findDiaryEntryByDate } from '../../../server/thei/diary/repository/find-by-date';
import { findDiaryEntryByUuid } from '../../../server/thei/diary/repository/find-by-uuid';
import { findEventByPublicId } from '../../../server/thei/events/repository/find-by-public-id';
import { findEventByUuid } from '../../../server/thei/events/repository/find-by-id';
import {
  invalidateOgCardInfo,
  resolveOgCardInfo,
} from '../../../server/thei/og/cache';
import { resolveOgContent } from '../../../server/thei/og/content';
import { findPageBySlug } from '../../../server/thei/pages/repository/find-by-slug';
import { findPageByUuid } from '../../../server/thei/pages/repository/find-by-id';
import { findProjectByPublicId } from '../../../server/thei/projects/repository/find-by-public-id';
import { findProjectByUuid } from '../../../server/thei/projects/repository/find-by-id';
import { invalidatePublicSearchIndex } from '../../../server/thei/public/search-index';
import { PROFILE_ID } from '../../../shared/profile';
import { freshTestDb } from '../../helpers/fresh-db';

/**
 * What a card says is what a stranger may read on its page: these build the
 * content of every kind of card from a real database and check what it
 * shows, what it counts and what it refuses.
 */
const { Public, LinkOnly, Private } = ProjectEventAccessLevel;
let context: Awaited<ReturnType<typeof freshTestDb>>;
const config = {
  siteAccessLevel: SiteAccessLevel.Public,
  siteUrl: 'https://petra.example/archive',
};

beforeEach(async () => {
  context = await freshTestDb();
  config.siteAccessLevel = SiteAccessLevel.Public;
  invalidatePublicSearchIndex();
  Object.assign(context.server, {
    useDb: () => context,
    config,
    projects: {
      findByPublicId: findProjectByPublicId,
      findByUuid: findProjectByUuid,
    },
    events: {
      findByPublicId: findEventByPublicId,
      findByUuid: findEventByUuid,
    },
    diary: {
      findByDate: findDiaryEntryByDate,
      findByUuid: findDiaryEntryByUuid,
    },
    pages: { findBySlug: findPageBySlug, findByUuid: findPageByUuid },
    assets: {
      findBySlug: findAssetBySlug,
      findByUuid: findAssetByUuid,
      usages: {
        findByContainer: findAssetsByContainer,
        findOne: findAssetUsage,
        findShowcase: findShowcaseAssets,
      },
    },
    content: {
      findByOwner: findContentByOwner,
      buildFieldValue: buildContentFieldValue,
    },
  });
  context.db
    .insert(context.schema.profiles)
    .values({ profileId: PROFILE_ID, displayName: 'Petra Radko' })
    .run();
});

afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

/**
 * The content with the owner's typography's no-break spaces read as spaces:
 * which words they bind is the formatter's business, not these tests'.
 */
async function resolve(
  target: Parameters<typeof resolveOgContent>[0],
): Promise<Awaited<ReturnType<typeof resolveOgContent>>> {
  const content = await resolveOgContent(target);
  return (
    content &&
    JSON.parse(JSON.stringify(content).replaceAll(NO_BREAK_SPACE, ' '))
  );
}

const NO_BREAK_SPACE = String.fromCharCode(0xa0);

async function useRussian() {
  const language = await loadLanguage('ru');
  Object.assign(context.server, { language, phrase: language.phrase });
}

function project(
  uuid: string,
  access: ProjectEventAccessLevel,
  extra: Partial<typeof context.schema.projects.$inferInsert> = {},
) {
  context.db
    .insert(context.schema.projects)
    .values({
      projectUuid: uuid,
      publicId: uuid,
      humanReadableSlug: uuid,
      title: `${uuid} title`,
      summary: `${uuid} summary`,
      access,
      createdAt: 1,
      updatedAt: 1,
      ...extra,
    })
    .run();
}

function datedSection(
  uuid: string,
  projectUuid: string,
  period: [string, string],
  isPrivate = false,
) {
  const { db, schema } = context;
  db.insert(schema.projectContentSections)
    .values({
      sectionUuid: uuid,
      projectUuid,
      title: `${uuid} title`,
      summary: '',
      humanReadableSlug: uuid,
      publicId: uuid,
      isPrivate,
      sortOrder: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.periods)
    .values({
      ownerType: 'project-section',
      ownerId: uuid,
      sortOrder: 0,
      startDate: period[0],
      endDate: period[1],
    })
    .run();
}

function section(uuid: string, projectUuid: string, isPrivate = false) {
  context.db
    .insert(context.schema.projectContentSections)
    .values({
      sectionUuid: uuid,
      projectUuid,
      title: `${uuid} title`,
      humanReadableSlug: uuid,
      publicId: uuid,
      isPrivate,
      sortOrder: 0,
      createdAt: Date.parse('2026-05-01T00:00:00Z'),
      updatedAt: Date.parse('2026-06-02T00:00:00Z'),
    })
    .run();
}

function event(
  uuid: string,
  access: ProjectEventAccessLevel,
  period?: [string, string],
) {
  const { db, schema } = context;
  db.insert(schema.events)
    .values({
      eventUuid: uuid,
      publicId: uuid,
      humanReadableSlug: uuid,
      title: `${uuid} title`,
      summary: '',
      access,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  if (period)
    db.insert(schema.periods)
      .values({
        ownerType: 'event',
        ownerId: uuid,
        sortOrder: 0,
        startDate: period[0],
        endDate: period[1],
      })
      .run();
}

function diary(
  uuid: string,
  date: string,
  access: ProjectEventAccessLevel,
  text?: string,
) {
  const { db, schema } = context;
  db.insert(schema.diaryEntries)
    .values({ diaryUuid: uuid, date, access, createdAt: 1, updatedAt: 1 })
    .run();
  if (text)
    db.insert(schema.content)
      .values({
        contentUuid: `content-${uuid}`,
        ownerType: 'diary-entry',
        ownerId: uuid,
        slot: 'diary-body',
        data: { blocks: [{ type: 'paragraph', data: { text } }] },
        createdAt: 1,
        updatedAt: 1,
      } as never)
      .run();
}

/** A stored picture or video; a video may have a still to stand in by. */
function asset(uuid: string, type: 'image' | 'video', still?: string) {
  const { db, schema } = context;
  db.insert(schema.assets)
    .values({
      assetUuid: uuid,
      slug: uuid,
      extension: type === 'image' ? 'webp' : 'mp4',
      familyUuid: uuid,
      contentHash: `${uuid}-hash`,
      settingsKey: type,
      settings: null,
      type: type as never,
      size: 1,
      touchedAt: 1,
      meta: null,
    })
    .run();
  if (!still) return;
  asset(still, 'image');
  db.insert(schema.assetUsages)
    .values({
      assetUuid: still,
      containerType: 'asset',
      containerId: uuid,
      role: 'preview',
      meta: null,
    })
    .run();
}

/**
 * A body of pictures, each in its own block and, when `hidden`, inside a
 * private section — used the way the editor records it.
 */
function body(
  ownerType: string,
  ownerId: string,
  slot: string,
  items: { asset: string; hidden?: boolean }[],
) {
  const { db, schema } = context;
  const contentUuid = `content-${ownerId}`;
  const blocks = items.flatMap(({ asset: assetUuid, hidden }, index) => {
    const media = {
      id: `media-${index}`,
      type: 'contentMedia',
      data: { asset: { assetUuid }, layout: 'stretch' },
    };
    const edge = (side: 'start' | 'end') => ({
      type: 'privateSectionBoundary',
      data: { sectionId: `private-${index}`, edge: side },
    });
    return hidden ? [edge('start'), media, edge('end')] : [media];
  });
  db.insert(schema.content)
    .values({
      contentUuid,
      ownerType,
      ownerId,
      slot,
      data: { blocks },
      createdAt: 1,
      updatedAt: 1,
    } as never)
    .run();
  items.forEach(({ asset: assetUuid, hidden = false }, index) =>
    db
      .insert(schema.assetUsages)
      .values({
        assetUuid,
        containerType: 'content',
        containerId: contentUuid,
        role: 'content',
        meta: {
          role: 'content',
          refs: [
            {
              blockId: `media-${index}`,
              blockType: 'contentMedia',
              isPrivate: hidden,
            },
          ],
          isPrivate: hidden,
        },
      })
      .run(),
  );
}

function relate(first: [string, string], second: [string, string], order = 0) {
  context.db
    .insert(context.schema.entityRelations)
    .values({
      firstType: first[0] as never,
      firstId: first[1],
      secondType: second[0] as never,
      secondId: second[1],
      type: 'related',
      note: null,
      firstSortOrder: order,
      secondSortOrder: order,
    })
    .run();
}

function tag(uuid: string, containers: [string, string][]) {
  const { db, schema } = context;
  db.insert(schema.tags)
    .values({
      tagUuid: uuid,
      title: `${uuid} title`,
      normalizedTitle: uuid,
      slug: uuid,
      publicId: uuid,
    })
    .run();
  containers.forEach(([type, id], index) =>
    db
      .insert(schema.tagUsages)
      .values({
        tagUuid: uuid,
        containerType: type as never,
        containerId: id,
        sortOrder: index,
      })
      .run(),
  );
}

describe('Open Graph content', () => {
  it('builds a card once until something is written', async () => {
    invalidateOgCardInfo();
    project('p', Public);
    const first = await resolveOgCardInfo({ kind: 'project', id: 'p' });
    context.db
      .update(context.schema.projects)
      .set({ title: 'A new title' })
      .run();
    // Every page asks for its card's address while it renders: the same
    // answer, without building the card again.
    expect(await resolveOgCardInfo({ kind: 'project', id: 'p' })).toBe(first);
    // A write through the API drops it, and the address follows the title.
    invalidateOgCardInfo();
    const next = await resolveOgCardInfo({ kind: 'project', id: 'p' });
    expect(next?.url).not.toBe(first?.url);
    invalidateOgCardInfo();
  });

  it('gives a closed site no cards at all', async () => {
    project('p', Public);
    config.siteAccessLevel = SiteAccessLevel.Private;
    expect(await resolve({ kind: 'site', id: 'site' })).toBeUndefined();
    expect(await resolve({ kind: 'project', id: 'p' })).toBeUndefined();
    expect(await resolve({ kind: 'service', id: 'life' })).toBeUndefined();
  });

  it('draws a public or a link-only project, never a private one', async () => {
    project('pub', Public);
    project('link', LinkOnly);
    project('secret', Private);
    expect(await resolve({ kind: 'project', id: 'pub' })).toBeDefined();
    expect(await resolve({ kind: 'project', id: 'link' })).toBeDefined();
    expect(await resolve({ kind: 'project', id: 'secret' })).toBeUndefined();
    expect(await resolve({ kind: 'project', id: 'missing' })).toBeUndefined();
  });

  it('counts a project the way its page does', async () => {
    project('p', Public, { showcase: true });
    datedSection('s1', 'p', ['2023-03-01', '2023-05-01']);
    datedSection('s2', 'p', ['2025-01-01', '2026-02-01']);
    datedSection('hidden', 'p', ['2019-01-01', '2019-02-01'], true);
    section('open', 'p');
    section('closed', 'p', true);
    event('e1', Public);
    event('e2', Private);
    diary('d1', '2024-01-01', Public);
    diary('d2', '2024-01-02', Private);
    relate(['event', 'e1'], ['project', 'p']);
    relate(['event', 'e2'], ['project', 'p'], 1);
    relate(['diary-entry', 'd1'], ['project', 'p']);
    relate(['diary-entry', 'd2'], ['project', 'p'], 1);
    tag('t1', [['project', 'p']]);

    const content = (await resolve({ kind: 'project', id: 'p' }))!;
    expect(content.chips.map((chip) => chip.label)).toEqual([
      'Project',
      'Showcase',
    ]);
    expect(content.headline).toBe('p title');
    expect(content.summary).toBe('p summary');
    const meta = content.meta.map((item) => item.text);
    // The private sections are neither dated nor counted; the span is the
    // dated ones', the count every section a stranger may open.
    expect(meta[0]).toBe('2023 — 2026 · 3 sections');
    // A private event is a secret the related tab names and counts; a
    // private diary entry is simply absent there.
    expect(meta).toContain('2 events');
    expect(meta).toContain('1 entry');
    expect(content.tags).toEqual(['t1 title']);
    expect(content.site).toEqual({
      name: expect.any(String),
      domain: 'petra.example/archive',
    });
    expect(content.picture).toMatchObject({
      type: 'generated',
      kind: 'project',
    });
    expect(content.alt).toContain('p title');
  });

  it('draws a project as its header: the icon, and the banner behind', async () => {
    project('plain', Public);
    project('dressed', Public);
    asset('icon', 'image');
    asset('banner', 'image');
    for (const [assetUuid, role] of [
      ['icon', 'icon'],
      ['banner', 'banner'],
    ] as const)
      context.db
        .insert(context.schema.assetUsages)
        .values({
          assetUuid,
          containerType: 'project',
          containerId: 'dressed',
          role,
          meta: null,
        })
        .run();

    const dressed = (await resolve({ kind: 'project', id: 'dressed' }))!;
    expect(dressed.picture).toMatchObject({ key: 'icon-hash.webp' });
    expect(dressed.banner).toMatchObject({ key: 'banner-hash.webp' });
    expect(dressed.tiles).toEqual([]);

    const plain = (await resolve({ kind: 'project', id: 'plain' }))!;
    expect(plain.picture).toMatchObject({ type: 'generated' });
    expect(plain.banner).toBeUndefined();
  });

  it('draws a dated section only when both it and its project are open', async () => {
    project('p', Public);
    project('closed', Private);
    datedSection('s1', 'p', ['2020-01-01', '2020-02-01']);
    datedSection('s2', 'p', ['2021-05-01', '2021-08-31']);
    datedSection('s3', 'p', ['2022-01-01', '2022-02-01'], true);
    datedSection('inside', 'closed', ['2020-01-01', '2020-02-01']);
    section('topic', 'p');
    expect(await resolve({ kind: 'section', id: 's3' })).toBeUndefined();
    expect(await resolve({ kind: 'section', id: 'inside' })).toBeUndefined();

    const content = (await resolve({ kind: 'section', id: 's2' }))!;
    // Its place among the dated sections a stranger sees.
    expect(content.chips[0]!.label).toBe('Stage 2 of 2');
    expect(content.parent?.title).toBe('p title');
    expect(content.meta[0]!.text).toBe('May — August 2021');
    expect(content.date).toBeUndefined();
  });

  it('shows the first picture of a public body a card can draw', async () => {
    project('p', Public);
    datedSection('photo', 'p', ['2020-01-01', '2020-02-01']);
    datedSection('still', 'p', ['2020-03-01', '2020-04-01']);
    datedSection('bare', 'p', ['2020-05-01', '2020-06-01']);
    section('past-private', 'p');
    section('past-video', 'p');
    event('e', Public);
    asset('image-1', 'image');
    asset('image-2', 'image');
    asset('secret', 'image');
    asset('film', 'video', 'film-still');
    asset('raw-film', 'video');
    body('project-section', 'photo', 'project-section-body', [
      { asset: 'image-1' },
    ]);
    body('project-section', 'still', 'project-section-body', [
      { asset: 'film' },
    ]);
    // Media only in a private section: nothing a stranger may see.
    body('project-section', 'bare', 'project-section-body', [
      { asset: 'secret', hidden: true },
    ]);
    body('project-section', 'past-private', 'project-section-body', [
      { asset: 'secret', hidden: true },
      { asset: 'image-2' },
    ]);
    // A video with no still yet has nothing to draw; the next picture does.
    body('project-section', 'past-video', 'project-section-body', [
      { asset: 'raw-film' },
      { asset: 'image-1' },
    ]);
    body('event', 'e', 'event-body', [{ asset: 'image-2' }]);

    const pictureOf = async (kind: 'section' | 'event', id: string) =>
      (await resolve({ kind, id }))!.picture;
    expect(await pictureOf('section', 'photo')).toMatchObject({
      type: 'file',
      key: 'image-1-hash.webp',
    });
    expect(await pictureOf('section', 'still')).toMatchObject({
      type: 'file',
      key: 'film-still-hash.webp',
    });
    expect(await pictureOf('section', 'bare')).toMatchObject({
      type: 'generated',
      kind: 'project-section',
    });
    expect(await pictureOf('section', 'past-private')).toMatchObject({
      type: 'file',
      key: 'image-2-hash.webp',
    });
    expect(await pictureOf('section', 'past-video')).toMatchObject({
      type: 'file',
      key: 'image-1-hash.webp',
    });
    expect(await pictureOf('event', 'e')).toMatchObject({
      type: 'file',
      key: 'image-2-hash.webp',
    });
  });

  it('says when a section last changed', async () => {
    project('p', Public);
    section('open', 'p');
    section('closed', 'p', true);
    expect(await resolve({ kind: 'section', id: 'closed' })).toBeUndefined();
    const content = (await resolve({ kind: 'section', id: 'open' }))!;
    expect(content.meta[0]!.text).toBe('Updated June 2, 2026');
  });

  it('dates an event and names the projects it belongs to', async () => {
    event('e', Public, ['2024-06-14', '2024-06-14']);
    event('hidden', Private);
    project('a', Public);
    project('b', Private);
    relate(['event', 'e'], ['project', 'a']);
    relate(['event', 'e'], ['project', 'b'], 1);
    expect(await resolve({ kind: 'event', id: 'hidden' })).toBeUndefined();

    const content = (await resolve({ kind: 'event', id: 'e' }))!;
    // A calendar leaf is a diary entry's alone; an event's date is a fact.
    expect(content.date).toBeUndefined();
    expect(content.meta[0]).toEqual({
      icon: 'calendar',
      text: 'June 14, 2024',
    });
    // The private project is the codename its page shows, and counted.
    expect(content.related?.total).toBe(2);
    expect(content.related?.titles[0]).toBe('a title');
  });

  it('quotes the opening of a public diary entry and refuses a private one', async () => {
    diary('d', '2024-09-03', Public, 'The chapter is finally done.');
    diary('secret', '2024-09-04', Private, 'Nobody reads this.');
    expect(await resolve({ kind: 'diary', id: '2024-09-04' })).toBeUndefined();

    const content = (await resolve({
      kind: 'diary',
      id: '2024-09-03',
    }))!;
    expect(content.headline).toBe('September 3, 2024');
    expect(content.quote).toBe('The chapter is finally done.');
    expect(content.date).toEqual({
      weekday: 'Tuesday',
      day: '3',
      month: 'September',
      year: '2024',
    });
    // Seeded by the day, as its card in the feeds is: the same cloud.
    expect(content.seed).toBe('2024-09-03');
  });

  it('refuses a tag nothing public carries, and counts only public items', async () => {
    project('pub', Public);
    project('link', LinkOnly);
    event('secret', Private);
    tag('open', [
      ['project', 'pub'],
      ['project', 'link'],
      ['event', 'secret'],
    ]);
    tag('hidden', [
      ['project', 'link'],
      ['event', 'secret'],
    ]);
    expect(await resolve({ kind: 'tag', id: 'hidden' })).toBeUndefined();
    const content = (await resolve({ kind: 'tag', id: 'open' }))!;
    expect(content.meta.map((item) => item.text)).toEqual(['1 project']);
    // Its icon is the card; what it holds is counted, not shown.
    expect(content.picture).toMatchObject({ type: 'generated', kind: 'tag' });
    expect(content.tiles).toEqual([]);
  });

  it('draws a page with the date it last changed', async () => {
    context.db
      .insert(context.schema.pages)
      .values({
        pageUuid: 'pg',
        slug: 'about',
        title: 'About',
        summary: 'Who I am',
        access: Public,
        createdAt: 1,
        updatedAt: Date.parse('2026-09-02T00:00:00Z'),
      })
      .run();
    const content = (await resolve({ kind: 'page', id: 'about' }))!;
    expect(content.headline).toBe('About');
    expect(content.meta[0]!.text).toBe('Updated September 2, 2026');
  });

  it('counts the archive on the home card as the site does', async () => {
    project('a', Public);
    project('b', Private);
    event('e', LinkOnly);
    diary('d1', '2024-01-01', Public);
    diary('d2', '2024-01-02', Private);
    const content = (await resolve({ kind: 'site', id: 'site' }))!;
    // Real totals, secrets included, as the home page and the diary feed
    // count them.
    expect(content.stats).toEqual([
      { icon: 'project', value: '2', label: 'projects' },
      { icon: 'event', value: '1', label: 'event' },
      { icon: 'thought', value: '2', label: 'entries' },
    ]);
  });

  it('charts the life year by year, gaps included', async () => {
    event('e1', Public, ['2019-03-01', '2019-03-01']);
    event('e2', Public, ['2022-03-01', '2022-03-01']);
    const content = (await resolve({ kind: 'service', id: 'life' }))!;
    expect(content.histogram).toEqual({
      values: [1, 0, 0, 1],
      first: '2019',
      last: '2022',
    });
    expect(content.headline).toBe('4 years in one chronicle');
  });

  it('lists only public items in a search preset and the tag cloud', async () => {
    project('a', Public, { showcase: true });
    project('b', LinkOnly, { showcase: true });
    project('c', Private, { showcase: true });
    tag('t', [
      ['project', 'a'],
      ['project', 'b'],
    ]);
    const showcase = (await resolve({
      kind: 'service',
      id: 'showcase',
    }))!;
    expect(showcase.meta.map((item) => item.text)).toEqual(['1 project']);
    const tags = (await resolve({ kind: 'service', id: 'tags' }))!;
    expect(tags.cloud).toMatchObject([{ title: 't title', count: 1 }]);
    expect(tags.cloudTotal).toBe(1);
  });

  it('refuses a service it does not know', async () => {
    expect(await resolve({ kind: 'service', id: 'admin' as never }))
      .toBeUndefined;
  });

  it('gives the owner’s words their typography, and never draws what it cannot', async () => {
    await useRussian();
    project('q', Public, { title: 'Проект "Альфа" -- начало' });
    project('emoji', Public, { title: '🚀🔥' });
    project('cjk', Public, { title: '漢字の題名' });
    const quoted = (await resolve({ kind: 'project', id: 'q' }))!;
    expect(quoted.headline).toContain('«Альфа»');
    expect(quoted.headline).toContain('—');
    // A title with nothing drawable falls back to what the thing is, while
    // the description of the picture keeps the title in full.
    for (const id of ['emoji', 'cjk']) {
      const content = (await resolve({ kind: 'project', id }))!;
      expect(content.headline).toBe('Проект');
    }
    const cjk = (await resolve({ kind: 'project', id: 'cjk' }))!;
    expect(cjk.alt).toContain('漢字の題名');
  });
});
