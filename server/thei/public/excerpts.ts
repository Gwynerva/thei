import type {
  PublicExcerpt,
  PublicExcerptCard,
  PublicExcerptParent,
  PublicExcerptsAbout,
  PublicExcerptsPage,
  PublicNeighbour,
  PublicNeighbours,
} from '#layers/thei/shared/api/public';
import { buildExcerptUrl } from '#layers/thei/shared/excerpt-url';
import { excerptParentContentEntity } from '#layers/thei/shared/excerpt-url';
import { paginate } from '#layers/thei/shared/pagination';
import {
  relationEndpointKey,
  type RelationEndpoint,
  type RelationType,
} from '#layers/thei/shared/relation';
import type { PublicViewer } from '../access-links/viewer';
import type { StoredAssetRecord } from '../assets/storage';
import {
  buildPublicBanner,
  buildPublicCardMedia,
  findEntityBannerAsset,
} from '../entity-banner';
import {
  excerptRelationRowsOf,
  listExcerpts,
  type ExcerptRecord,
} from '../excerpts';
import {
  diaryExcerptParent,
  eventExcerptParent,
  excerptIsOwn,
  excerptListed,
  loadExcerptParent,
  projectExcerptParent,
  type ExcerptParentInfo,
} from '../excerpts/parents';
import { fromStoredRelationNote, fromStoredRelationType } from '../relations';
import {
  buildPublicContentData,
  buildPublicEntityPreviewMedia,
} from './content';
import {
  buildPublicEntityChronology,
  buildPublicEntityReference,
} from './entities';
import { buildPublicRelatedLinks, resolvePublicRelated } from './related';

/**
 * Excerpts as visitors read them.
 *
 * An excerpt is shown in two places: whole on its parent's page and on a
 * page of its own, and as a card on the pages of what it is about. Both are
 * built here, for one viewer, from the same record, so a card never says
 * more than the page would. What the viewer may see is decided by the
 * predicates of `../excerpts/parents.ts`: an excerpt is as open as its
 * parent unless it is private, and its private side is the parent's.
 */

/** How many cards one page of the block on a target holds. */
export const PUBLIC_EXCERPTS_PAGE_SIZE = 12;

export { diaryExcerptParent, eventExcerptParent, projectExcerptParent };

/** The parent as a card names it, with what stands for it. */
async function buildPublicExcerptParent(
  parent: ExcerptParentInfo,
  own: boolean,
): Promise<PublicExcerptParent> {
  const media =
    parent.type === 'project'
      ? (await buildPublicEntityReference(parent.row)).iconMedia
      : parent.type === 'event'
        ? await buildPublicCardMedia({ type: 'event', event: parent.row }, own)
        : await buildPublicEntityPreviewMedia(
            'diary-entry',
            parent.id,
            'diary-body',
            { type: 'diary-entry', date: parent.row.date },
            own,
          );
  return {
    type: parent.type,
    title: parent.title,
    href: parent.href,
    ...(parent.type === 'diary-entry' ? { date: parent.row.date } : {}),
    access: parent.access,
    ...(media ? { media } : {}),
  };
}

/** What the card says of its relation to the page it is shown on. */
export type ExcerptAboutSide = { relationType: RelationType; note?: string };

/**
 * An excerpt as a card shows it. `banner` is its banner when the caller has
 * read it already; an excerpt without one reads nothing.
 */
export async function buildPublicExcerptCard(
  excerpt: ExcerptRecord,
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
  side?: ExcerptAboutSide,
  banner: StoredAssetRecord | null | undefined = excerpt.bannerAssetUuid
    ? undefined
    : null,
): Promise<PublicExcerptCard> {
  const own = excerptIsOwn(viewer, parent);
  const [media, parentCard, about] = await Promise.all([
    buildPublicCardMedia(
      { type: 'excerpt', parent: parent.address, excerpt },
      own,
      banner,
    ),
    buildPublicExcerptParent(parent, own),
    resolvePublicRelated({ type: 'excerpt', id: excerpt.excerptUuid }, viewer),
  ]);
  return {
    title: excerpt.title,
    summary: excerpt.summary,
    href: buildExcerptUrl(
      parent.address,
      excerpt.humanReadableSlug,
      excerpt.publicId,
    ),
    publicId: excerpt.publicId,
    media,
    parent: parentCard,
    ...(parent.date ? { date: parent.date } : {}),
    about: await buildPublicRelatedLinks(about, viewer),
    ...(side
      ? {
          relationType: side.relationType,
          ...(side.note ? { note: side.note } : {}),
        }
      : {}),
  };
}

/**
 * An excerpt whole, as its parent's page embeds it and its own page shows
 * it: the card, its banner, its text and its place among its parent's.
 */
export async function buildPublicExcerpt(
  excerpt: ExcerptRecord,
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
  position: { number: number; count: number },
): Promise<PublicExcerpt> {
  const own = excerptIsOwn(viewer, parent);
  // Read once, for the card and for the page's hero.
  const banner = excerpt.bannerAssetUuid
    ? ((await findEntityBannerAsset('excerpt', excerpt.excerptUuid)) ?? null)
    : null;
  const holder = { type: 'excerpt', parent: parent.address, excerpt } as const;
  const [card, bannerMedia, content] = await Promise.all([
    buildPublicExcerptCard(excerpt, parent, viewer, undefined, banner),
    buildPublicBanner(holder, banner),
    buildPublicContentData(
      'excerpt',
      excerpt.excerptUuid,
      'excerpt-body',
      excerptParentContentEntity(parent.address),
      own,
      viewer,
    ),
  ]);
  return {
    ...card,
    humanReadableSlug: excerpt.humanReadableSlug,
    ...(bannerMedia ? { bannerMedia } : {}),
    content: content ?? { blocks: [] },
    chronology: buildPublicEntityChronology(excerpt),
    position,
  };
}

/**
 * A parent's excerpts the viewer may see, in the owner's order. The parent's
 * page is open to whoever asks this, so only the private flag counts.
 */
export function visibleParentExcerpts(
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
): ExcerptRecord[] {
  const own = excerptIsOwn(viewer, parent);
  return listExcerpts(parent).filter((excerpt) => own || !excerpt.isPrivate);
}

/** A parent's excerpts, whole, as its page embeds them. */
export async function buildParentExcerpts(
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
): Promise<PublicExcerpt[]> {
  const visible = visibleParentExcerpts(parent, viewer);
  return Promise.all(
    visible.map((excerpt, index) =>
      buildPublicExcerpt(excerpt, parent, viewer, {
        number: index + 1,
        count: visible.length,
      }),
    ),
  );
}

/**
 * The excerpts just before and just after one, among its parent's the
 * viewer may see, in the owner's order.
 */
export async function buildExcerptNeighbours(
  visible: ExcerptRecord[],
  excerpt: ExcerptRecord,
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
): Promise<PublicNeighbours> {
  const index = visible.indexOf(excerpt);
  if (index < 0) return {};
  const describe = async (
    item: ExcerptRecord | undefined,
  ): Promise<PublicNeighbour | undefined> => {
    if (!item) return undefined;
    const card = await buildPublicExcerptCard(item, parent, viewer);
    return {
      title: card.title,
      href: card.href,
      media: card.media,
      ...(card.summary ? { summary: card.summary } : {}),
    };
  };
  const [previous, next] = await Promise.all([
    describe(index > 0 ? visible[index - 1] : undefined),
    describe(visible[index + 1]),
  ]);
  return {
    ...(previous ? { previous } : {}),
    ...(next ? { next } : {}),
  };
}

/**
 * One excerpt about an entity, as this visitor may see it, before its card
 * is built: cheap, since a project may gather many.
 */
export type PublicExcerptAboutItem = {
  excerpt: ExcerptRecord;
  parent: ExcerptParentInfo;
  side: ExcerptAboutSide;
};

/**
 * The excerpts about an entity, as this visitor may see them, newest first:
 * by the day of the parent, then by when the excerpt was written.
 *
 * Listed only where the parent may be listed and the excerpt is not private,
 * or on the private side; for a visitor, an excerpt of a day still to come
 * waits for it, as the entry does on the chronology. An excerpt nobody may
 * see is simply absent: a count of hidden ones would say how much was
 * written about the page, which is what a private entry protects.
 */
export async function resolvePublicExcerptsAbout(
  target: RelationEndpoint,
  viewer: PublicViewer,
  now = Date.now(),
): Promise<PublicExcerptAboutItem[]> {
  const { db, schema } = THEI_SERVER.useDb();
  const joined = excerptRelationRowsOf(db, schema, target);
  if (!joined.length) return [];
  const byId = new Map(joined.map((item) => [item.excerptUuid, item.row]));
  const rows = listExcerptsByIds([...byId.keys()]);
  const parents = new Map<string, ExcerptParentInfo | undefined>();
  const items: PublicExcerptAboutItem[] = [];
  for (const excerpt of rows) {
    const key = relationEndpointKey({
      type: excerpt.parentType,
      id: excerpt.parentId,
    });
    if (!parents.has(key))
      parents.set(
        key,
        await loadExcerptParent(excerpt.parentType, excerpt.parentId),
      );
    const parent = parents.get(key);
    if (!parent) continue;
    const own = excerptIsOwn(viewer, parent);
    if (!excerptListed(excerpt, parent, own)) continue;
    if (!own && parent.arrives > now) continue;
    const row = byId.get(excerpt.excerptUuid);
    const first = row.firstType === target.type && row.firstId === target.id;
    const note = fromStoredRelationNote(row.note ?? undefined, first);
    const text = note?.type === 'split' ? note.currentText : note?.text;
    items.push({
      excerpt,
      parent,
      side: {
        relationType: fromStoredRelationType(row.type, first),
        ...(text ? { note: text } : {}),
      },
    });
  }
  return items.sort(compareNewestFirst);
}

function compareNewestFirst(
  left: PublicExcerptAboutItem,
  right: PublicExcerptAboutItem,
) {
  const byDay = (right.parent.date ?? '').localeCompare(left.parent.date ?? '');
  if (byDay) return byDay;
  return (
    right.excerpt.createdAt - left.excerpt.createdAt ||
    left.excerpt.excerptUuid.localeCompare(right.excerpt.excerptUuid)
  );
}

/** The records of some excerpts, by id, with their banners. */
function listExcerptsByIds(ids: string[]): ExcerptRecord[] {
  const wanted = new Set(ids);
  const { db, schema } = THEI_SERVER.useDb();
  // Parents are few beside their excerpts: each parent's list is read once,
  // banners and all, and the wanted ones picked from it.
  const parents = new Map<
    string,
    { type: ExcerptRecord['parentType']; id: string }
  >();
  for (const row of db
    .select({
      excerptUuid: schema.excerpts.excerptUuid,
      parentType: schema.excerpts.parentType,
      parentId: schema.excerpts.parentId,
    })
    .from(schema.excerpts)
    .all())
    if (wanted.has(row.excerptUuid))
      parents.set(`${row.parentType}:${row.parentId}`, {
        type: row.parentType,
        id: row.parentId,
      });
  return [...parents.values()].flatMap((parent) =>
    listExcerpts(parent).filter((excerpt) => wanted.has(excerpt.excerptUuid)),
  );
}

/** How many excerpts are about an entity, as the visitor may see them. */
export async function countPublicExcerptsAbout(
  target: RelationEndpoint,
  viewer: PublicViewer,
): Promise<PublicExcerptsAbout> {
  return { total: (await resolvePublicExcerptsAbout(target, viewer)).length };
}

/** One page of the cards about an entity. */
export async function buildPublicExcerptsPage(
  target: RelationEndpoint,
  page: unknown,
  viewer: PublicViewer,
): Promise<PublicExcerptsPage> {
  const items = await resolvePublicExcerptsAbout(target, viewer);
  const paged = paginate(items, page, PUBLIC_EXCERPTS_PAGE_SIZE);
  return {
    ...paged,
    items: await Promise.all(
      paged.items.map((item) =>
        buildPublicExcerptCard(item.excerpt, item.parent, viewer, item.side),
      ),
    ),
  };
}

/** Every card about an entity at once, for the Markdown mirror. */
export async function listPublicExcerptsAboutAll(
  target: RelationEndpoint,
  viewer: PublicViewer,
): Promise<PublicExcerptCard[]> {
  const items = await resolvePublicExcerptsAbout(target, viewer);
  return Promise.all(
    items.map((item) =>
      buildPublicExcerptCard(item.excerpt, item.parent, viewer, item.side),
    ),
  );
}
