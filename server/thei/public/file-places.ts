import { eq } from 'drizzle-orm';
import type { AssetRole } from '#layers/thei/shared/asset';
import type {
  PublicAction,
  PublicFilePlace,
  PublicFilePlaceKind,
} from '#layers/thei/shared/api/public';
import { STRANGER } from '../access-links/viewer';
import { readPlacements } from '../assets/library';
import { findContentEntity } from '../content-entities';
import { listProjectSections } from '../projects/content-sections';
import {
  buildPublicDiaryEntry,
  buildPublicEvent,
  buildPublicPage,
  buildPublicProject,
  buildPublicProjectSection,
  canListPublicEntity,
} from './entities';

const PLACE_KINDS = [
  'project',
  'project-section',
  'event',
  'page',
  'diary-entry',
] as const satisfies readonly PublicFilePlaceKind[];

/** Pages built for one answer at most: a file is rarely shown on more. */
const MAX_PLACES = 24;

function isPlaceKind(type: string): type is PublicFilePlaceKind {
  return (PLACE_KINDS as readonly string[]).includes(type);
}

type PageParts = [AssetRole, unknown][];

function actionParts(action: PublicAction | undefined): PageParts {
  return action
    ? [
        ['action-icon', action.iconMedia],
        ['action-background', action.backgroundMedia],
        ['action-file', [action.fileMedia, action.href]],
      ]
    : [];
}

/**
 * A page as a stranger receives it, cut into the parts that show the page's
 * own files, each named by the way a file is used there. The rest of the
 * page — the cards of its sections, its links, its tags — shows the files of
 * other places.
 */
async function pageParts(
  kind: PublicFilePlaceKind,
  id: string,
): Promise<PageParts> {
  switch (kind) {
    case 'project': {
      const project = await THEI_SERVER.projects.findByUuid(id);
      if (!project) return [];
      const page = await buildPublicProject(project, STRANGER);
      return [
        ['icon', page.iconMedia],
        ['banner', page.bannerMedia],
        ['content', page.description],
        ['showcase-asset', page.showcase],
        ['other-asset', page.references.files],
        ...actionParts(page.action),
      ];
    }
    case 'project-section': {
      const { db, schema } = THEI_SERVER.useDb();
      const row = db
        .select({ projectUuid: schema.projectContentSections.projectUuid })
        .from(schema.projectContentSections)
        .where(eq(schema.projectContentSections.sectionUuid, id))
        .get();
      const project =
        row && (await THEI_SERVER.projects.findByUuid(row.projectUuid));
      const section =
        project &&
        listProjectSections(project.projectUuid).find(
          (item) => item.sectionUuid === id,
        );
      if (!project || !section) return [];
      const page = await buildPublicProjectSection(project, section, STRANGER);
      return [
        ['banner', page.bannerMedia],
        ['content', page.content],
      ];
    }
    case 'event': {
      const event = await THEI_SERVER.events.findByUuid(id);
      if (!event) return [];
      const page = await buildPublicEvent(event, STRANGER);
      return [
        ['banner', page.bannerMedia],
        ['content', page.content],
        ['other-asset', page.references.files],
        ...actionParts(page.action),
      ];
    }
    case 'page': {
      const stored = await THEI_SERVER.pages.findByUuid(id);
      if (!stored) return [];
      const page = await buildPublicPage(stored, STRANGER);
      return [
        ['icon', page.iconMedia],
        ['content', page.content],
      ];
    }
    case 'diary-entry': {
      const entry = await THEI_SERVER.diary.findByUuid(id);
      if (!entry) return [];
      const page = await buildPublicDiaryEntry(entry, STRANGER);
      return [['content', page.content]];
    }
  }
}

/** Every public address of a file ends with its slug and its extension. */
function shows(part: unknown, slugs: string[]) {
  if (part === undefined || part === null) return false;
  const text = JSON.stringify(part);
  return slugs.some((slug) => text.includes(`/${slug}.`));
}

async function placeOf(
  kind: PublicFilePlaceKind,
  id: string,
  slugs: string[],
): Promise<PublicFilePlace | undefined> {
  const entity = await findContentEntity(
    { entityType: kind, entityId: id },
    STRANGER,
  );
  // A page anyone may find: one open by its link is for those given it.
  if (!entity || !canListPublicEntity(entity.access, false)) return undefined;
  const uses = new Set<AssetRole>();
  for (const [role, part] of await pageParts(kind, id))
    if (shows(part, slugs)) uses.add(role);
  if (!uses.size) return undefined;
  const media = await entity.media('public', false).catch(() => undefined);
  return {
    kind,
    title: entity.title,
    href: entity.href,
    ...(media ? { media } : {}),
    ...(entity.parent ? { parent: entity.parent } : {}),
    uses: [...uses],
  };
}

function comparePlaces(left: PublicFilePlace, right: PublicFilePlace) {
  const byKind =
    PLACE_KINDS.indexOf(left.kind) - PLACE_KINDS.indexOf(right.kind);
  if (byKind) return byKind;
  // A diary entry is called by its day: the newest first.
  if (left.kind === 'diary-entry') return right.title.localeCompare(left.title);
  return left.title.localeCompare(right.title);
}

/**
 * The pages a file is shown on, for the window a visitor opens it in.
 *
 * A visitor takes every variant of a file for the file itself, so the places
 * are those of its whole family. The library says where the file is placed;
 * each such place is then listed only when anyone may find it and the
 * stranger's own build of its page shows the file — never a private part, a
 * private file, an owner's note or a page open only by its link. The answer
 * is the same for every reader: a share link or the owner's session widens
 * nothing here, and a file nobody may see answers as one that never was.
 */
export async function findPublicFilePlaces(
  slug: string,
): Promise<PublicFilePlace[]> {
  const asset = slug ? await THEI_SERVER.assets.findBySlug(slug) : undefined;
  if (!asset) return [];
  const family = await THEI_SERVER.assets.findByFamilyUuid(asset.familyUuid);
  const slugs = family.map((member) => member.slug);
  const candidates = new Map<
    string,
    { kind: PublicFilePlaceKind; id: string }
  >();
  for (const placements of readPlacements(
    family.map((member) => member.assetUuid),
  ).values())
    for (const { source, isPrivate } of placements)
      if (!isPrivate && isPlaceKind(source.type))
        candidates.set(`${source.type}:${source.id}`, {
          kind: source.type,
          id: source.id,
        });
  const places = await Promise.all(
    [...candidates.values()]
      .slice(0, MAX_PLACES)
      .map(({ kind, id }) => placeOf(kind, id, slugs).catch(() => undefined)),
  );
  return places.filter((place) => place !== undefined).sort(comparePlaces);
}
