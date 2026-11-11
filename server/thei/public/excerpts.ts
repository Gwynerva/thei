import { describedSummary } from '../content/described';
import type {
  PublicExcerpt,
  PublicExcerptCard,
  PublicExcerptParent,
  PublicExcerptSecret,
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
import { findContentEntity } from '../content-entities';
import {
  buildPublicBanner,
  buildPublicCardMedia,
  findEntityBannerAsset,
} from '../entity-banner';
import {
  excerptRelationRowsOf,
  listExcerpts,
  listExcerptsByIds,
  type ExcerptRecord,
} from '../excerpts';
import {
  diaryExcerptParent,
  eventExcerptParent,
  excerptDay,
  excerptIsOwn,
  excerptListed,
  excerptOpens,
  excerptShownWithParent,
  loadExcerptParents,
  projectExcerptParent,
  type ExcerptParentInfo,
} from '../excerpts/parents';
import { fromStoredRelationNote, fromStoredRelationType } from '../relations';
import { buildPublicContentData } from './content';
import {
  buildPublicDiaryCardMedia,
  buildPublicEventCardMedia,
} from './parent-media';
import {
  buildPublicEntityChronology,
  buildPublicEntityReference,
} from './entities';
import { buildPublicRelatedLinks, resolvePublicRelated } from './related';
import { buildSecretReference } from './secret';

/**
 * Excerpts as visitors read them.
 *
 * An excerpt is shown in two places: whole on its parent's page and on a
 * page of its own, and as a card on the pages of what it is about. Both are
 * built here, for one viewer, from the same record, so a card never says
 * more than the page would. What the viewer may see is decided by the
 * predicates of `../excerpts/parents.ts`: an excerpt is as open as the
 * stricter of its parent and what it is about, unless it is private, and is
 * seen only by whoever may open both; on its parent's side, one they may
 * not is its codename in its place (`secretParentExcerpts`).
 */

/** How many cards one page of the block on a target holds. */
export const PUBLIC_EXCERPTS_PAGE_SIZE = 12;

/**
 * How many a project's page shows: only the latest, since the rest are read
 * on its chronology, which an event and a diary entry have none of.
 */
export const PUBLIC_PROJECT_EXCERPTS_SIZE = 5;

export { diaryExcerptParent, eventExcerptParent, projectExcerptParent };

/** The parent as a card names it, with what stands for it. */
async function buildPublicExcerptParent(
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
): Promise<PublicExcerptParent> {
  const media =
    parent.type === 'project'
      ? (await buildPublicEntityReference(parent.row)).iconMedia
      : parent.type === 'event'
        ? await buildPublicEventCardMedia(parent.row, viewer)
        : await buildPublicDiaryCardMedia(parent.row, viewer);
  // What the parent's own link says of it: the summary in the row a project
  // or an event came with; a diary entry has none, and is read for its lead.
  const summary =
    parent.type === 'diary-entry'
      ? ((
          await findContentEntity(
            { entityType: parent.type, entityId: parent.id },
            viewer,
          )
        )?.summary ?? '')
      : parent.row.summary;
  return {
    type: parent.type,
    title: parent.title,
    summary,
    href: parent.href,
    ...(parent.type === 'diary-entry' ? { date: parent.row.date } : {}),
    access: parent.access,
    ...(media ? { media } : {}),
  };
}

/** What the card says of its relation to the page it is shown on. */
export type ExcerptAboutSide = { relationType: RelationType; note?: string };

/**
 * An excerpt as a card shows it: described by its summary, or else by how
 * its text begins (`describedSummary`). `banner` is its banner when the
 * caller has read it already; an excerpt without one reads nothing.
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
  const [summary, media, parentCard, about] = await Promise.all([
    describedSummary('excerpt', excerpt.excerptUuid, excerpt.summary, own),
    buildPublicCardMedia(
      { type: 'excerpt', parent: parent.address, excerpt },
      own,
      banner,
    ),
    buildPublicExcerptParent(parent, viewer),
    resolvePublicRelated({ type: 'excerpt', id: excerpt.excerptUuid }, viewer),
  ]);
  return {
    title: excerpt.title,
    summary,
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
 * it: the card, its banner and its text.
 */
export async function buildPublicExcerpt(
  excerpt: ExcerptRecord,
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
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
    // Shown whole, it has the summary the owner wrote: its text follows, and
    // would only be said twice.
    summary: excerpt.summary,
    humanReadableSlug: excerpt.humanReadableSlug,
    ...(bannerMedia ? { bannerMedia } : {}),
    content: content ?? { blocks: [] },
    chronology: buildPublicEntityChronology(excerpt),
  };
}

/**
 * A parent's excerpts the viewer may see, in the owner's order. The parent's
 * page is open to whoever asks this, so the private flag counts, and what
 * each is about (`excerptShownWithParent`).
 */
export function visibleParentExcerpts(
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
): ExcerptRecord[] {
  return listExcerpts(parent).filter((excerpt) =>
    excerptShownWithParent(viewer, excerpt, parent),
  );
}

/**
 * A parent's excerpts the viewer may not read, each as its codename where
 * it stands among the ones they may: the parent's side says it has a part
 * closed to them, as the Life does. The codename is the one its point on a
 * chronology goes by.
 *
 * What it is about is named as any relation names its other end to this
 * viewer (`resolvePublicRelated`): a project or an event closed to them by
 * its own codename, a diary entry closed to them not at all. The relation's
 * note is the excerpt's own words and is left out.
 */
export async function secretParentExcerpts(
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
): Promise<PublicExcerptSecret[]> {
  return Promise.all(
    hiddenParentExcerpts(parent, viewer).map(async ({ excerpt, name }) => ({
      ...name,
      about: await buildPublicRelatedLinks(
        (
          await resolvePublicRelated(
            { type: 'excerpt', id: excerpt.excerptUuid },
            viewer,
          )
        ).map(({ note: _note, ...item }) => item),
        viewer,
      ),
    })),
  );
}

/** A closed excerpt by its codename alone, where it stands. */
export type PublicExcerptSecretName = Omit<PublicExcerptSecret, 'about'>;

/**
 * The same excerpts by their codenames alone, without what each is about:
 * what a card of the Life names them by, which reads no relation for it.
 */
export function secretParentExcerptNames(
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
): PublicExcerptSecretName[] {
  return hiddenParentExcerpts(parent, viewer).map(({ name }) => name);
}

function hiddenParentExcerpts(
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
): { excerpt: ExcerptRecord; name: PublicExcerptSecretName }[] {
  const hidden: { excerpt: ExcerptRecord; name: PublicExcerptSecretName }[] =
    [];
  let before = 0;
  for (const excerpt of listExcerpts(parent)) {
    if (excerptShownWithParent(viewer, excerpt, parent)) {
      before += 1;
      continue;
    }
    const secret = buildSecretReference('excerpt', excerpt.excerptUuid);
    hidden.push({
      excerpt,
      name: {
        key: secret.key,
        title: secret.title,
        summary: secret.summary,
        iconMedia: secret.iconMedia,
        before,
      },
    });
  }
  return hidden;
}

/**
 * An excerpt's own page, by its public id: the excerpt, if it opens for the
 * viewer, and the parent's excerpts it is placed among. One about something
 * open by its link only is not shown on its parent's page, but opens by its
 * own address, placed among the others where it stands.
 */
export function findOpenParentExcerpt(
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
  publicId: string,
): { excerpt: ExcerptRecord; visible: ExcerptRecord[] } | undefined {
  const all = listExcerpts(parent);
  const excerpt = all.find((item) => item.publicId === publicId);
  if (!excerpt || !excerptOpens(viewer, excerpt, parent)) return undefined;
  const visible = all.filter(
    (item) => item === excerpt || excerptShownWithParent(viewer, item, parent),
  );
  return { excerpt, visible };
}

/** A parent's excerpts, whole, as its page embeds them. */
export async function buildParentExcerpts(
  parent: ExcerptParentInfo,
  viewer: PublicViewer,
): Promise<PublicExcerpt[]> {
  const visible = visibleParentExcerpts(parent, viewer);
  return Promise.all(
    visible.map((excerpt) => buildPublicExcerpt(excerpt, parent, viewer)),
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
 * by the day each stands on, then by when the excerpt was written.
 *
 * Listed only where the parent may be listed and the excerpt is not private,
 * or on the parent's private side — the page's own entity is the one the
 * visitor opened; for a visitor, an excerpt of a day still to come
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
  const parents = loadExcerptParents(
    rows.map((excerpt) => ({ type: excerpt.parentType, id: excerpt.parentId })),
    now,
  );
  const items: PublicExcerptAboutItem[] = [];
  for (const excerpt of rows) {
    const parent = parents.get(
      relationEndpointKey({ type: excerpt.parentType, id: excerpt.parentId }),
    );
    if (!parent) continue;
    if (!excerptListed(viewer, excerpt, parent, { onSubjectPage: true }))
      continue;
    if (!excerptIsOwn(viewer, parent) && parent.arrives > now) continue;
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

/**
 * By the day each stands on a chronology (`excerptDay`): an excerpt of a
 * project, which has no day of its own, by the day it was written — so the
 * latest few a project's page shows are the latest, whatever they are part of.
 */
function compareNewestFirst(
  left: PublicExcerptAboutItem,
  right: PublicExcerptAboutItem,
) {
  const byDay = excerptDay(right.excerpt, right.parent).localeCompare(
    excerptDay(left.excerpt, left.parent),
  );
  if (byDay) return byDay;
  return (
    right.excerpt.createdAt - left.excerpt.createdAt ||
    left.excerpt.excerptUuid.localeCompare(right.excerpt.excerptUuid)
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
  pageSize = PUBLIC_EXCERPTS_PAGE_SIZE,
): Promise<PublicExcerptsPage> {
  const items = await resolvePublicExcerptsAbout(target, viewer);
  const paged = paginate(items, page, pageSize);
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
