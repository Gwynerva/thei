import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { findAssetByUuid } from '../../server/thei/assets/repository/find-by-uuid';
import { findAssetsByContainer } from '../../server/thei/assets/repository/usages/find-by-container';
import { findAssetUsage } from '../../server/thei/assets/repository/usages/find-one';
import { findOtherAssetsForContainer } from '../../server/thei/assets/repository/usages/find-other';
import {
  buildContentFieldValue,
  findContentByOwner,
} from '../../server/thei/content/repository';
import { findContentEntity } from '../../server/thei/content-entities';
import { STRANGER } from '../../server/thei/access-links/viewer';
import { findEventByUuid } from '../../server/thei/events/repository/find-by-id';
import { findProjectByUuid } from '../../server/thei/projects/repository/find-by-id';
import { getProjectSections } from '../../server/thei/projects/content-sections';
import {
  buildPublicEvent,
  buildPublicEventSummary,
  buildPublicProjectSection,
  buildPublicProjectSectionSummary,
} from '../../server/thei/public/entities';
import { freshTestDb } from '../helpers/fresh-db';

/**
 * A banner is what an event or a section chose to be known by: its page
 * opens with it, and every card of it shows it ahead of the first picture of
 * its body. Without one, the cards keep the body's picture.
 */
let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, {
    useDb: () => context,
    config: { siteAccessLevel: 'public' },
    projects: { findByUuid: findProjectByUuid },
    events: { findByUuid: findEventByUuid },
    assets: {
      findByUuid: findAssetByUuid,
      usages: {
        findByContainer: findAssetsByContainer,
        findOne: findAssetUsage,
        findOtherForContainer: findOtherAssetsForContainer,
      },
    },
    content: {
      findByOwner: findContentByOwner,
      buildFieldValue: buildContentFieldValue,
    },
  });
  const { db, schema } = context;
  db.insert(schema.projects)
    .values({
      projectUuid: 'p',
      publicId: 'p',
      humanReadableSlug: 'project',
      title: 'Project',
      summary: '',
      access: ProjectEventAccessLevel.Public,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.projectContentSections)
    .values({
      sectionUuid: 's',
      projectUuid: 'p',
      title: 'Section',
      humanReadableSlug: 'section',
      publicId: 's',
      isPrivate: false,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  db.insert(schema.events)
    .values({
      eventUuid: 'e',
      publicId: 'e',
      humanReadableSlug: 'event',
      title: 'Event',
      summary: '',
      access: ProjectEventAccessLevel.Public,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  for (const uuid of ['picture', 'banner'])
    db.insert(schema.assets)
      .values({
        assetUuid: uuid,
        slug: uuid,
        extension: 'webp',
        familyUuid: uuid,
        contentHash: `${uuid}-hash`,
        settingsKey: 'image',
        settings: null,
        type: 'image' as never,
        size: 1,
        touchedAt: 1,
        meta: null,
      })
      .run();
  for (const [ownerType, ownerId, slot] of [
    ['project-section', 's', 'project-section-body'],
    ['event', 'e', 'event-body'],
  ] as const) {
    db.insert(schema.content)
      .values({
        contentUuid: `content-${ownerId}`,
        ownerType,
        ownerId,
        slot,
        data: {
          blocks: [
            {
              id: 'media',
              type: 'contentMedia',
              data: { asset: { assetUuid: 'picture' }, layout: 'stretch' },
            },
          ],
        },
        createdAt: 1,
        updatedAt: 1,
      } as never)
      .run();
    db.insert(schema.assetUsages)
      .values({
        assetUuid: 'picture',
        containerType: 'content',
        containerId: `content-${ownerId}`,
        role: 'content',
        meta: {
          role: 'content',
          refs: [
            { blockId: 'media', blockType: 'contentMedia', isPrivate: false },
          ],
          isPrivate: false,
        } as never,
      })
      .run();
  }
});

afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

function placeBanner(containerType: 'event' | 'project-section', id: string) {
  context.db
    .insert(context.schema.assetUsages)
    .values({
      assetUuid: 'banner',
      containerType,
      containerId: id,
      role: 'banner',
    })
    .run();
}

async function event() {
  return (await findEventByUuid('e'))!;
}

async function sectionCard() {
  const project = (await findProjectByUuid('p'))!;
  const [section] = await getProjectSections('p');
  return buildPublicProjectSectionSummary(project, section!);
}

describe('banners of events and sections', () => {
  it("puts an event's banner ahead of its body's picture wherever it is a card", async () => {
    const record = (await findContentEntity(
      { entityType: 'event', entityId: 'e' },
      STRANGER,
    ))!;
    expect((await buildPublicEventSummary(await event())).media?.src).toBe(
      '/events/event-e/content/picture.webp',
    );
    expect((await buildPublicEvent(await event(), STRANGER)).bannerMedia).toBe(
      undefined,
    );

    placeBanner('event', 'e');
    const banner = '/events/event-e/banner/banner.webp';
    expect((await buildPublicEventSummary(await event())).media?.src).toBe(
      banner,
    );
    const page = await buildPublicEvent(await event(), STRANGER);
    expect(page.bannerMedia?.src).toBe(banner);
    expect(page.media.src).toBe(banner);
    expect((await record.media('public')).src).toBe(banner);
    expect((await record.media('admin')).src).toBe(
      '/api/admin/assets/banner/content',
    );
  });

  it("puts a section's banner ahead of its body's picture, at the section's own address", async () => {
    expect((await sectionCard()).media?.src).toBe(
      '/projects/project-p/content/picture.webp',
    );

    placeBanner('project-section', 's');
    const banner =
      '/projects/project-p/sections/section-s/media/banner/banner.webp';
    expect((await sectionCard()).media?.src).toBe(banner);
    const project = (await findProjectByUuid('p'))!;
    const [section] = await getProjectSections('p');
    expect(section!.bannerAssetUuid).toBe('banner');
    expect(
      (await buildPublicProjectSection(project, section!, STRANGER)).bannerMedia
        ?.src,
    ).toBe(banner);
    const record = (await findContentEntity(
      { entityType: 'project-section', entityId: 's' },
      STRANGER,
    ))!;
    expect((await record.media('public')).src).toBe(banner);
  });
});
