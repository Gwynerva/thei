import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectEventAccessLevel } from '../../../shared/access-level';
import type { AssetPlacement } from '../../../shared/asset-library';
import { STRANGER } from '../../../server/thei/access-links/viewer';

/**
 * A file's window lists the other pages a visitor may go on to. What it must
 * never do is name a page a stranger cannot find, or one where a stranger
 * would not see the file: a private file, a private part of a text, an
 * owner's note, a page open by its link alone.
 */

const readPlacements = vi.fn();
vi.mock('../../../server/thei/assets/library', () => ({
  readPlacements: (...args: unknown[]) => readPlacements(...args),
}));
const findContentEntity = vi.fn();
vi.mock('../../../server/thei/content-entities', () => ({
  findContentEntity: (...args: unknown[]) => findContentEntity(...args),
}));
const builders = {
  buildPublicProject: vi.fn(),
  buildPublicProjectSection: vi.fn(),
  buildPublicEvent: vi.fn(),
  buildPublicPage: vi.fn(),
  buildPublicDiaryEntry: vi.fn(),
};
vi.mock('../../../server/thei/public/entities', () => ({
  ...Object.fromEntries(
    Object.entries(builders).map(([name, mock]) => [
      name,
      (...args: unknown[]) => mock(...args),
    ]),
  ),
  canListPublicEntity: (access: string, isAdmin: boolean) =>
    isAdmin || access === 'public',
}));
vi.mock('../../../server/thei/projects/content-sections', () => ({
  listProjectSections: () => [],
}));

const { findPublicFilePlaces } =
  await import('../../../server/thei/public/file-places');

/** The file and its variant, as two rows of one family. */
const FAMILY = [
  { assetUuid: 'a-photo', slug: 'photoSlug', familyUuid: 'f' },
  { assetUuid: 'a-crop', slug: 'cropSlug', familyUuid: 'f' },
];

const url = (slug: string) => ({ src: `/somewhere/media/x/${slug}.webp` });

function placement(
  type: AssetPlacement['source']['type'],
  id: string,
  role: AssetPlacement['role'],
  isPrivate = false,
): AssetPlacement {
  return {
    source: { type, id, title: id, summary: '', updatedAt: 0 },
    role,
    isPrivate,
    count: 1,
  };
}

function entity(
  type: string,
  id: string,
  access = ProjectEventAccessLevel.Public,
  extra: Record<string, unknown> = {},
) {
  return {
    entityType: type,
    entityId: id,
    title: id,
    href: `/${type}/${id}/`,
    access,
    media: async () => url(`card-${id}`),
    ...extra,
  };
}

const project = (patch: Record<string, unknown> = {}) => ({
  iconMedia: undefined,
  bannerMedia: undefined,
  description: { blocks: [] },
  showcase: [],
  references: { links: [], files: [] },
  ...patch,
});

/** Every write on the connection moves it, as SQLite's `total_changes()`. */
let changes = 0;
/** Where each file of the family is placed, by its uuid. */
let placedOn: Record<string, AssetPlacement[]> = {};

beforeEach(() => {
  changes = 0;
  // A connection of its own for each test: nothing is answered from another.
  const rawDb = {
    prepare: () => ({ get: () => ({ changes }) }),
  };
  (globalThis as any).THEI_SERVER = {
    useDb: () => ({ rawDb }),
    assets: {
      findBySlug: async (slug: string) =>
        FAMILY.find((asset) => asset.slug === slug),
      findByFamilyUuid: async () => FAMILY,
    },
    projects: { findByUuid: async (id: string) => ({ projectUuid: id }) },
    events: { findByUuid: async (id: string) => ({ eventUuid: id }) },
    pages: { findByUuid: async (id: string) => ({ pageUuid: id }) },
    diary: { findByUuid: async (id: string) => ({ diaryUuid: id }) },
  };
  readPlacements.mockReset();
  placedOn = {};
  // The library answers for the files it is asked about, and no other.
  readPlacements.mockImplementation(
    (uuids: string[]) =>
      new Map(uuids.map((uuid) => [uuid, placedOn[uuid] ?? []])),
  );
  findContentEntity.mockReset();
  for (const mock of Object.values(builders)) mock.mockReset();
  findContentEntity.mockImplementation(
    async ({
      entityType,
      entityId,
    }: {
      entityType: string;
      entityId: string;
    }) => entity(entityType, entityId),
  );
});
afterEach(() => delete (globalThis as any).THEI_SERVER);

function placed(...placements: AssetPlacement[]) {
  placedOn = { 'a-photo': placements };
}

it('lists a public page that shows the file, by how it is used there', async () => {
  placed(
    placement('project', 'trip', 'showcase-asset'),
    placement('project', 'trip', 'content'),
  );
  builders.buildPublicProject.mockResolvedValue(
    project({
      showcase: [url('photoSlug')],
      description: { blocks: [{ data: { asset: url('photoSlug') } }] },
    }),
  );
  expect(await findPublicFilePlaces('photoSlug')).toEqual([
    {
      kind: 'project',
      title: 'trip',
      href: '/project/trip/',
      media: url('card-trip'),
      uses: ['content', 'showcase-asset'],
    },
  ]);
  // Built for a stranger, and its picture from the public part alone.
  expect(builders.buildPublicProject).toHaveBeenCalledWith(
    { projectUuid: 'trip' },
    STRANGER,
  );
  expect(findContentEntity).toHaveBeenCalledWith(
    { entityType: 'project', entityId: 'trip' },
    STRANGER,
  );
});

it('names no page a stranger cannot find', async () => {
  placed(
    placement('event', 'secret', 'content'),
    placement('event', 'by-link', 'content'),
  );
  findContentEntity.mockImplementation(
    async ({
      entityType,
      entityId,
    }: {
      entityType: string;
      entityId: string;
    }) =>
      entity(
        entityType,
        entityId,
        entityId === 'secret'
          ? ProjectEventAccessLevel.Private
          : ProjectEventAccessLevel.LinkOnly,
      ),
  );
  builders.buildPublicEvent.mockResolvedValue({
    content: { blocks: [url('photoSlug')] },
    references: { links: [], files: [] },
  });
  expect(await findPublicFilePlaces('photoSlug')).toEqual([]);
  expect(builders.buildPublicEvent).not.toHaveBeenCalled();
});

it('names no page where the file is private, or not shown to a stranger', async () => {
  placed(
    // A file marked private on a public project.
    placement('project', 'hidden-file', 'other-asset', true),
    // In a private part of a text, or an owner's note: the stranger's page
    // does not carry it.
    placement('diary-entry', '2024-05-01', 'content'),
  );
  builders.buildPublicDiaryEntry.mockResolvedValue({
    content: { blocks: [{ type: 'paragraph' }] },
  });
  expect(await findPublicFilePlaces('photoSlug')).toEqual([]);
  expect(builders.buildPublicProject).not.toHaveBeenCalled();
});

it("does not take another place's file on the page for this one", async () => {
  placed(placement('project', 'notes-only', 'content'));
  // The project's notes hold the file; its page shows it only on the card
  // of a linked page, which is that page's own picture.
  builders.buildPublicProject.mockResolvedValue(
    project({
      references: { links: [{ iconMedia: url('photoSlug') }], files: [] },
    }),
  );
  expect(await findPublicFilePlaces('photoSlug')).toEqual([]);
});

it('takes every variant of the file for the file', async () => {
  placedOn = { 'a-crop': [placement('event', 'party', 'banner')] };
  builders.buildPublicEvent.mockResolvedValue({
    bannerMedia: url('cropSlug'),
    content: { blocks: [] },
    references: { links: [], files: [] },
  });
  const places = await findPublicFilePlaces('photoSlug');
  expect(places.map(({ title, uses }) => ({ title, uses }))).toEqual([
    { title: 'party', uses: ['banner'] },
  ]);
});

it('answers a file nobody may see as one that never was', async () => {
  expect(await findPublicFilePlaces('nobody')).toEqual([]);
  expect(await findPublicFilePlaces('')).toEqual([]);
  expect(readPlacements).not.toHaveBeenCalled();
});

it('goes from projects down to diary entries, the newest day first', async () => {
  placed(
    placement('diary-entry', '2024-01-02', 'content'),
    placement('event', 'party', 'content'),
    placement('diary-entry', '2024-03-04', 'content'),
    placement('project', 'trip', 'content'),
  );
  const shown = { content: { blocks: [url('photoSlug')] } };
  builders.buildPublicDiaryEntry.mockResolvedValue(shown);
  builders.buildPublicEvent.mockResolvedValue({
    ...shown,
    references: { links: [], files: [] },
  });
  builders.buildPublicProject.mockResolvedValue(
    project({ description: shown.content }),
  );
  expect(
    (await findPublicFilePlaces('photoSlug')).map((place) => place.title),
  ).toEqual(['trip', 'party', '2024-03-04', '2024-01-02']);
});

it('lists a page anyone may find, however many open by their link come first', async () => {
  // The library names the events first; none of them may be listed.
  placed(
    ...Array.from({ length: 30 }, (_, index) =>
      placement('event', `by-link-${index}`, 'content'),
    ),
    placement('project', 'trip', 'content'),
  );
  findContentEntity.mockImplementation(
    async ({
      entityType,
      entityId,
    }: {
      entityType: string;
      entityId: string;
    }) =>
      entity(
        entityType,
        entityId,
        entityType === 'event'
          ? ProjectEventAccessLevel.LinkOnly
          : ProjectEventAccessLevel.Public,
      ),
  );
  builders.buildPublicProject.mockResolvedValue(
    project({ description: { blocks: [url('photoSlug')] } }),
  );
  expect(
    (await findPublicFilePlaces('photoSlug')).map((place) => place.title),
  ).toEqual(['trip']);
  expect(builders.buildPublicEvent).not.toHaveBeenCalled();
});

it('builds a few pages at a time, and the first ones listed', async () => {
  placed(
    ...Array.from({ length: 30 }, (_, index) =>
      placement('event', `party-${String(index).padStart(2, '0')}`, 'content'),
    ),
  );
  let building = 0;
  let most = 0;
  builders.buildPublicEvent.mockImplementation(async () => {
    most = Math.max(most, ++building);
    await new Promise((resolve) => setTimeout(resolve, 2));
    building--;
    return {
      content: { blocks: [url('photoSlug')] },
      references: { links: [], files: [] },
    };
  });
  const places = await findPublicFilePlaces('photoSlug');
  expect(places).toHaveLength(24);
  expect(places[0]!.title).toBe('party-00');
  expect(places.at(-1)!.title).toBe('party-23');
  expect(builders.buildPublicEvent).toHaveBeenCalledTimes(24);
  expect(most).toBeLessThanOrEqual(2);
});

it('answers again from what it built until something is written', async () => {
  placed(placement('event', 'party', 'banner'));
  builders.buildPublicEvent.mockResolvedValue({
    bannerMedia: url('photoSlug'),
    content: { blocks: [] },
    references: { links: [], files: [] },
  });
  const first = await findPublicFilePlaces('photoSlug');
  // Asked by the slug of another variant, it is the same file.
  expect(await findPublicFilePlaces('cropSlug')).toEqual(first);
  expect(builders.buildPublicEvent).toHaveBeenCalledTimes(1);

  // The banner went private: the next answer is built afresh.
  changes++;
  placed(placement('event', 'party', 'banner', true));
  expect(await findPublicFilePlaces('photoSlug')).toEqual([]);
});

it('leaves out a place whose page fails to build, and keeps the rest', async () => {
  placed(
    placement('page', 'broken', 'content'),
    placement('page', 'about', 'icon'),
  );
  builders.buildPublicPage.mockImplementation(async ({ pageUuid }) => {
    if (pageUuid === 'broken') throw new Error('gone');
    return { iconMedia: url('photoSlug'), content: { blocks: [] } };
  });
  expect(
    (await findPublicFilePlaces('photoSlug')).map((place) => place.uses),
  ).toEqual([['icon']]);
});
