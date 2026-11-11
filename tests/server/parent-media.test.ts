import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import { OWNER, STRANGER } from '../../server/thei/access-links/viewer';
import { findContentEntity } from '../../server/thei/content-entities';
import { buildAdminExcerptsPreviewMedia } from '../../server/thei/excerpts/preview-media';
import { ogBodyPicture } from '../../server/thei/og/content/shared';
import {
  buildPublicDiaryCardMedia,
  buildPublicEventCardMedia,
} from '../../server/thei/public/parent-media';
import { relationIconMedia } from '../../server/thei/relations';
import { freshTestDb } from '../helpers/fresh-db';
import { serverRepositories } from '../helpers/server-repositories';

/**
 * What stands for an event or a diary entry that has no picture of its own:
 * the first picture of its excerpts, in the owner's order — each its banner,
 * else the first picture of its text — from those the viewer is shown on the
 * parent's page, and the drawn icon only when none has one.
 */
const { Public, LinkOnly, Private } = ProjectEventAccessLevel;
let context: Awaited<ReturnType<typeof freshTestDb>>;

beforeEach(async () => {
  context = await freshTestDb();
  Object.assign(context.server, serverRepositories);
  order = 0;
});

afterEach(async () => {
  await context.close();
  delete (globalThis as any).THEI_SERVER;
});

const ENTRY = { diaryUuid: 'd', date: '2026-05-01' };
const EVENT = { eventUuid: 'e', humanReadableSlug: 'e', publicId: 'e' };
const row = { summary: '', createdAt: 1, updatedAt: 1 };
let order = 0;

function diary() {
  context.insert('diary-entries', {
    ...ENTRY,
    access: Public,
    reminder: '',
    createdAt: 1,
    updatedAt: 1,
  });
}

function event() {
  context.insert('events', {
    ...row,
    ...EVENT,
    title: 'Event',
    access: Public,
  });
}

function project(uuid: string, access: ProjectEventAccessLevel) {
  context.insert('projects', {
    ...row,
    projectUuid: uuid,
    publicId: uuid,
    humanReadableSlug: uuid,
    title: uuid,
    access,
  });
}

function asset(uuid: string) {
  context.insert('assets', {
    assetUuid: uuid,
    slug: uuid,
    extension: 'webp',
    familyUuid: uuid,
    contentHash: `${uuid}-hash`,
    settingsKey: 'image',
    settings: null,
    type: 'image',
    size: 1,
    touchedAt: 1,
    meta: null,
  });
}

/** A text of one paragraph, and one picture after it when `picture` is given. */
function text(
  ownerType: 'diary-entry' | 'event' | 'excerpt',
  ownerId: string,
  slot: string,
  picture?: string,
  isPrivate = false,
) {
  const contentUuid = `content-${ownerId}`;
  context.insert('content', {
    contentUuid,
    ownerType,
    ownerId,
    slot,
    data: JSON.stringify({
      blocks: [
        { id: 'words', type: 'paragraph', data: { text: 'Words' } },
        ...(picture
          ? [
              {
                id: 'media',
                type: 'contentMedia',
                data: { asset: { assetUuid: picture }, layout: 'stretch' },
              },
            ]
          : []),
      ],
    }),
    createdAt: 1,
    updatedAt: 1,
  });
  if (!picture) return;
  asset(picture);
  context.insert('asset-usages', {
    assetUuid: picture,
    containerType: 'content',
    containerId: contentUuid,
    role: 'content',
    meta: JSON.stringify({
      role: 'content',
      refs: [{ blockId: 'media', blockType: 'contentMedia', isPrivate }],
    }),
  });
}

function excerpt(
  uuid: string,
  parent: ['diary-entry' | 'event', string],
  options: {
    picture?: string;
    privatePicture?: boolean;
    banner?: string;
    isPrivate?: boolean;
    about?: string;
  } = {},
) {
  context.insert('excerpts', {
    excerptUuid: uuid,
    parentType: parent[0],
    parentId: parent[1],
    title: uuid,
    summary: '',
    humanReadableSlug: uuid,
    publicId: uuid,
    isPrivate: options.isPrivate ? 1 : 0,
    sortOrder: order++,
    createdAt: 1,
    updatedAt: 1,
  });
  text(
    'excerpt',
    uuid,
    'excerpt-body',
    options.picture,
    options.privatePicture,
  );
  if (options.banner) {
    asset(options.banner);
    context.insert('asset-usages', {
      assetUuid: options.banner,
      containerType: 'excerpt',
      containerId: uuid,
      role: 'banner',
      meta: null,
    });
  }
  if (options.about)
    context.insert('entity-relations', {
      firstType: 'excerpt',
      firstId: uuid,
      secondType: 'project',
      secondId: options.about,
      type: 'related',
      note: null,
      firstSortOrder: 0,
      secondSortOrder: 0,
    });
}

const entryMedia = async (viewer = STRANGER) =>
  (await buildPublicDiaryCardMedia(ENTRY, viewer)).src;
const eventMedia = async (viewer = STRANGER) =>
  (await buildPublicEventCardMedia(EVENT, viewer)).src;

describe('the picture of a diary entry or an event without one', () => {
  it('keeps its own picture ahead of its excerpts’', async () => {
    diary();
    text('diary-entry', 'd', 'diary-body', 'own');
    excerpt('x', ['diary-entry', 'd'], { picture: 'theirs', banner: 'banner' });
    expect(await entryMedia()).toBe('/diary/2026-05-01/content/own.webp');
  });

  it('takes the first excerpt that has one, its banner ahead of its text', async () => {
    diary();
    excerpt('x1', ['diary-entry', 'd']);
    excerpt('x2', ['diary-entry', 'd'], { picture: 'second' });
    excerpt('x3', ['diary-entry', 'd'], { picture: 'third', banner: 'banner' });
    // An entry of nothing but its excerpts: no text of its own at all.
    expect(await entryMedia()).toBe('/diary/2026-05-01/content/second.webp');

    context.rawDb
      .prepare('UPDATE excerpts SET sortOrder = -1 WHERE excerptUuid = ?')
      .run('x3');
    expect(await entryMedia()).toBe(
      '/diary/2026-05-01/excerpts/x3-x3/media/banner/banner.webp',
    );
  });

  it('does the same for an event, after its banner and its text', async () => {
    event();
    text('event', 'e', 'event-body');
    excerpt('x', ['event', 'e'], { picture: 'theirs' });
    expect(await eventMedia()).toBe('/events/e-e/content/theirs.webp');

    asset('own-banner');
    context.insert('asset-usages', {
      assetUuid: 'own-banner',
      containerType: 'event',
      containerId: 'e',
      role: 'banner',
      meta: null,
    });
    expect(await eventMedia()).toBe('/events/e-e/banner/own-banner.webp');
  });

  it('draws the icon of the kind when no excerpt has a picture', async () => {
    diary();
    excerpt('x', ['diary-entry', 'd']);
    const media = await buildPublicDiaryCardMedia(ENTRY, STRANGER);
    expect(media.generated).toBe(true);
    expect(media.src).toContain('/media/generated-icons/diary-entry/');
  });

  it('passes over what the viewer is not shown on the parent’s page', async () => {
    diary();
    project('secret', Private);
    project('by-link', LinkOnly);
    excerpt('x-private', ['diary-entry', 'd'], {
      picture: 'private',
      isPrivate: true,
    });
    excerpt('x-secret', ['diary-entry', 'd'], {
      picture: 'about-secret',
      about: 'secret',
    });
    excerpt('x-link', ['diary-entry', 'd'], {
      picture: 'about-link',
      about: 'by-link',
    });
    excerpt('x-part', ['diary-entry', 'd'], {
      picture: 'private-part',
      privatePicture: true,
    });
    excerpt('x-open', ['diary-entry', 'd'], { picture: 'open' });

    const guest = (...grants: string[]) => ({
      isAdmin: false,
      grants: new Set(grants),
    });
    const src = (name: string) => `/diary/2026-05-01/content/${name}.webp`;
    expect(await entryMedia()).toBe(src('open'));
    expect(await entryMedia(OWNER)).toBe(src('private'));
    // The entry's own link opens its private excerpts and private parts,
    // never what is about something closed to its holder.
    expect(await entryMedia(guest('diary-entry:d'))).toBe(src('private'));
    // The subject's link opens the excerpt about it, and nothing private of
    // the entry.
    expect(await entryMedia(guest('project:secret'))).toBe(src('about-secret'));
    expect(await entryMedia(guest('project:by-link'))).toBe(src('about-link'));
  });

  it('gives a tile, a link and an Open Graph card the same picture', async () => {
    diary();
    excerpt('x-private', ['diary-entry', 'd'], {
      picture: 'private',
      isPrivate: true,
    });
    excerpt('x-open', ['diary-entry', 'd'], { picture: 'open' });
    const record = (await findContentEntity(
      { entityType: 'diary-entry', entityId: 'd' },
      STRANGER,
    ))!;
    const open = '/diary/2026-05-01/content/open.webp';
    expect((await record.media('public')).src).toBe(open);
    expect((await record.media('public', true, OWNER)).src).toBe(
      '/diary/2026-05-01/content/private.webp',
    );
    expect(await ogBodyPicture('diary-entry', 'd', 'diary-body')).toMatchObject(
      { type: 'file', key: 'open-hash.webp' },
    );
  });

  it('shows the owner every excerpt in the admin', async () => {
    diary();
    excerpt('x1', ['diary-entry', 'd']);
    excerpt('x2', ['diary-entry', 'd'], {
      picture: 'private',
      isPrivate: true,
    });
    const admin = '/api/admin/assets/private/content';
    const parent = { type: 'diary-entry', id: 'd' } as const;
    expect((await buildAdminExcerptsPreviewMedia(parent))?.src).toBe(admin);
    expect((await relationIconMedia(parent)).src).toBe(admin);
    const record = (await findContentEntity(
      { entityType: 'diary-entry', entityId: 'd' },
      OWNER,
    ))!;
    expect((await record.media('admin', true)).src).toBe(admin);
  });
});
