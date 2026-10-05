import { and, eq, inArray } from 'drizzle-orm';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import {
  buildAdminAssetUrls,
  buildPublicEventMedia,
  buildPublicProjectSectionMedia,
} from './assets/urls';
import { buildPublicEntityPreviewMedia } from './public/content';

/**
 * Banners of events and sections.
 *
 * A banner is the picture an event or a section chose to be known by: its
 * page opens with it, and wherever the thing is shown as a card — a timeline,
 * a related block, a link — it stands for it ahead of the first picture of
 * its body. Like a project's, it is a placement of the `banner` role on the
 * thing itself; a project keeps its icon on cards.
 */

type BannerOwner = 'event' | 'project-section';
type Addressed = { humanReadableSlug: string; publicId: string };

export async function findEntityBannerAsset(
  ownerType: BannerOwner,
  ownerId: string,
) {
  return (
    await THEI_SERVER.assets.usages.findByContainer(ownerType, ownerId)
  ).find((usage) => usage.role === 'banner')?.asset;
}

/**
 * Points the banner of an event or a section at `next` inside the caller's
 * transaction: the former placement goes, the new one comes. Says whether
 * anything changed.
 */
export function syncEntityBanner(
  tx: any,
  schema: any,
  ownerType: BannerOwner,
  ownerId: string,
  current: string | undefined,
  next: string | undefined,
): boolean {
  if (current === next) return false;
  if (current) deleteEntityBanners(tx, schema, ownerType, [ownerId]);
  if (next)
    tx.insert(schema.assetUsages)
      .values({
        assetUuid: next,
        containerType: ownerType,
        containerId: ownerId,
        role: 'banner',
      })
      .onConflictDoNothing()
      .run();
  return true;
}

/** Drops the banners of events or sections that are going away. */
export function deleteEntityBanners(
  tx: any,
  schema: any,
  ownerType: BannerOwner,
  ownerIds: string[],
) {
  if (!ownerIds.length) return;
  tx.delete(schema.assetUsages)
    .where(
      and(
        eq(schema.assetUsages.containerType, ownerType),
        inArray(schema.assetUsages.containerId, ownerIds),
        eq(schema.assetUsages.role, 'banner'),
      ),
    )
    .run();
}

/** The banner of each of these, by the owner's id. */
export function readEntityBannerUuids(
  db: any,
  schema: any,
  ownerType: BannerOwner,
  ownerIds: string[],
): Map<string, string> {
  if (!ownerIds.length) return new Map();
  const rows: { containerId: string; assetUuid: string }[] = db
    .select({
      containerId: schema.assetUsages.containerId,
      assetUuid: schema.assetUsages.assetUuid,
    })
    .from(schema.assetUsages)
    .where(
      and(
        eq(schema.assetUsages.containerType, ownerType),
        inArray(schema.assetUsages.containerId, ownerIds),
        eq(schema.assetUsages.role, 'banner'),
      ),
    )
    .all();
  return new Map(rows.map((row) => [row.containerId, row.assetUuid]));
}

/** As the admin sees it, by the asset's own address. */
export async function buildAdminEntityBanner(
  ownerType: BannerOwner,
  ownerId: string,
): Promise<MediaDescriptor | undefined> {
  const asset = await findEntityBannerAsset(ownerType, ownerId);
  return asset ? (await buildAdminAssetUrls(asset)).media : undefined;
}

export async function buildPublicEventBanner(
  event: Addressed & { eventUuid: string },
): Promise<MediaDescriptor | undefined> {
  const asset = await findEntityBannerAsset('event', event.eventUuid);
  return asset ? buildPublicEventMedia(event, asset, 'banner') : undefined;
}

export async function buildPublicSectionBanner(
  project: Addressed,
  section: Addressed & { sectionUuid: string },
): Promise<MediaDescriptor | undefined> {
  const asset = await findEntityBannerAsset(
    'project-section',
    section.sectionUuid,
  );
  return asset
    ? buildPublicProjectSectionMedia(project, section, asset, 'banner')
    : undefined;
}

/** What stands for an event in a card: its banner, else its body's picture. */
export async function buildPublicEventCardMedia(
  event: Addressed & { eventUuid: string },
  includePrivate = false,
): Promise<MediaDescriptor> {
  return (
    (await buildPublicEventBanner(event)) ??
    buildPublicEntityPreviewMedia(
      'event',
      event.eventUuid,
      'event-body',
      { type: 'event', ...event },
      includePrivate,
    )
  );
}

/** What stands for a section in a card: its banner, else its body's picture. */
export async function buildPublicSectionCardMedia(
  project: Addressed,
  section: Addressed & { sectionUuid: string },
  includePrivate = false,
): Promise<MediaDescriptor> {
  return (
    (await buildPublicSectionBanner(project, section)) ??
    buildPublicEntityPreviewMedia(
      'project-section',
      section.sectionUuid,
      'project-section-body',
      { type: 'project', ...project },
      includePrivate,
    )
  );
}
