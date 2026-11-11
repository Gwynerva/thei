import type { MediaDescriptor } from '#layers/thei/shared/media';
import type { ExcerptParentAddress } from '#layers/thei/shared/excerpt-url';
import { opensPrivate, type PublicViewer } from '../access-links/viewer';
import type { StoredAssetRecord } from '../assets/storage';
import { findPublicCardMedia } from '../entity-banner';
import { listExcerpts, type ExcerptRecord } from '../excerpts';
import { excerptIsOwn, excerptShownWithParent } from '../excerpts/parents';
import { resolveEntityIconMedia } from '../media/generated-icon';
import { buildPublicContentPreviewMedia } from './content';

/**
 * What stands for an event or a diary entry in a card, a tile or a link.
 *
 * Its own first: an event's banner, else the first picture of its text. With
 * neither, its excerpts are asked in the owner's order — each its banner,
 * else the first picture of its text — until one has a picture; an entry may
 * be nothing but its excerpts, and would otherwise never have one. Only then
 * the drawn icon of its kind.
 *
 * An excerpt the viewer is not shown on the parent's page gives nothing: a
 * private one, or one about something they may not see listed
 * (`excerptShownWithParent`), and the private parts of its text are for the
 * parent's private side alone. That is no wider than what the excerpt's
 * files are served by, so a picture a card names always opens for whoever
 * was given the card.
 */

/** An event or a diary entry, with the address its excerpts are served from. */
export type MediaParent = {
  type: 'event' | 'diary-entry';
  id: string;
  address: ExcerptParentAddress;
};

type EventHolder = {
  eventUuid: string;
  humanReadableSlug: string;
  publicId: string;
};
type DiaryHolder = { diaryUuid: string; date: string };

export function eventMediaParent(event: EventHolder): MediaParent {
  return {
    type: 'event',
    id: event.eventUuid,
    address: {
      type: 'event',
      humanReadableSlug: event.humanReadableSlug,
      publicId: event.publicId,
    },
  };
}

export function diaryMediaParent(entry: DiaryHolder): MediaParent {
  return {
    type: 'diary-entry',
    id: entry.diaryUuid,
    address: { type: 'diary-entry', date: entry.date },
  };
}

/**
 * The first picture among a parent's excerpts the viewer is shown on its
 * page, in the owner's order: each is asked through `pictureOf` until one has
 * a picture. The one walk for every form a picture takes — a card's
 * descriptor here, the file an Open Graph card draws.
 */
export async function firstExcerptPicture<Picture>(
  parent: Pick<MediaParent, 'type' | 'id'>,
  viewer: PublicViewer,
  pictureOf: (excerpt: ExcerptRecord) => Promise<Picture | undefined>,
): Promise<Picture | undefined> {
  for (const excerpt of listExcerpts(parent)) {
    if (!excerptShownWithParent(viewer, excerpt, parent)) continue;
    const picture = await pictureOf(excerpt);
    if (picture) return picture;
  }
  return undefined;
}

/** The first picture among a parent's excerpts the viewer is shown, or nothing. */
export async function findExcerptsMedia(
  parent: MediaParent,
  viewer: PublicViewer,
): Promise<MediaDescriptor | undefined> {
  const own = excerptIsOwn(viewer, parent);
  return firstExcerptPicture(parent, viewer, (excerpt) =>
    findPublicCardMedia(
      { type: 'excerpt', parent: parent.address, excerpt },
      own,
      excerpt.bannerAssetUuid ? undefined : null,
    ),
  );
}

/**
 * An event's picture. `banner` is its banner when the caller has read it
 * already, `null` when it knows there is none.
 */
export async function buildPublicEventCardMedia(
  event: EventHolder,
  viewer: PublicViewer,
  banner?: StoredAssetRecord | null,
): Promise<MediaDescriptor> {
  return resolveEntityIconMedia(
    'event',
    event.eventUuid,
    (await findPublicCardMedia(
      { type: 'event', event },
      opensPrivate(viewer, 'event', event.eventUuid),
      banner,
    )) ?? (await findExcerptsMedia(eventMediaParent(event), viewer)),
  );
}

/** A diary entry's picture: it has no banner. */
export async function buildPublicDiaryCardMedia(
  entry: DiaryHolder,
  viewer: PublicViewer,
): Promise<MediaDescriptor> {
  return resolveEntityIconMedia(
    'diary-entry',
    entry.diaryUuid,
    (await buildPublicContentPreviewMedia(
      'diary-entry',
      entry.diaryUuid,
      'diary-body',
      { type: 'diary-entry', date: entry.date },
      opensPrivate(viewer, 'diary-entry', entry.diaryUuid),
    )) ?? (await findExcerptsMedia(diaryMediaParent(entry), viewer)),
  );
}
