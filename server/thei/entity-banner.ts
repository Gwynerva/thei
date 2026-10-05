import { and, eq, inArray } from 'drizzle-orm';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import {
  buildAdminAssetUrls,
  buildPublicEventMedia,
  buildPublicProjectSectionMedia,
} from './assets/urls';
import type { StoredAssetRecord } from './assets/storage';
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

/** An event or a section, with what its public addresses are built from. */
export type BannerHolder =
  | { type: 'event'; event: Addressed & { eventUuid: string } }
  | {
      type: 'project-section';
      project: Addressed;
      section: Addressed & { sectionUuid: string };
    };

function holderId(holder: BannerHolder) {
  return holder.type === 'event'
    ? holder.event.eventUuid
    : holder.section.sectionUuid;
}

/** The banner's file, read by the one placement that holds it. */
export async function findEntityBannerAsset(
  ownerType: BannerOwner,
  ownerId: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ asset: schema.assets })
    .from(schema.assetUsages)
    .innerJoin(
      schema.assets,
      eq(schema.assets.assetUuid, schema.assetUsages.assetUuid),
    )
    .where(
      and(
        eq(schema.assetUsages.containerType, ownerType),
        eq(schema.assetUsages.containerId, ownerId),
        eq(schema.assetUsages.role, 'banner'),
      ),
    )
    .get()?.asset;
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

/**
 * The banner as its owner's page serves it. A caller that holds the banner
 * already — or knows there is none, `null` — passes it, and nothing is read.
 */
export async function buildPublicBanner(
  holder: BannerHolder,
  banner?: StoredAssetRecord | null,
): Promise<MediaDescriptor | undefined> {
  const asset =
    banner === undefined
      ? await findEntityBannerAsset(holder.type, holderId(holder))
      : banner;
  if (!asset) return undefined;
  return holder.type === 'event'
    ? await buildPublicEventMedia(holder.event, asset, 'banner')
    : await buildPublicProjectSectionMedia(
        holder.project,
        holder.section,
        asset,
        'banner',
      );
}

/** What stands for an event or a section in a card: its banner, else its body's picture. */
export async function buildPublicCardMedia(
  holder: BannerHolder,
  includePrivate = false,
  banner?: StoredAssetRecord | null,
): Promise<MediaDescriptor> {
  return (
    (await buildPublicBanner(holder, banner)) ??
    (holder.type === 'event'
      ? buildPublicEntityPreviewMedia(
          'event',
          holder.event.eventUuid,
          'event-body',
          { type: 'event', ...holder.event },
          includePrivate,
        )
      : buildPublicEntityPreviewMedia(
          'project-section',
          holder.section.sectionUuid,
          'project-section-body',
          { type: 'project', ...holder.project },
          includePrivate,
        ))
  );
}
